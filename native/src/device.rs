use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
#[cfg(test)]
use std::path::Path;
use std::thread;
use std::time::Duration;

const ADD_PATH: u32 = 0x0005_5550;
const ADD_LOOP_PATH: u32 = 0x0005_5553;
const ADD_MAP: u32 = 0x0006_0020;
const ADD_KSTAT: u32 = 0x0005_5570;
const UPDATE_KSTAT: u32 = 0x0005_5571;
const ADD_STATIC_KSTAT: u32 = 0x0005_5572;
const SET_UNAME: u32 = 0x0005_5590;
const SET_CMDLINE: u32 = 0x0005_55b0;
const SET_REDIRECT: u32 = 0x0005_55c0;
const HIDE_MOUNTS: u32 = 0x0005_5561;
const LOGGING: u32 = 0x0005_55a0;
const AVC_SPOOF: u32 = 0x0006_0010;
const PRIORITY_UID_FILTER: u32 = 0x0006_0030;
const KSU_FEATURE_AVC_SPOOF: u32 = 6;
const KSU_IOCTL_GET_FEATURE: libc::c_ulong = 0xc000_4b0d;
const APP_PROBE_CONTEXT: &str = "u:r:untrusted_app:s0:c123,c256,c512,c768";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub implementation: String,
    pub version: String,
    pub variant: String,
    pub audited: bool,
    pub features: Vec<String>,
    pub boot_id: String,
    pub uid: u32,
    pub proc_nodes: Vec<String>,
    pub redirect_uid_schemes: Vec<u32>,
}

#[derive(Clone, Debug)]
pub enum DeviceAction {
    AddPath {
        path: String,
        looping: bool,
    },
    RemovePath {
        path: String,
    },
    AddMap {
        path: String,
    },
    RemoveMap {
        path: String,
    },
    AddRedirect {
        path: String,
        destination: String,
        uid_scheme: u8,
    },
    RemoveRedirect {
        path: String,
    },
    AddKstat {
        path: String,
        full_clone: bool,
    },
    UpdateKstat {
        path: String,
        full_clone: bool,
    },
    RemoveKstat {
        path: String,
    },
    AddStaticKstat {
        path: String,
        fields: StaticKstat,
    },
    ToggleHideMounts(bool),
    ToggleLogging(bool),
    ToggleAvcSpoof(bool),
    SetUname {
        release: String,
        version: String,
    },
    ResetUname,
    SetCmdline(String),
    ResetCmdline,
    SetPriorityUidFilter(Vec<String>),
    AddHiddenModule(String),
    RemoveHiddenModule(String),
    AddMountPrefix(String),
    RemoveMountPrefix(String),
}

