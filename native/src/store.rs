use crate::archive::{Envelope, validate_envelope};
use std::ffi::CString;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::Path;

const MAX: u64 = 128 * 1024;

pub struct Store {
    dir: File,
}

fn open_at(dir: &File, name: &str, flags: i32, mode: u32) -> io::Result<File> {
    let name = CString::new(name).map_err(|_| io::ErrorKind::InvalidInput)?;
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

impl Store {
    pub fn open(path: &Path) -> io::Result<Self> {
        let dir = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)?;
        trusted(&dir, true)?;
        Ok(Self { dir })
    }

    fn lock(&self) -> io::Result<File> {
        let lock = open_at(&self.dir, ".lock", libc::O_RDWR | libc::O_CREAT, 0o600)?;
        trusted(&lock, false)?;
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(lock)
    }

    fn read_unlocked(&self) -> io::Result<Option<Vec<u8>>> {
        let file = match open_at(&self.dir, "archive.json", libc::O_RDONLY, 0) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        trusted(&file, false)?;
        let mut bytes = Vec::new();
        file.take(MAX + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX || std::str::from_utf8(&bytes).is_err() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid saved archive",
            ));
        }
        Ok(Some(bytes))
    }

    pub fn read(&self) -> io::Result<Option<Vec<u8>>> {
        let _lock = self.lock()?;
        self.read_unlocked()
    }

    pub fn save(&self, expected: Option<&[u8]>, input: &[u8]) -> io::Result<()> {
        if input.len() as u64 > MAX
            || !matches!(
                std::str::from_utf8(input).ok().map(validate_envelope),
                Some(Envelope::Valid)
            )
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid archive",
            ));
        }
        let _lock = self.lock()?;
        let current = self.read_unlocked()?;
        if current.as_deref() != expected {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "revision conflict",
            ));
        }
        if current.as_ref().is_some_and(|bytes| {
            !matches!(
                std::str::from_utf8(bytes).ok().map(validate_envelope),
                Some(Envelope::Valid)
            )
        }) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "saved archive is not valid",
            ));
        }
        let name = format!(".archive.{}.tmp", std::process::id());
        let mut file = open_at(
            &self.dir,
            &name,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            0o600,
        )?;
        let write_result = (|| {
            file.write_all(input)?;
            file.sync_all()?;
            let old = CString::new(name.as_str()).unwrap();
            let new = CString::new("archive.json").unwrap();
            if unsafe {
                libc::renameat(
                    self.dir.as_raw_fd(),
                    old.as_ptr(),
                    self.dir.as_raw_fd(),
                    new.as_ptr(),
                )
            } != 0
            {
                return Err(io::Error::last_os_error());
            }
            self.dir.sync_all()
        })();
        if write_result.is_err() {
            let name = CString::new(name).unwrap();
            unsafe {
                libc::unlinkat(self.dir.as_raw_fd(), name.as_ptr(), 0);
            }
        }
        write_result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn preserves_data_and_rejects_conflict_and_symlink() {
        let dir = std::env::temp_dir().join(format!("studio-store-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        let store = Store::open(&dir).unwrap();
        let first = include_bytes!("../../contracts/archive-v1.json");
        store.save(None, first).unwrap();
        assert_eq!(store.read().unwrap().as_deref(), Some(first.as_slice()));
        assert_eq!(
            store.save(None, first).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert!(store.save(Some(first), b"{}").is_err());
        assert_eq!(store.read().unwrap().as_deref(), Some(first.as_slice()));
        let lock = store.lock().unwrap();
        assert!(store.save(Some(first), first).is_err());
        drop(lock);
        let replacement = br#"{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]},"unknown":"kept"}"#;
        store.save(Some(first), replacement).unwrap();
        assert_eq!(
            store.read().unwrap().as_deref(),
            Some(replacement.as_slice())
        );
        std::fs::remove_file(dir.join("archive.json")).unwrap();
        symlink("/etc/passwd", dir.join("archive.json")).unwrap();
        assert!(store.read().is_err());
        std::fs::remove_file(dir.join("archive.json")).unwrap();
        std::fs::remove_file(dir.join(".lock")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
