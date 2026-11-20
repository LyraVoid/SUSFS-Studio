use crate::archive::{Envelope, MAX_ARCHIVE, validate_envelope};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::CString;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const RECEIPT_MAX: u64 = 4096;
const STAGE_MAX_AGE: u64 = 60 * 60;

pub struct Store {
    root: PathBuf,
    dir: File,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub revision: String,
    pub saved_at: String,
    pub bytes: u64,
}

pub struct Stored {
    pub bytes: Vec<u8>,
    pub revision: String,
    pub receipt: Option<Receipt>,
}

pub struct Prepared {
    pub token: String,
    pub upload_path: String,
    pub baseline: Option<String>,
    pub revision: Option<String>,
}

#[derive(Debug)]
pub enum SaveError {
    BeforeCommit(io::Error),
    ResultUnknown(io::Error),
}

impl From<io::Error> for SaveError {
    fn from(error: io::Error) -> Self {
        Self::BeforeCommit(error)
    }
}

fn open_at(dir: &File, name: &CString, flags: i32, mode: u32) -> io::Result<File> {
    let fd = unsafe {
        libc::openat(
            dir.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            mode,
        )
    };
    if fd < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}

fn open_name(dir: &File, name: &str, flags: i32, mode: u32) -> io::Result<File> {
    let name = CString::new(name).map_err(|_| io::ErrorKind::InvalidInput)?;
    open_at(dir, &name, flags, mode)
}

fn trusted(file: &File, directory: bool) -> io::Result<()> {
    let metadata = file.metadata()?;
    if (directory && !metadata.is_dir())
        || (!directory && (!metadata.is_file() || metadata.nlink() != 1))
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.permissions().mode() & 0o077 != 0
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "untrusted store object",
        ));
    }
    Ok(())
}

fn read_limited(file: &File, maximum: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    file.take(maximum + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > maximum {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "stored object is too large",
        ));
    }
    Ok(bytes)
}

fn valid_archive(bytes: &[u8]) -> bool {
    bytes.len() <= MAX_ARCHIVE
        && matches!(
            std::str::from_utf8(bytes).ok().map(validate_envelope),
            Some(Envelope::Valid)
        )
}

fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn now_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn valid_token(token: &str) -> bool {
    token.len() == 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn random_token() -> io::Result<String> {
    let mut nonce = [0_u8; 16];
    File::open("/dev/urandom")?.read_exact(&mut nonce)?;
    Ok(nonce.iter().map(|byte| format!("{byte:02x}")).collect())
}

impl Store {
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn open(path: &Path) -> io::Result<Self> {
        let dir = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)?;
        trusted(&dir, true)?;
        Ok(Self {
            root: path.to_owned(),
            dir,
        })
    }

    #[cfg_attr(not(any(test, target_os = "android")), allow(dead_code))]
    pub fn open_or_create(path: &Path) -> io::Result<Self> {
        let created = match DirBuilder::new().mode(0o700).create(path) {
            Ok(()) => true,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => false,
            Err(error) => return Err(error),
        };
        let store = Self::open(path)?;
        if created {
            store.dir.sync_all()?;
        }
        Ok(store)
    }

    fn lock(&self) -> io::Result<File> {
        let lock = open_name(
            &self.dir,
            ".lock",
            libc::O_RDWR | libc::O_CREAT | libc::O_NONBLOCK,
            0o600,
        )?;
        trusted(&lock, false)?;
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(lock)
    }

    fn staging(&self) -> io::Result<File> {
        if let Err(error) = open_name(&self.dir, ".staging", libc::O_RDONLY | libc::O_DIRECTORY, 0)
        {
            if error.kind() != io::ErrorKind::NotFound {
                return Err(error);
            }
            let name = c".staging";
            if unsafe { libc::mkdirat(self.dir.as_raw_fd(), name.as_ptr(), 0o700) } != 0 {
                let error = io::Error::last_os_error();
                if error.kind() != io::ErrorKind::AlreadyExists {
                    return Err(error);
                }
            }
        }
        let staging = open_name(&self.dir, ".staging", libc::O_RDONLY | libc::O_DIRECTORY, 0)?;
        trusted(&staging, true)?;
        Ok(staging)
    }

    fn read_archive_unlocked(&self) -> io::Result<Option<Vec<u8>>> {
        let file = match open_name(
            &self.dir,
            "archive.json",
            libc::O_RDONLY | libc::O_NONBLOCK,
            0,
        ) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        trusted(&file, false)?;
        let bytes = read_limited(&file, MAX_ARCHIVE as u64)?;
        if !valid_archive(&bytes) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "saved archive is invalid",
            ));
        }
        Ok(Some(bytes))
    }

    fn read_receipt_unlocked(&self, archive: &[u8]) -> Option<Receipt> {
        let file = open_name(
            &self.dir,
            "receipt.json",
            libc::O_RDONLY | libc::O_NONBLOCK,
            0,
        )
        .ok()?;
        trusted(&file, false).ok()?;
        let bytes = read_limited(&file, RECEIPT_MAX).ok()?;
        let receipt: Receipt = serde_json::from_slice(&bytes).ok()?;
        (receipt.revision == revision(archive)
            && receipt.bytes == archive.len() as u64
            && !receipt.saved_at.is_empty()
            && receipt.saved_at.bytes().all(|byte| byte.is_ascii_digit()))
        .then_some(receipt)
    }

    pub fn read(&self) -> io::Result<Option<Stored>> {
        let _lock = self.lock()?;
        let Some(bytes) = self.read_archive_unlocked()? else {
            return Ok(None);
        };
        let receipt = self.read_receipt_unlocked(&bytes);
        Ok(Some(Stored {
            revision: revision(&bytes),
            bytes,
            receipt,
        }))
    }

    fn cleanup_stage(&self, staging: &File) -> io::Result<()> {
        let path = PathBuf::from(format!("/proc/self/fd/{}", staging.as_raw_fd()));
        let now = SystemTime::now();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            let candidate = name.strip_prefix('.').unwrap_or(name);
            let Some(token) = candidate
                .strip_suffix(".base")
                .or_else(|| candidate.strip_suffix(".input"))
            else {
                continue;
            };
            if !valid_token(token) || !entry.file_type()?.is_file() {
                continue;
            }
            let metadata = entry.metadata()?;
            let modified = metadata.mtime().max(0) as u64;
            let age = now
                .duration_since(UNIX_EPOCH + Duration::from_secs(modified))
                .unwrap_or_default();
            if age.as_secs() > STAGE_MAX_AGE {
                let name = CString::new(name).map_err(|_| io::ErrorKind::InvalidInput)?;
                if unsafe { libc::unlinkat(staging.as_raw_fd(), name.as_ptr(), 0) } != 0 {
                    return Err(io::Error::last_os_error());
                }
            }
        }
        Ok(())
    }

    fn write_stage_file(dir: &File, name: &str, bytes: &[u8]) -> io::Result<File> {
        let mut file = open_name(
            dir,
            name,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            0o600,
        )?;
        trusted(&file, false)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        Ok(file)
    }

    pub fn prepare(&self) -> io::Result<Prepared> {
        let _lock = self.lock()?;
        let archive = self.read_archive_unlocked()?;
        let staging = self.staging()?;
        self.cleanup_stage(&staging)?;
        let token = loop {
            let token = random_token()?;
            if !self.stage_exists(&token) {
                break token;
            }
        };
        let base_name = format!(".{token}.base");
        let input_name = format!("{token}.input");
        let mut baseline = Vec::with_capacity(archive.as_ref().map_or(1, |bytes| bytes.len() + 1));
        baseline.push(u8::from(archive.is_some()));
        if let Some(bytes) = &archive {
            baseline.extend_from_slice(bytes);
        }
        let base = Self::write_stage_file(&staging, &base_name, &baseline)?;
        let input = match Self::write_stage_file(&staging, &input_name, &[]) {
            Ok(input) => input,
            Err(error) => {
                drop(base);
                let _ = self.remove_stage(&staging, &token);
                return Err(error);
            }
        };
        let result = (|| {
            staging.sync_all()?;
            Ok(Prepared {
                token: token.clone(),
                upload_path: self
                    .root
                    .join(".staging")
                    .join(format!("{token}.input"))
                    .to_string_lossy()
                    .into_owned(),
                baseline: archive
                    .as_ref()
                    .map(|bytes| String::from_utf8(bytes.clone()))
                    .transpose()
                    .map_err(|_| io::ErrorKind::InvalidData)?,
                revision: archive.as_deref().map(revision),
            })
        })();
        if result.is_err() {
            drop(base);
            drop(input);
            let _ = self.remove_stage(&staging, &token);
        }
        result
    }

    fn stage_exists(&self, token: &str) -> bool {
        self.root
            .join(".staging")
            .join(format!("{token}.input"))
            .exists()
            || self
                .root
                .join(".staging")
                .join(format!(".{token}.base"))
                .exists()
    }

    fn remove_stage(&self, staging: &File, token: &str) -> io::Result<()> {
        for name in [format!(".{token}.base"), format!("{token}.input")] {
            let name = CString::new(name).map_err(|_| io::ErrorKind::InvalidInput)?;
            if unsafe { libc::unlinkat(staging.as_raw_fd(), name.as_ptr(), 0) } != 0 {
                let error = io::Error::last_os_error();
                if error.kind() != io::ErrorKind::NotFound {
                    return Err(error);
                }
            }
        }
        staging.sync_all()
    }

    fn read_stage(&self, staging: &File, token: &str) -> io::Result<(Option<Vec<u8>>, Vec<u8>)> {
        let base = open_name(
            staging,
            &format!(".{token}.base"),
            libc::O_RDONLY | libc::O_NONBLOCK,
            0,
        )?;
        trusted(&base, false)?;
        let baseline = read_limited(&base, MAX_ARCHIVE as u64 + 1)?;
        let (flag, bytes) = baseline
            .split_first()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "empty stage baseline"))?;
        let expected = match flag {
            0 if bytes.is_empty() => None,
            1 if valid_archive(bytes) => Some(bytes.to_vec()),
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "invalid stage baseline",
                ));
            }
        };
        let input = open_name(
            staging,
            &format!("{token}.input"),
            libc::O_RDONLY | libc::O_NONBLOCK,
            0,
        )?;
        trusted(&input, false)?;
        let before = input.metadata()?;
        let candidate = read_limited(&input, MAX_ARCHIVE as u64)?;
        let after = input.metadata()?;
        if before.len() != after.len()
            || before.mtime() != after.mtime()
            || before.mtime_nsec() != after.mtime_nsec()
            || before.ctime() != after.ctime()
            || before.ctime_nsec() != after.ctime_nsec()
        {
            return Err(io::Error::new(
                io::ErrorKind::ResourceBusy,
                "stage changed while reading",
            ));
        }
        if !valid_archive(&candidate) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "staged archive is invalid",
            ));
        }
        Ok((expected, candidate))
    }

    pub fn save_staged(&self, token: &str) -> Result<Receipt, SaveError> {
        if !valid_token(token) {
            return Err(io::Error::from(io::ErrorKind::InvalidInput).into());
        }
        let _lock = self.lock()?;
        let current = self.read_archive_unlocked()?;
        let staging = self.staging()?;
        let (expected, input) = self.read_stage(&staging, token)?;
        if current.as_deref() != expected.as_deref() {
            let _ = self.remove_stage(&staging, token);
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "revision conflict").into());
        }
        self.remove_stage(&staging, token)?;
        let receipt = self.save_locked(&input, File::sync_all)?;
        Ok(receipt)
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn save(&self, expected: Option<&[u8]>, input: &[u8]) -> Result<Receipt, SaveError> {
        self.save_with_sync(expected, input, File::sync_all)
    }

    fn save_locked(
        &self,
        input: &[u8],
        sync_directory: impl Fn(&File) -> io::Result<()>,
    ) -> Result<Receipt, SaveError> {
        self.commit_file("archive.json", input, &sync_directory)?;
        let receipt = Receipt {
            revision: revision(input),
            saved_at: now_millis(),
            bytes: input.len() as u64,
        };
        let serialized = serde_json::to_vec(&receipt).map_err(|error| {
            SaveError::ResultUnknown(io::Error::new(io::ErrorKind::InvalidData, error))
        })?;
        self.commit_file("receipt.json", &serialized, &sync_directory)
            .map_err(|error| match error {
                SaveError::BeforeCommit(error) | SaveError::ResultUnknown(error) => {
                    SaveError::ResultUnknown(error)
                }
            })?;
        Ok(receipt)
    }

    #[cfg_attr(not(test), allow(dead_code))]
    fn save_with_sync(
        &self,
        expected: Option<&[u8]>,
        input: &[u8],
        sync_directory: impl Fn(&File) -> io::Result<()>,
    ) -> Result<Receipt, SaveError> {
        if !valid_archive(input) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid archive").into());
        }
        let _lock = self.lock()?;
        let current = self.read_archive_unlocked()?;
        if current.as_deref() != expected {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "revision conflict").into());
        }
        self.save_locked(input, sync_directory)
    }

    fn commit_file(
        &self,
        target: &str,
        input: &[u8],
        sync_directory: &impl Fn(&File) -> io::Result<()>,
    ) -> Result<(), SaveError> {
        self.commit_file_with(
            target,
            input,
            |file, input| file.write_all(input),
            File::sync_all,
            sync_directory,
        )
    }

    fn commit_file_with(
        &self,
        target: &str,
        input: &[u8],
        write: impl Fn(&mut File, &[u8]) -> io::Result<()>,
        sync_file: impl Fn(&File) -> io::Result<()>,
        sync_directory: &impl Fn(&File) -> io::Result<()>,
    ) -> Result<(), SaveError> {
        let nonce = random_token()?;
        let name = format!(".{target}.{nonce}.tmp");
        let mut file = open_name(
            &self.dir,
            &name,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            0o600,
        )?;
        trusted(&file, false)?;
        let result = (|| {
            write(&mut file, input)?;
            sync_file(&file)?;
            let old = CString::new(name.as_str()).unwrap();
            let new = CString::new(target).unwrap();
            if unsafe {
                libc::renameat(
                    self.dir.as_raw_fd(),
                    old.as_ptr(),
                    self.dir.as_raw_fd(),
                    new.as_ptr(),
                )
            } != 0
            {
                return Err(io::Error::last_os_error().into());
            }
            sync_directory(&self.dir).map_err(SaveError::ResultUnknown)
        })();
        if matches!(result, Err(SaveError::BeforeCommit(_))) {
            let name = CString::new(name).unwrap();
            unsafe {
                libc::unlinkat(self.dir.as_raw_fd(), name.as_ptr(), 0);
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn fixture() -> &'static [u8] {
        include_bytes!("../../contracts/archive-v1.json")
    }

    fn test_store(name: &str) -> (PathBuf, Store) {
        let dir = std::env::temp_dir().join(format!(
            "studio-store-{name}-{}-{}",
            std::process::id(),
            random_token().unwrap()
        ));
        let store = Store::open_or_create(&dir).unwrap();
        (dir, store)
    }

    fn cleanup(dir: PathBuf) {
        fn remove_tree(path: &Path) {
            for entry in fs::read_dir(path).unwrap() {
                let entry = entry.unwrap();
                if entry.file_type().unwrap().is_dir() {
                    remove_tree(&entry.path());
                } else {
                    fs::remove_file(entry.path()).unwrap();
                }
            }
            fs::remove_dir(path).unwrap();
        }
        remove_tree(&dir);
    }

    #[test]
    fn failed_directory_sync_reports_unknown_and_keeps_a_valid_archive() {
        let (dir, store) = test_store("sync");
        let result =
            store.save_with_sync(None, fixture(), |_| Err(io::Error::other("sync failed")));
        assert!(matches!(result, Err(SaveError::ResultUnknown(_))));
        let stored = store.read().unwrap().unwrap();
        assert_eq!(stored.bytes, fixture());
        assert_eq!(stored.revision, revision(fixture()));
        assert!(stored.receipt.is_none());
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn stale_temp_file_does_not_block_save_or_get_removed() {
        let (dir, store) = test_store("stale");
        let stale = dir.join(".archive.stale.tmp");
        fs::write(&stale, b"prior transaction").unwrap();
        fs::set_permissions(&stale, fs::Permissions::from_mode(0o600)).unwrap();
        store.save(None, fixture()).unwrap();
        assert_eq!(fs::read(&stale).unwrap(), b"prior transaction");
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn write_and_file_sync_failures_leave_no_partial_archive() {
        for (label, write, sync_file) in [
            (
                "space",
                Box::new(|_: &mut File, _: &[u8]| Err(io::Error::from_raw_os_error(libc::ENOSPC)))
                    as Box<dyn Fn(&mut File, &[u8]) -> io::Result<()>>,
                Box::new(File::sync_all) as Box<dyn Fn(&File) -> io::Result<()>>,
            ),
            (
                "file-sync",
                Box::new(|file: &mut File, input: &[u8]| file.write_all(input))
                    as Box<dyn Fn(&mut File, &[u8]) -> io::Result<()>>,
                Box::new(|_: &File| Err(io::Error::other("file sync failed")))
                    as Box<dyn Fn(&File) -> io::Result<()>>,
            ),
        ] {
            let (dir, store) = test_store(label);
            let result = store.commit_file_with(
                "archive.json",
                fixture(),
                write,
                sync_file,
                &File::sync_all,
            );
            assert!(matches!(result, Err(SaveError::BeforeCommit(_))));
            assert!(!dir.join("archive.json").exists());
            assert!(fs::read_dir(&dir).unwrap().all(|entry| {
                !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")
            }));
            drop(store);
            cleanup(dir);
        }
    }

    #[test]
    fn prepare_preserves_unrelated_atomic_temp_files() {
        let (dir, store) = test_store("startup-cleanup");
        let token = random_token().unwrap();
        for target in ["archive.json", "receipt.json"] {
            let path = dir.join(format!(".{target}.{token}.tmp"));
            fs::write(&path, fixture()).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        }
        store.prepare().unwrap();
        for target in ["archive.json", "receipt.json"] {
            assert_eq!(
                fs::read(dir.join(format!(".{target}.{token}.tmp"))).unwrap(),
                fixture()
            );
        }
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn concurrent_writer_reports_busy_without_touching_the_archive() {
        let (dir, store) = test_store("busy");
        store.save(None, fixture()).unwrap();
        let lock = store.lock().unwrap();
        assert_eq!(
            match store.save(Some(fixture()), fixture()).unwrap_err() {
                SaveError::BeforeCommit(error) => error.kind(),
                SaveError::ResultUnknown(error) => panic!("unexpected result: {error}"),
            },
            io::ErrorKind::WouldBlock
        );
        assert_eq!(store_archive(&dir).len(), fixture().len());
        drop(lock);
        drop(store);
        cleanup(dir);
    }

    fn store_archive(dir: &Path) -> Vec<u8> {
        fs::read(dir.join("archive.json")).unwrap()
    }

    #[test]
    fn staged_writer_child() {
        let Ok(path) = std::env::var("STUDIO_TEST_STORE") else {
            return;
        };
        let token = std::env::var("STUDIO_TEST_TOKEN").unwrap();
        let expected = std::env::var("STUDIO_TEST_RESULT").unwrap();
        let store = Store::open(Path::new(&path)).unwrap();
        match store.save_staged(&token) {
            Ok(_) => assert_eq!(expected, "saved"),
            Err(SaveError::BeforeCommit(error)) => {
                assert_eq!(expected, "conflict");
                assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
            }
            Err(error) => panic!("unexpected result: {error:?}"),
        }
    }

    #[test]
    #[ignore = "run process tests serially"]
    fn independent_processes_do_not_overwrite_a_newer_revision() {
        let (dir, store) = test_store("process-conflict");
        store.save(None, fixture()).unwrap();
        let first = store.prepare().unwrap();
        let second = store.prepare().unwrap();
        let newer = br#"{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]},"newer":true}"#;
        fs::write(&first.upload_path, newer).unwrap();
        fs::write(&second.upload_path, fixture()).unwrap();
        for (token, result) in [(&first.token, "saved"), (&second.token, "conflict")] {
            let status = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "store::tests::staged_writer_child"])
                .env("STUDIO_TEST_STORE", &dir)
                .env("STUDIO_TEST_TOKEN", token)
                .env("STUDIO_TEST_RESULT", result)
                .status()
                .unwrap();
            assert!(status.success());
        }
        let stored = store.read().unwrap().unwrap();
        assert_eq!(stored.bytes, newer);
        assert_eq!(stored.receipt.unwrap().revision, revision(newer));
        assert!(!Path::new(&first.upload_path).exists());
        assert!(!Path::new(&second.upload_path).exists());
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn interrupted_writer_child() {
        let Ok(path) = std::env::var("STUDIO_CRASH_STORE") else {
            return;
        };
        let phase = std::env::var("STUDIO_CRASH_PHASE").unwrap();
        let store = Store::open(Path::new(&path)).unwrap();
        let _lock = store.lock().unwrap();
        let _ = store.commit_file_with(
            "archive.json",
            fixture(),
            |file, input| {
                file.write_all(input)?;
                if phase == "write" {
                    std::process::exit(71);
                }
                Ok(())
            },
            |file| {
                file.sync_all()?;
                if phase == "file-sync" {
                    std::process::exit(72);
                }
                Ok(())
            },
            &|dir| {
                if phase == "rename" {
                    std::process::exit(73);
                }
                dir.sync_all()
            },
        );
        panic!("interruption not reached");
    }

    #[test]
    #[ignore = "run process tests serially"]
    fn interrupted_process_preserves_old_or_complete_new_archive() {
        let old = br#"{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        for (phase, code) in [("write", 71), ("file-sync", 72), ("rename", 73)] {
            let (dir, store) = test_store(phase);
            store.save(None, old).unwrap();
            let old_receipt = fs::read(dir.join("receipt.json")).unwrap();
            let status = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "store::tests::interrupted_writer_child"])
                .env("STUDIO_CRASH_STORE", &dir)
                .env("STUDIO_CRASH_PHASE", phase)
                .status()
                .unwrap();
            assert_eq!(status.code(), Some(code));
            let stored = store.read().unwrap().unwrap();
            assert_eq!(
                stored.bytes,
                if phase == "rename" { fixture() } else { old }
            );
            assert_eq!(fs::read(dir.join("receipt.json")).unwrap(), old_receipt);
            assert_eq!(stored.receipt.is_some(), phase != "rename");
            let temps = fs::read_dir(&dir)
                .unwrap()
                .filter(|entry| {
                    entry
                        .as_ref()
                        .unwrap()
                        .file_name()
                        .to_string_lossy()
                        .ends_with(".tmp")
                })
                .count();
            assert_eq!(temps, usize::from(phase != "rename"));
            drop(store);
            cleanup(dir);
        }
    }

    #[test]
    fn staged_round_trip_consumes_input_and_preserves_unknown_fields() {
        let (dir, store) = test_store("staged");
        let prepared = store.prepare().unwrap();
        assert!(prepared.baseline.is_none());
        fs::write(&prepared.upload_path, fixture()).unwrap();
        fs::set_permissions(&prepared.upload_path, fs::Permissions::from_mode(0o600)).unwrap();
        let receipt = store.save_staged(&prepared.token).unwrap();
        assert_eq!(receipt.revision, revision(fixture()));
        let stored = store.read().unwrap().unwrap();
        assert_eq!(stored.bytes, fixture());
        assert_eq!(stored.receipt, Some(receipt));
        assert!(!Path::new(&prepared.upload_path).exists());
        assert_eq!(
            match store.save_staged(&prepared.token).unwrap_err() {
                SaveError::BeforeCommit(error) => error.kind(),
                SaveError::ResultUnknown(error) => panic!("unexpected result: {error}"),
            },
            io::ErrorKind::NotFound
        );
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn revision_conflict_preserves_newer_archive_and_cleans_stage() {
        let (dir, store) = test_store("conflict");
        store.save(None, fixture()).unwrap();
        let prepared = store.prepare().unwrap();
        let newer = br#"{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]},"newer":true}"#;
        store.save(Some(fixture()), newer).unwrap();
        fs::write(&prepared.upload_path, newer).unwrap();
        assert_eq!(
            match store.save_staged(&prepared.token).unwrap_err() {
                SaveError::BeforeCommit(error) => error.kind(),
                SaveError::ResultUnknown(error) => panic!("unexpected result: {error}"),
            },
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(store.read().unwrap().unwrap().bytes, newer);
        assert!(!Path::new(&prepared.upload_path).exists());
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn rejects_unsafe_root_permissions_symlinks_hard_links_and_blocking_files() {
        let unsafe_dir = std::env::temp_dir().join(format!(
            "studio-store-permissions-{}-{}",
            std::process::id(),
            random_token().unwrap()
        ));
        fs::create_dir(&unsafe_dir).unwrap();
        fs::set_permissions(&unsafe_dir, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(Store::open(&unsafe_dir).is_err());
        cleanup(unsafe_dir);

        let (dir, store) = test_store("links");
        store.save(None, fixture()).unwrap();
        let hardlink = dir.join("hardlink");
        fs::hard_link(dir.join("archive.json"), &hardlink).unwrap();
        assert!(store.read().is_err());
        assert!(store.save(Some(fixture()), fixture()).is_err());
        fs::remove_file(hardlink).unwrap();
        assert_eq!(store.read().unwrap().unwrap().bytes, fixture());
        fs::remove_file(dir.join("archive.json")).unwrap();
        symlink("/etc/passwd", dir.join("archive.json")).unwrap();
        assert!(store.read().is_err());
        drop(store);
        cleanup(dir);

        let (dir, store) = test_store("fifo");
        use std::os::unix::ffi::OsStrExt;
        let path = dir.join("archive.json");
        let name = CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        assert!(store.read().is_err());
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn corrupt_archive_or_receipt_is_never_overwritten_or_misreported() {
        let (dir, store) = test_store("corrupt");
        let corrupt = b"{broken";
        fs::write(dir.join("archive.json"), corrupt).unwrap();
        fs::set_permissions(dir.join("archive.json"), fs::Permissions::from_mode(0o600)).unwrap();
        assert!(store.save(None, fixture()).is_err());
        assert_eq!(fs::read(dir.join("archive.json")).unwrap(), corrupt);
        fs::remove_file(dir.join("archive.json")).unwrap();
        store.save(None, fixture()).unwrap();
        fs::write(dir.join("receipt.json"), b"not json").unwrap();
        fs::set_permissions(dir.join("receipt.json"), fs::Permissions::from_mode(0o600)).unwrap();
        let stored = store.read().unwrap().unwrap();
        assert_eq!(stored.bytes, fixture());
        assert!(stored.receipt.is_none());
        drop(store);
        cleanup(dir);
    }

    #[test]
    fn staging_file_cannot_be_replaced_by_a_hard_link() {
        let (dir, store) = test_store("stage_link");
        let prepared = store.prepare().unwrap();
        fs::remove_file(&prepared.upload_path).unwrap();
        let base = dir
            .join(".staging")
            .join(format!(".{}.base", prepared.token));
        fs::hard_link(base, &prepared.upload_path).unwrap();
        assert!(matches!(
            store.save_staged(&prepared.token),
            Err(SaveError::BeforeCommit(_))
        ));
        drop(store);
        cleanup(dir);
    }
}