#[derive(Clone, Debug, Default)]
pub struct StaticKstat {
    pub inode: Option<u64>,
    pub device: Option<u64>,
    pub links: Option<u32>,
    pub size: Option<i64>,
    pub atime_seconds: Option<i64>,
    pub atime_nanoseconds: Option<u32>,
    pub mtime_seconds: Option<i64>,
    pub mtime_nanoseconds: Option<u32>,
    pub ctime_seconds: Option<i64>,
    pub ctime_nanoseconds: Option<u32>,
    pub blocks: Option<i64>,
    pub block_size: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceOutcome {
    pub status: &'static str,
    pub code: String,
}

fn outcome(status: &'static str, code: impl Into<String>) -> DeviceOutcome {
    DeviceOutcome {
        status,
        code: code.into(),
    }
}

#[repr(C)]
struct Text<const N: usize> {
    text: [u8; N],
    error: i32,
}

#[repr(C)]
struct Toggle {
    enabled: bool,
    error: i32,
}

#[repr(C)]
struct Redirect {
    target: [u8; 256],
    destination: [u8; 256],
    uid_scheme: i32,
    error: i32,
}

#[repr(C)]
struct Uname {
    release: [u8; 65],
    version: [u8; 65],
    error: i32,
}

#[repr(C)]
struct Kstat {
    is_static: i32,
    target_ino: libc::c_ulong,
    path: [u8; 256],
    inode: libc::c_ulong,
    device: libc::c_ulong,
    links: u32,
    size: i64,
    atime_seconds: libc::c_long,
    atime_nanoseconds: libc::c_ulong,
    mtime_seconds: libc::c_long,
    mtime_nanoseconds: libc::c_ulong,
    ctime_seconds: libc::c_long,
    ctime_nanoseconds: libc::c_ulong,
    blocks: i64,
    block_size: libc::c_long,
    flags: i32,
    error: i32,
}

trait AbiPayload {
    fn error(&self) -> i32;
}

impl<const N: usize> AbiPayload for Text<N> {
    fn error(&self) -> i32 {
        self.error
    }
}

impl AbiPayload for Toggle {
    fn error(&self) -> i32 {
        self.error
    }
}

impl AbiPayload for Redirect {
    fn error(&self) -> i32 {
        self.error
    }
}

impl AbiPayload for Uname {
    fn error(&self) -> i32 {
        self.error
    }
}

impl AbiPayload for Kstat {
    fn error(&self) -> i32 {
        self.error
    }
}

#[repr(C)]
struct Feature {
    feature_id: u32,
    value: u64,
    supported: u8,
}

impl Kstat {
    fn empty() -> Self {
        Self {
            is_static: 0,
            target_ino: 0,
            path: [0; 256],
            inode: 0,
            device: 0,
            links: 0,
            size: 0,
            atime_seconds: 0,
            atime_nanoseconds: 0,
            mtime_seconds: 0,
            mtime_nanoseconds: 0,
            ctime_seconds: 0,
            ctime_nanoseconds: 0,
            blocks: 0,
            block_size: 0,
            flags: 0,
            error: 126,
        }
    }
}

fn bytes<const N: usize>(value: &str) -> Result<[u8; N], DeviceOutcome> {
    if value.is_empty() || value.len() >= N || value.as_bytes().contains(&0) {
        return Err(outcome("failed", "INVALID_FIELD"));
    }
    let mut output = [0; N];
    output[..value.len()].copy_from_slice(value.as_bytes());
    Ok(output)
}

fn syscall<T>(command: u32, payload: &mut T) -> i32 {
    let result = unsafe {
        libc::syscall(
            libc::SYS_reboot,
            0xdead_beef_u32,
            0xfafa_fafa_u32,
            command,
            std::ptr::from_mut(payload),
        )
    };
    if result == -1 {
        io::Error::last_os_error().raw_os_error().unwrap_or(-1)
    } else {
        0
    }
}

fn call<T: AbiPayload>(command: u32, payload: &mut T) -> DeviceOutcome {
    let result = syscall(command, payload);
    let error = payload.error();
    if result < 0 || error != 0 {
        outcome("failed", format!("SUSFS_{}", error.max(1)))
    } else {
        outcome("applied", "ACCEPTED")
    }
}

fn toggle(command: u32, enabled: bool) -> DeviceOutcome {
    let mut payload = Toggle {
        enabled,
        error: 126,
    };
    call(command, &mut payload)
}

fn text_action<const N: usize>(command: u32, value: &str) -> Result<DeviceOutcome, DeviceOutcome> {
    let mut payload = Text::<N> {
        text: bytes(value)?,
        error: 126,
    };
    Ok(call(command, &mut payload))
}

fn proc_write(node: &str, command: &str) -> DeviceOutcome {
    if command.len() > 8192
        || command
            .bytes()
            .any(|byte| byte == 0 || byte == b'\r' || byte == b'\n')
    {
        return outcome("failed", "INVALID_FIELD");
    }
    let path = format!("/proc/{node}");
    let result = (|| -> io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)?;
        let mut bytes = Vec::with_capacity(command.len() + 1);
        bytes.extend_from_slice(command.as_bytes());
        bytes.push(b'\n');
        file.write_all(&bytes)?;
        Ok(())
    })();
    match result {
        Ok(()) => outcome("applied", "ACCEPTED"),
        Err(error) => outcome(
            "failed",
            match error.kind() {
                io::ErrorKind::NotFound => "PROC_UNAVAILABLE",
                io::ErrorKind::PermissionDenied => "PROC_DENIED",
                io::ErrorKind::InvalidInput => "PROC_REJECTED",
                _ => "PROC_IO_ERROR",
            },
        ),
    }
}

fn kstat_flags(fields: &StaticKstat) -> i32 {
    let values = [
        fields.inode.is_some(),
        fields.device.is_some(),
        fields.links.is_some(),
        fields.size.is_some(),
        fields.atime_seconds.is_some(),
        fields.atime_nanoseconds.is_some(),
        fields.mtime_seconds.is_some(),
        fields.mtime_nanoseconds.is_some(),
        fields.ctime_seconds.is_some(),
        fields.ctime_nanoseconds.is_some(),
        fields.blocks.is_some(),
        fields.block_size.is_some(),
    ];
    values
        .into_iter()
        .enumerate()
        .fold(0, |flags, (bit, present)| {
            flags | (i32::from(present) << bit)
        })
}

fn metadata_kstat(path: &str, full_clone: bool, update: bool) -> Result<Kstat, DeviceOutcome> {
    let metadata = fs::metadata(path).map_err(|_| outcome("failed", "TARGET_UNAVAILABLE"))?;
    let target_ino = metadata.ino() as libc::c_ulong;
    Ok(Kstat {
        target_ino,
        path: bytes(path)?,
        inode: metadata.ino() as libc::c_ulong,
        device: metadata.dev() as libc::c_ulong,
        links: metadata.nlink().try_into().unwrap_or(u32::MAX),
        size: metadata.size().try_into().unwrap_or(i64::MAX),
        atime_seconds: metadata.atime() as libc::c_long,
        atime_nanoseconds: metadata.atime_nsec() as libc::c_ulong,
        mtime_seconds: metadata.mtime() as libc::c_long,
        mtime_nanoseconds: metadata.mtime_nsec() as libc::c_ulong,
        ctime_seconds: metadata.ctime() as libc::c_long,
        ctime_nanoseconds: metadata.ctime_nsec() as libc::c_ulong,
        blocks: metadata.blocks().try_into().unwrap_or(i64::MAX),
        block_size: metadata.blksize() as libc::c_long,
        flags: if update && full_clone { 0x0fff } else { 0x0ff3 },
        ..Kstat::empty()
    })
}

fn static_kstat(path: &str, fields: &StaticKstat) -> Result<DeviceOutcome, DeviceOutcome> {
    if kstat_flags(fields) == 0 {
        return Err(outcome("failed", "STATIC_FIELD_REQUIRED"));
    }
    let metadata = fs::metadata(path).map_err(|_| outcome("failed", "TARGET_UNAVAILABLE"))?;
    let mut payload = Kstat {
        is_static: 1,
        target_ino: metadata.ino() as libc::c_ulong,
        path: bytes(path)?,
        inode: fields.inode.unwrap_or(metadata.ino()) as libc::c_ulong,
        device: fields.device.unwrap_or(metadata.dev()) as libc::c_ulong,
        links: fields.links.unwrap_or(metadata.nlink() as u32),
        size: fields.size.unwrap_or(metadata.size() as i64),
        atime_seconds: fields.atime_seconds.unwrap_or(metadata.atime()) as libc::c_long,
        atime_nanoseconds: fields
            .atime_nanoseconds
            .unwrap_or(metadata.atime_nsec() as u32) as libc::c_ulong,
        mtime_seconds: fields.mtime_seconds.unwrap_or(metadata.mtime()) as libc::c_long,
        mtime_nanoseconds: fields
            .mtime_nanoseconds
            .unwrap_or(metadata.mtime_nsec() as u32) as libc::c_ulong,
        ctime_seconds: fields.ctime_seconds.unwrap_or(metadata.ctime()) as libc::c_long,
        ctime_nanoseconds: fields
            .ctime_nanoseconds
            .unwrap_or(metadata.ctime_nsec() as u32) as libc::c_ulong,
        blocks: fields.blocks.unwrap_or(metadata.blocks() as i64),
        block_size: fields.block_size.unwrap_or(metadata.blksize() as i64) as libc::c_long,
        flags: kstat_flags(fields),
        ..Kstat::empty()
    };
    Ok(call(ADD_STATIC_KSTAT, &mut payload))
}

fn priority_string(packages: &[String]) -> String {
    if packages.is_empty() {
        ",".to_owned()
    } else {
        packages.join(",")
    }
}

pub fn execute(action: &DeviceAction, provider: &ProviderSnapshot) -> DeviceOutcome {
    if provider.uid != 0 {
        return outcome("failed", "ROOT_REQUIRED");
    }
    match action {
        DeviceAction::AddPath { path, looping } => {
            let command = if *looping { ADD_LOOP_PATH } else { ADD_PATH };
            let mut payload = Text::<256> {
                text: match bytes(path) {
                    Ok(text) => text,
                    Err(error) => return error,
                },
                error: 126,
            };
            call(command, &mut payload)
        }
        DeviceAction::RemovePath { path } => proc_write("susfs_path", &format!("del {path}")),
        DeviceAction::AddMap { path } => {
            let mut payload = Text::<256> {
                text: match bytes(path) {
                    Ok(text) => text,
                    Err(error) => return error,
                },
                error: 126,
            };
            call(ADD_MAP, &mut payload)
        }
        DeviceAction::RemoveMap { path } => proc_write("susfs_map", &format!("del {path}")),
        DeviceAction::AddRedirect {
            path,
            destination,
            uid_scheme,
        } => {
            let mut payload = Redirect {
                target: match bytes(path) {
                    Ok(value) => value,
                    Err(error) => return error,
                },
                destination: match bytes(destination) {
                    Ok(value) => value,
                    Err(error) => return error,
                },
                uid_scheme: i32::from(*uid_scheme),
                error: 126,
            };
            call(SET_REDIRECT, &mut payload)
        }
        DeviceAction::RemoveRedirect { path } => {
            proc_write("susfs_open_redirect", &format!("del {path}"))
        }
        DeviceAction::AddKstat { path, full_clone } => {
            match metadata_kstat(path, *full_clone, false) {
                Ok(mut payload) => call(ADD_KSTAT, &mut payload),
                Err(error) => error,
            }
        }
        DeviceAction::UpdateKstat { path, full_clone } => {
            if provider.implementation == "lkm"
                && *full_clone
                && provider.proc_nodes.iter().any(|node| node == "susfs_kstat")
            {
                proc_write(
                    "susfs_kstat",
                    &format!("update_sus_kstat_full_clone {path}"),
                )
            } else {
                match metadata_kstat(path, *full_clone, true) {
                    Ok(mut payload) => call(UPDATE_KSTAT, &mut payload),
                    Err(error) => error,
                }
            }
        }
        DeviceAction::RemoveKstat { path } => proc_write("susfs_kstat", &format!("del {path}")),
        DeviceAction::AddStaticKstat { path, fields } => {
            static_kstat(path, fields).unwrap_or_else(|error| error)
        }
        DeviceAction::ToggleHideMounts(enabled) => toggle(HIDE_MOUNTS, *enabled),
        DeviceAction::ToggleLogging(enabled) => toggle(LOGGING, *enabled),
        DeviceAction::ToggleAvcSpoof(enabled) if provider.implementation == "builtin" => {
            toggle(AVC_SPOOF, *enabled)
        }
        DeviceAction::ToggleAvcSpoof(enabled) => {
            proc_write("susfs_avc_spoof", if *enabled { "1" } else { "0" })
        }
        DeviceAction::SetUname { release, version } => {
            let mut payload = Uname {
                release: match bytes(release) {
                    Ok(value) => value,
                    Err(error) => return error,
                },
                version: match bytes(version) {
                    Ok(value) => value,
                    Err(error) => return error,
                },
                error: 126,
            };
            call(SET_UNAME, &mut payload)
        }
        DeviceAction::ResetUname => {
            let mut payload = Uname {
                release: bytes("default").unwrap_or([0; 65]),
                version: bytes("default").unwrap_or([0; 65]),
                error: 126,
            };
            call(SET_UNAME, &mut payload)
        }
        DeviceAction::SetCmdline(value) => match text_action::<8192>(SET_CMDLINE, value) {
            Ok(value) => value,
            Err(error) => error,
        },
        DeviceAction::ResetCmdline => {
            if provider.implementation != "builtin" {
                return outcome("pending_reboot", "EXPLICIT_RESET_REQUIRES_REBOOT");
            }
            let mut payload = Text::<8192> {
                text: [0; 8192],
                error: 126,
            };
            call(SET_CMDLINE, &mut payload)
        }
        DeviceAction::SetPriorityUidFilter(packages) => {
            if provider.implementation != "builtin" {
                return outcome("failed", "PROVIDER_NOT_AUTHORIZED");
            }
            let value = priority_string(packages);
            let mut payload = Box::new(Text::<65535> {
                text: [0; 65535],
                error: 126,
            });
            if value.len() >= payload.text.len() {
                return outcome("failed", "INVALID_FIELD");
            }
            payload.text[..value.len()].copy_from_slice(value.as_bytes());
            call(PRIORITY_UID_FILTER, payload.as_mut())
        }
        DeviceAction::AddHiddenModule(name) => {
            proc_write("susfs_hide_modules", &format!("add {name}"))
        }
        DeviceAction::RemoveHiddenModule(name) => {
            proc_write("susfs_hide_modules", &format!("del {name}"))
        }
        DeviceAction::AddMountPrefix(path) => {
            proc_write("susfs_hide_mounts", &format!("add {path}"))
        }
        DeviceAction::RemoveMountPrefix(path) => {
            proc_write("susfs_hide_mounts", &format!("del {path}"))
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectEvidence {
    pub observed: bool,
    pub source: String,
    pub code: String,
    pub value_digest: Option<String>,
}

fn observed(value: bool, source: &str, code: &str, detail: &str) -> EffectEvidence {
    use sha2::{Digest, Sha256};
    EffectEvidence {
        observed: value,
        source: source.to_owned(),
        code: code.to_owned(),
        value_digest: Some(format!("{:x}", Sha256::digest(detail.as_bytes()))),
    }
}

fn proc_named(node: &str, name: &str) -> bool {
    fs::read_to_string(format!("/proc/{node}"))
        .ok()
        .is_some_and(|text| {
            text.lines()
                .any(|line| line == name || line.starts_with(&format!("{name} ")))
        })
}

fn proc_listed(node: &str, prefix: &str, value: &str) -> bool {
    fs::read_to_string(format!("/proc/{node}"))
        .ok()
        .and_then(|text| {
            text.lines()
                .find_map(|line| line.strip_prefix(prefix))
                .map(str::to_owned)
        })
        .is_some_and(|values| values.split_whitespace().any(|item| item == value))
}

fn command_output(command: &str, argument: &str) -> Option<String> {
    std::process::Command::new(command)
        .arg(argument)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

#[cfg(test)]
fn file_write_private(path: &Path, contents: &[u8]) -> io::Result<File> {
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)?;
    file.write_all(contents)?;
    file.sync_all()?;
    Ok(file)
}

fn fork_read_same(path: &str, destination: &str, uid: u32, context: &str) -> Option<bool> {
    let source = output_for_uid(uid, context, "/system/bin/cat", &[path])?;
    let target = fs::read(destination).ok()?;
    Some(source.status.success() && source.stdout == target)
}

fn map_visible_here(path: &str) -> bool {
    let Ok(file) = File::open(path) else {
        return false;
    };
    let Ok(metadata) = file.metadata() else {
        return false;
    };
    if metadata.len() == 0 {
        return false;
    }
    let mapped = unsafe {
        libc::mmap(
            std::ptr::null_mut(),
            metadata.len() as usize,
            libc::PROT_READ,
            libc::MAP_PRIVATE,
            file.as_raw_fd(),
            0,
        )
    };
    if mapped == libc::MAP_FAILED {
        return false;
    }
    let visible = fs::read_to_string("/proc/self/maps")
        .ok()
        .is_some_and(|maps| maps.lines().any(|line| line.ends_with(path)));
    unsafe {
        libc::munmap(mapped, metadata.len() as usize);
    }
    visible
}

fn mount_hidden_for_app() -> bool {
    let Ok(state) = fs::read_to_string("/proc/susfs_hide_mounts") else {
        return false;
    };
    let prefixes: Vec<_> = state
        .lines()
        .find_map(|line| line.strip_prefix("prefixes: "))
        .map(|line| line.split_whitespace().collect())
        .unwrap_or_default();
    if prefixes.is_empty() {
        return false;
    }
    let root = fs::read_to_string("/proc/self/mountinfo").unwrap_or_default();
    app_output("/system/bin/cat", &["/proc/self/mountinfo"]).is_some_and(|output| {
        let mounts = String::from_utf8_lossy(&output.stdout);
        output.status.success()
            && prefixes.iter().any(|prefix| {
                root.lines().any(|line| line.contains(prefix)) && !mounts.contains(prefix)
            })
    })
}

fn app_output(program: &str, arguments: &[&str]) -> Option<std::process::Output> {
    app_output_for_uid(10123, program, arguments)
}

fn app_output_for_uid(uid: u32, program: &str, arguments: &[&str]) -> Option<std::process::Output> {
    output_for_uid(uid, APP_PROBE_CONTEXT, program, arguments)
}

fn output_for_uid(
    uid: u32,
    context: &str,
    program: &str,
    arguments: &[&str],
) -> Option<std::process::Output> {
    let uid = uid.to_string();
    std::process::Command::new("/system/bin/su")
        .args(["-Z", context, &uid, program])
        .args(arguments)
        .output()
        .ok()
}

fn app_probe_output(uid: u32, arguments: &[&str]) -> Option<std::process::Output> {
    let current = std::env::current_exe().ok()?;
    let target = format!("/data/local/tmp/.susfs-studio-probe-{}", std::process::id());
    let mut source = File::open(current).ok()?;
    if source.metadata().ok()?.len() > 64 * 1024 * 1024 {
        return None;
    }
    let cleanup = || {
        let _ = fs::remove_file(&target);
    };
    let mut destination = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o700)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(&target)
        .ok()?;
    if io::copy(&mut source, &mut destination).is_err()
        || destination.sync_all().is_err()
        || fs::set_permissions(&target, fs::Permissions::from_mode(0o755)).is_err()
    {
        cleanup();
        return None;
    }
    drop(destination);
    let relabel = std::process::Command::new("/system/bin/chcon")
        .args(["u:object_r:system_file:s0", &target])
        .status();
    if !relabel.is_ok_and(|status| status.success()) {
        cleanup();
        return None;
    }
    let uid = uid.to_string();
    let output = std::process::Command::new("/system/bin/su")
        .args(["-Z", APP_PROBE_CONTEXT, &uid, &target])
        .args(arguments)
        .output()
        .ok();
    cleanup();
    output
}

fn installed_uids() -> Option<BTreeMap<String, u32>> {
    let metadata = fs::metadata("/data/system/packages.list").ok()?;
    if metadata.len() == 0 || metadata.len() > 4 * 1024 * 1024 {
        return None;
    }
    let text = fs::read_to_string("/data/system/packages.list").ok()?;
    let packages = text
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_ascii_whitespace();
            let name = fields.next()?;
            let uid = fields.next()?.parse::<u32>().ok()?;
            (name.len() <= 255
                && name != "."
                && name != ".."
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_')))
            .then(|| (name.to_owned(), uid))
        })
        .collect();
    Some(packages)
}

fn priority_probe(target_uid: u32, caller_uid: u32) -> Option<bool> {
    if target_uid == caller_uid || !(10000..=19999).contains(&target_uid) {
        return None;
    }
    let target = target_uid.to_string();
    let mut holder = std::process::Command::new("/system/bin/su")
        .args(["-Z", APP_PROBE_CONTEXT, &target, "/system/bin/sleep", "5"])
        .spawn()
        .ok()?;
    thread::sleep(Duration::from_millis(100));
    let user = format!("u0_a{}", target_uid - 10000);
    let output = app_output_for_uid(caller_uid, "/system/bin/renice", &["-u", &user, "-n", "0"]);
    let _ = holder.kill();
    let _ = holder.wait();
    let output = output?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("No such process") {
        Some(true)
    } else if stderr.contains("Operation not permitted") || output.status.success() {
        Some(false)
    } else {
        None
    }
}

fn priority_uid_effect(packages: &[String]) -> Option<bool> {
    let installed = installed_uids()?;
    let selected: Vec<u32> = if packages.is_empty() {
        installed
            .values()
            .copied()
            .find(|uid| {
                (10000..=19999).contains(uid)
                    && installed
                        .values()
                        .any(|candidate| candidate != uid && (10000..=19999).contains(candidate))
            })
            .into_iter()
            .collect()
    } else {
        packages
            .iter()
            .filter_map(|name| installed.get(name).copied())
            .filter(|uid| (10000..=19999).contains(uid))
            .collect()
    };
    if selected.is_empty() || selected.len() > 32 {
        return Some(false);
    }
    for target in selected {
        let caller = installed
            .values()
            .copied()
            .find(|uid| *uid != target && (10000..=19999).contains(uid))?;
        let filtered = priority_probe(target, caller)?;
        if filtered != !packages.is_empty() {
            return Some(false);
        }
    }
    Some(true)
}

fn mount_prefix_effect(path: &str) -> bool {
    if !proc_listed("susfs_hide_mounts", "prefixes: ", path) {
        return false;
    }
    let root = fs::read_to_string("/proc/self/mountinfo").unwrap_or_default();
    if !root.contains(path) {
        return true;
    }
    app_output("/system/bin/cat", &["/proc/self/mountinfo"]).is_some_and(|output| {
        output.status.success() && !String::from_utf8_lossy(&output.stdout).contains(path)
    })
}

fn kernel_log_state(enabled: &str, disabled: &str) -> Option<bool> {
    std::process::Command::new("/system/bin/dmesg")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .rev()
                .find_map(|line| {
                    if line.contains(enabled) {
                        Some(true)
                    } else if line.contains(disabled) {
                        Some(false)
                    } else {
                        None
                    }
                })
        })
}

fn kernel_feature(feature_id: u32) -> Option<(u64, bool)> {
    let mut installed = false;
    let mut driver = None;
    for entry in fs::read_dir("/proc/self/fd").ok()?.flatten() {
        let Ok(target) = fs::read_link(entry.path()) else {
            continue;
        };
        if matches!(
            target.to_str(),
            Some("anon_inode:[ksu_driver]" | "anon_inode:[ksu_driver_su]")
        ) {
            driver = entry
                .file_name()
                .to_str()
                .and_then(|fd| fd.parse::<i32>().ok());
            break;
        }
    }
    if driver.is_none() {
        let mut fd = -1;
        let result = unsafe {
            libc::syscall(
                libc::SYS_reboot,
                0xdead_beef_u32,
                0xcafe_babe_u32,
                0,
                std::ptr::from_mut(&mut fd),
            )
        };
        if result != -1 && fd >= 0 {
            driver = Some(fd);
            installed = true;
        }
    }
    let fd = driver?;
    let mut feature = Feature {
        feature_id,
        value: 0,
        supported: 0,
    };
    let result = unsafe {
        libc::syscall(
            libc::SYS_ioctl,
            fd,
            KSU_IOCTL_GET_FEATURE,
            std::ptr::from_mut(&mut feature),
        )
    };
    if installed {
        unsafe {
            libc::close(fd);
        }
    }
    (result >= 0).then_some((feature.value, feature.supported & 1 != 0))
}

fn ksu_mount_count(mountinfo: &str) -> usize {
    mountinfo
        .lines()
        .filter(|line| {
            line.split_whitespace()
                .next()
                .and_then(|id| id.parse::<u64>().ok())
                .is_some_and(|id| id >= 2_000_000_000)
        })
        .count()
}

fn mount_visibility() -> Option<(usize, usize)> {
    let root = fs::read_to_string("/proc/self/mountinfo").ok()?;
    let shell = output_for_uid(
        2000,
        "u:r:shell:s0",
        "/system/bin/cat",
        &["/proc/self/mountinfo"],
    )?;
    shell.status.success().then(|| {
        (
            ksu_mount_count(&root),
            ksu_mount_count(&String::from_utf8_lossy(&shell.stdout)),
        )
    })
}

fn app_path_visible(path: &str) -> Option<bool> {
    app_output("/system/bin/stat", &["-c", "%n", path]).map(|output| output.status.success())
}

fn app_map_visible(path: &str) -> Option<bool> {
    let output = app_probe_output(10123, &["effect-probe", "map", path])?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim() == "visible")
}

fn app_static_matches(path: &str, fields: &StaticKstat) -> Option<bool> {
    let output = app_probe_output(10123, &["effect-probe", "stat", path])?;
    if !output.status.success() {
        return Some(false);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let values: Vec<_> = text.trim().split('|').collect();
    if values.len() != 12 {
        return Some(false);
    }
    let unsigned = |index: usize| values[index].parse::<u64>().ok();
    let signed = |index: usize| values[index].parse::<i64>().ok();
    Some(
        fields.inode.is_none_or(|value| unsigned(0) == Some(value))
            && fields
                .device
                .is_none_or(|value| unsigned(1) == Some(stat_device(value)))
            && fields
                .links
                .is_none_or(|value| unsigned(2) == Some(u64::from(value)))
            && fields
                .size
                .is_none_or(|value| unsigned(3) == Some(value as u64))
            && fields
                .atime_seconds
                .is_none_or(|value| signed(4) == Some(value))
            && fields
                .atime_nanoseconds
                .is_none_or(|value| unsigned(5) == Some(u64::from(value)))
            && fields
                .mtime_seconds
                .is_none_or(|value| signed(6) == Some(value))
            && fields
                .mtime_nanoseconds
                .is_none_or(|value| unsigned(7) == Some(u64::from(value)))
            && fields
                .ctime_seconds
                .is_none_or(|value| signed(8) == Some(value))
            && fields
                .ctime_nanoseconds
                .is_none_or(|value| unsigned(9) == Some(u64::from(value)))
            && fields.blocks.is_none_or(|value| signed(10) == Some(value))
            && fields
                .block_size
                .is_none_or(|value| signed(11) == Some(value)),
    )
}

fn stat_device(value: u64) -> u64 {
    u64::from(value as u32)
}

pub fn verify(action: &DeviceAction, provider: &ProviderSnapshot) -> EffectEvidence {
    match action {
        DeviceAction::AddPath { path, .. } => {
            let hidden = app_path_visible(path) == Some(false);
            observed(hidden, "app-domain", "PATH_VISIBILITY", path)
        }
        DeviceAction::RemovePath { path } => {
            let visible = app_path_visible(path) == Some(true);
            observed(visible, "app-domain", "PATH_VISIBILITY", path)
        }
        DeviceAction::AddMap { path } => {
            let hidden = app_map_visible(path) == Some(false);
            observed(hidden, "app-domain-maps", "MAP_VISIBILITY", path)
        }
        DeviceAction::RemoveMap { path } => {
            let visible = app_map_visible(path) == Some(true);
            observed(visible, "app-domain-maps", "MAP_VISIBILITY", path)
        }
        DeviceAction::AddRedirect {
            path,
            destination,
            uid_scheme,
        } => {
            let (uid, context) = match uid_scheme {
                0 => (2000, "u:r:shell:s0"),
                1 => (0, "u:r:shell:s0"),
                2 => (10123, APP_PROBE_CONTEXT),
                _ => {
                    return observed(false, "unsupported-uid-scheme", "OPEN_REDIRECT", path);
                }
            };
            let redirected = fork_read_same(path, destination, uid, context) == Some(true);
            observed(
                redirected,
                "uid-scheme-open",
                "OPEN_REDIRECT",
                &format!("scheme={uid_scheme}"),
            )
        }
        DeviceAction::RemoveRedirect { path } => {
            let restored = app_output("/system/bin/cat", &[path])
                .is_some_and(|output| output.status.success() && !output.stdout.is_empty());
            observed(restored, "app-domain-open", "OPEN_REDIRECT", path)
        }
        DeviceAction::AddKstat { path, .. }
        | DeviceAction::UpdateKstat { path, .. }
        | DeviceAction::RemoveKstat { path } => {
            let format = "%i|%d|%h|%s|%X|%Y|%Z|%b|%o";
            let root = std::process::Command::new("/system/bin/stat")
                .args(["-c", format, path])
                .output()
                .ok()
                .filter(|output| output.status.success())
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned());
            let app = app_output("/system/bin/stat", &["-c", format, path])
                .filter(|output| output.status.success())
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned());
            observed(
                root.is_some() && root == app,
                "app-domain-stat",
                "KSTAT",
                &format!("{root:?}/{app:?}"),
            )
        }
        DeviceAction::AddStaticKstat { path, fields } => {
            let matches = app_static_matches(path, fields) == Some(true);
            observed(matches, "app-domain-stat", "STATIC_FIELDS", path)
        }
        DeviceAction::ToggleHideMounts(enabled) => {
            if provider.implementation == "builtin" {
                let state = mount_visibility();
                let value = state
                    .map(|(root, shell)| format!("root={root},non_su={shell}"))
                    .unwrap_or_else(|| "unavailable".to_owned());
                observed(
                    state.is_some_and(|(root, shell)| {
                        root > 0 && if *enabled { shell == 0 } else { shell == root }
                    }),
                    "non-su-mountinfo",
                    "HIDE_MOUNTS",
                    &value,
                )
            } else {
                let hidden = mount_hidden_for_app();
                observed(
                    hidden == *enabled,
                    "uid-app-range-mountinfo",
                    "HIDE_MOUNTS",
                    if hidden { "hidden" } else { "visible" },
                )
            }
        }
        DeviceAction::ToggleLogging(enabled) => {
            if provider.implementation == "builtin" {
                let accepted = toggle(LOGGING, *enabled).status == "applied";
                let state = accepted
                    .then(|| {
                        kernel_log_state(
                            "susfs: enable logging to kernel",
                            "susfs: disable logging to kernel",
                        )
                    })
                    .flatten();
                observed(
                    state == Some(*enabled),
                    "kernel-log",
                    "LOGGING",
                    &format!("enabled={enabled},observed={state:?}"),
                )
            } else {
                let state = fs::read_to_string("/proc/susfs_enable_log").unwrap_or_default();
                observed(
                    state.trim() == if *enabled { "1" } else { "0" },
                    "proc-state",
                    "LOGGING",
                    &state,
                )
            }
        }
        DeviceAction::ToggleAvcSpoof(enabled) => {
            if provider.implementation == "builtin" {
                let accepted = toggle(AVC_SPOOF, *enabled).status == "applied";
                let state = accepted
                    .then(|| kernel_feature(KSU_FEATURE_AVC_SPOOF))
                    .flatten();
                observed(
                    state == Some((u64::from(*enabled), true)),
                    "ksu-feature-state",
                    "AVC_LOG_STATE",
                    &format!("enabled={enabled},observed={state:?}"),
                )
            } else {
                if *enabled {
                    let _ = app_output("/system/bin/cat", &["/data/adb/susfs-studio/receipt.json"]);
                }
                let state = fs::read_to_string("/proc/susfs_avc_spoof").unwrap_or_default();
                let hits = state
                    .split("hits=")
                    .nth(1)
                    .and_then(|value| value.split(')').next())
                    .and_then(|value| value.trim().parse::<u64>().ok())
                    .unwrap_or(0);
                observed(
                    *enabled == (state.contains("enter=1") || hits > 0),
                    "avc-state",
                    "AVC_SPOOF",
                    &state,
                )
            }
        }
        DeviceAction::SetUname { release, version } => {
            let value = format!(
                "{} {}",
                command_output("uname", "-r").unwrap_or_default(),
                command_output("uname", "-v").unwrap_or_default()
            );
            observed(
                value.contains(release) && value.contains(version),
                "uname-syscall",
                "UNAME",
                &value,
            )
        }
        DeviceAction::ResetUname => {
            let value = command_output("uname", "-r").unwrap_or_default();
            observed(!value.is_empty(), "uname-syscall", "UNAME_RESET", &value)
        }
        DeviceAction::SetCmdline(expected) => {
            let value = fs::read_to_string("/proc/cmdline").unwrap_or_default();
            let bootconfig = fs::read_to_string("/proc/bootconfig").unwrap_or_default();
            observed(
                value.trim_end() == expected || bootconfig.trim_end() == expected,
                "proc-cmdline-or-bootconfig",
                "CMDLINE",
                &format!("{value}\n{bootconfig}"),
            )
        }
        DeviceAction::ResetCmdline => {
            let value = fs::read_to_string("/proc/cmdline").unwrap_or_default();
            let bootconfig = fs::read_to_string("/proc/bootconfig").unwrap_or_default();
            observed(
                !value.trim().is_empty() || !bootconfig.trim().is_empty(),
                "proc-cmdline-or-bootconfig",
                "CMDLINE_RESET",
                &format!("{value}\n{bootconfig}"),
            )
        }
        DeviceAction::SetPriorityUidFilter(packages) => {
            let filtered = priority_uid_effect(packages);
            observed(
                filtered == Some(true),
                "app-uid-getpriority",
                "PRIORITY_UID_FILTER",
                if packages.is_empty() {
                    "empty"
                } else {
                    "selected"
                },
            )
        }
        DeviceAction::AddHiddenModule(name) => observed(
            !proc_named("modules", name) && proc_listed("susfs_hide_modules", "names: ", name),
            "proc-modules+state",
            "HIDDEN_MODULE",
            name,
        ),
        DeviceAction::RemoveHiddenModule(name) => {
            let visible = proc_named("modules", name);
            observed(
                visible && !proc_listed("susfs_hide_modules", "names: ", name),
                "proc-modules+state",
                "HIDDEN_MODULE_REMOVE",
                name,
            )
        }
        DeviceAction::AddMountPrefix(path) => observed(
            mount_prefix_effect(path),
            "mountinfo+state",
            "MOUNT_PREFIX",
            path,
        ),
        DeviceAction::RemoveMountPrefix(path) => observed(
            !proc_listed("susfs_hide_mounts", "prefixes: ", path),
            "mountinfo+state",
            "MOUNT_PREFIX_REMOVE",
            path,
        ),
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn probe_proc_nodes() -> Vec<String> {
    [
        "susfs_path",
        "susfs_map",
        "susfs_kstat",
        "susfs_open_redirect",
        "susfs_enable_log",
        "susfs_avc_spoof",
        "susfs_hide_modules",
        "susfs_hide_mounts",
    ]
    .into_iter()
    .filter(|node| {
        OpenOptions::new()
            .write(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(format!("/proc/{node}"))
            .is_ok()
    })
    .map(str::to_owned)
    .collect()
}

pub fn boot_id() -> String {
    fs::read_to_string("/proc/sys/kernel/random/boot_id")
        .map(|value| value.trim().to_owned())
        .unwrap_or_default()
}

pub fn effect_probe_map(path: &str) -> bool {
    map_visible_here(path)
}

pub fn effect_probe_stat(path: &str) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    Some(format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
        metadata.ino(),
        metadata.dev(),
        metadata.nlink(),
        metadata.size(),
        metadata.atime(),
        metadata.atime_nsec(),
        metadata.mtime(),
        metadata.mtime_nsec(),
        metadata.ctime(),
        metadata.ctime_nsec(),
        metadata.blocks(),
        metadata.blksize(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_flags_are_field_specific() {
        let fields = StaticKstat {
            size: Some(0),
            ctime_seconds: Some(-1),
            ..StaticKstat::default()
        };
        assert_eq!(kstat_flags(&fields), 0x108);
    }

    #[test]
    fn explicit_empty_priority_filter_matches_the_kernel_abi() {
        assert_eq!(priority_string(&[]), ",");
        assert_eq!(
            priority_string(&["com.example.one".to_owned(), "com.example.two".to_owned()]),
            "com.example.one,com.example.two"
        );
    }

    #[test]
    fn static_device_uses_the_kernel_dev_encoding_boundary() {
        assert_eq!(stat_device(9_876_543_210), 1_286_608_618);
    }

    #[test]
    fn ksu_mount_count_uses_the_provider_mount_id_boundary() {
        let mounts = "203 1 0:1 / / rw - rootfs rootfs rw\n\
                      2000000000 203 0:2 / /data rw - ext4 /dev/x rw\n\
                      1999999999 203 0:3 / /tmp rw - tmpfs tmpfs rw\n";
        assert_eq!(ksu_mount_count(mounts), 1);
    }

    #[test]
    fn ksu_feature_payload_uses_the_audited_layout() {
        assert_eq!(std::mem::size_of::<Feature>(), 24);
        assert_eq!(std::mem::offset_of!(Feature, value), 8);
        assert_eq!(std::mem::offset_of!(Feature, supported), 16);
    }

    #[test]
    fn abi_text_rejects_oversize_and_nul() {
        assert!(bytes::<4>("abc").is_ok());
        assert!(bytes::<4>("abcd").is_err());
        assert!(bytes::<4>("a\0b").is_err());
    }

    #[test]
    fn file_handles_remain_open_without_leaking_descriptors() {
        let root = std::env::temp_dir().join(format!(
            "studio-device-{}-{}",
            std::process::id(),
            boot_id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir(&root).unwrap();
        let file = file_write_private(&root.join("probe"), b"value").unwrap();
        assert_eq!(file.metadata().unwrap().size(), 5);
        assert!(file.as_raw_fd() >= 0);
        drop(file);
        fs::remove_dir_all(root).unwrap();
    }
}
