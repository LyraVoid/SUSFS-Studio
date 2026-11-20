use serde::Serialize;
use std::collections::BTreeMap;
use std::io::Read;
#[cfg(target_os = "android")]
use std::os::unix::fs::MetadataExt;
#[cfg(target_os = "android")]
use std::path::Path;

mod archive;
mod device;
mod operations;
mod store;

#[derive(Serialize)]
struct Envelope<T: Serialize> {
    protocol: u32,
    #[serde(rename = "requestId")]
    request_id: &'static str,
    ok: bool,
    data: T,
}

fn response<T: Serialize>(request_id: &'static str, data: T) -> Envelope<T> {
    Envelope {
        protocol: 1,
        request_id,
        ok: true,
        data,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Failure {
    protocol: u32,
    request_id: &'static str,
    ok: bool,
    error: ErrorBody,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: &'static str,
    retryable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StageData {
    token: String,
    upload_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    baseline: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revision: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadData {
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    receipt: Option<store::Receipt>,
    receipt_status: &'static str,
}

fn failure(request_id: &'static str, error: store::SaveError) -> Failure {
    let (code, retryable) = match error {
        store::SaveError::ResultUnknown(_) => ("RESULT_UNKNOWN", false),
        store::SaveError::BeforeCommit(error) => io_error(&error),
    };
    Failure {
        protocol: 1,
        request_id,
        ok: false,
        error: ErrorBody { code, retryable },
    }
}

fn io_failure(request_id: &'static str, error: std::io::Error) -> Failure {
    let (code, retryable) = io_error(&error);
    Failure {
        protocol: 1,
        request_id,
        ok: false,
        error: ErrorBody { code, retryable },
    }
}

fn io_error(error: &std::io::Error) -> (&'static str, bool) {
    match error.kind() {
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::ResourceBusy => ("BUSY", true),
        std::io::ErrorKind::AlreadyExists => ("REVISION_CONFLICT", true),
        std::io::ErrorKind::InvalidData => ("STORE_CORRUPT", false),
        std::io::ErrorKind::InvalidInput => ("BAD_REQUEST", false),
        std::io::ErrorKind::NotFound => ("DRAFT_MISSING", true),
        std::io::ErrorKind::PermissionDenied => ("STORE_UNTRUSTED", false),
        _ => ("IO_ERROR", false),
    }
}

#[derive(Serialize)]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Status {
    Active { provider: Box<Provider> },
    Missing,
    UnknownProtocol,
    Failed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Provider {
    implementation: &'static str,
    kernel_type: &'static str,
    version: String,
    variant: String,
    audited: bool,
    features: Vec<String>,
    capabilities: BTreeMap<&'static str, &'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    proc_nodes: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    static_kstat_fields: Vec<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    redirect_uid_schemes: Vec<u32>,
}

#[derive(Serialize)]
struct StatusData {
    #[serde(flatten)]
    status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    device: Option<Device>,
    control: Control,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Control {
    archive_import: bool,
    provider_write: bool,
    effect_verification: bool,
    adapter: &'static str,
}

impl Control {
    fn for_status(status: &Status) -> Self {
        let active = matches!(status, Status::Active { provider } if provider.audited);
        Self {
            archive_import: true,
            provider_write: active,
            effect_verification: active,
            adapter: "confirmed",
        }
    }
}

#[derive(Serialize)]
struct Device {
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kernel: Option<String>,
}

#[derive(Serialize)]
struct PackageEntry {
    name: String,
    uid: u32,
}

fn device() -> Option<Device> {
    #[cfg(target_os = "android")]
    {
        fn property(name: &std::ffi::CStr) -> Option<String> {
            let mut value = [0_u8; 92];
            // The Android property API requires a buffer of PROP_VALUE_MAX bytes.
            let length =
                unsafe { libc::__system_property_get(name.as_ptr(), value.as_mut_ptr().cast()) };
            let length = usize::try_from(length).ok()?;
            if length == 0 || length >= value.len() {
                return None;
            }
            Some(std::str::from_utf8(&value[..length]).ok()?.to_owned())
        }

        let system = property(c"ro.build.version.release").map(|release| {
            match property(c"ro.build.version.sdk") {
                Some(sdk) => format!("Android {release} (API {sdk})"),
                None => format!("Android {release}"),
            }
        });
        let kernel = std::fs::read_to_string("/proc/sys/kernel/osrelease")
            .ok()
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty());
        Some(Device {
            model: property(c"ro.product.model"),
            system,
            kernel,
        })
    }
    #[cfg(not(target_os = "android"))]
    {
        None
    }
}

#[derive(Debug)]
#[cfg(any(target_os = "android", test))]
struct Reply {
    error: i32,
    text: Option<String>,
    modified: bool,
    absent: bool,
}

#[cfg(target_os = "android")]
fn query<const N: usize>(command: u32) -> Reply {
    #[repr(C)]
    struct Buffer<const N: usize> {
        text: [u8; N],
        error: i32,
    }
    let mut payload = Buffer::<N> {
        text: [0; N],
        error: 126,
    };
    let result = unsafe {
        libc::syscall(
            libc::SYS_reboot,
            0xdeadbeef_u32,
            0xfafafafa_u32,
            command,
            &mut payload,
        )
    };
    let errno = std::io::Error::last_os_error().raw_os_error();
    let absent = result == -1 && matches!(errno, Some(libc::EINVAL | libc::ENOSYS));
    let text = payload
        .text
        .iter()
        .position(|byte| *byte == 0)
        .and_then(|end| std::str::from_utf8(&payload.text[..end]).ok())
        .map(str::to_owned);
    Reply {
        error: payload.error,
        text,
        modified: payload.text.iter().any(|byte| *byte != 0),
        absent,
    }
}

#[cfg(any(target_os = "android", test))]
fn classify(version: Reply, features: Reply, variant: Reply) -> Status {
    let replies = [&version, &features, &variant];
    if replies
        .iter()
        .all(|reply| reply.error == 126 && !reply.modified && reply.absent)
    {
        return Status::Missing;
    }
    if replies
        .iter()
        .all(|reply| reply.error == 126 && !reply.modified)
        && replies.iter().any(|reply| !reply.absent)
    {
        return Status::Failed;
    }
    let (Some(version_text), Some(feature_text), Some(variant_text)) =
        (&version.text, &features.text, &variant.text)
    else {
        return Status::UnknownProtocol;
    };
    let tokens: Vec<_> = feature_text
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if replies.iter().any(|reply| reply.error != 0)
        || version_text.trim().is_empty()
        || version_text.chars().any(char::is_control)
        || tokens.is_empty()
        || tokens.len() > 256
        || !matches!(variant_text.as_str(), "GKI" | "NON-GKI" | "GKI-LKM")
        || tokens.iter().any(|token| {
            *token != "SUSFS_LKM_MODULES"
                && !token
                    .strip_prefix("CONFIG_KSU_SUSFS_")
                    .is_some_and(|suffix| {
                        (1..=128).contains(&suffix.len())
                            && suffix.bytes().all(|byte| {
                                byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_'
                            })
                    })
        })
    {
        return Status::UnknownProtocol;
    }
    let mut features: Vec<_> = tokens.iter().map(|token| (*token).to_owned()).collect();
    features.sort_unstable();
    if features.windows(2).any(|pair| pair[0] == pair[1]) {
        return Status::UnknownProtocol;
    }
    let implementation = match (variant_text.as_str(), tokens.contains(&"SUSFS_LKM_MODULES")) {
        ("GKI-LKM", true) => "lkm",
        ("GKI-LKM", false) | (_, true) => "unknown",
        (_, false) => "builtin",
    };
    let capabilities = [
        ("priorityUidFilter", "CONFIG_KSU_SUSFS_PRIORITY_UID_FILTER"),
        ("paths", "CONFIG_KSU_SUSFS_SUS_PATH"),
        ("map", "CONFIG_KSU_SUSFS_SUS_MAP"),
        ("kstat", "CONFIG_KSU_SUSFS_SUS_KSTAT"),
        ("redirect", "CONFIG_KSU_SUSFS_OPEN_REDIRECT"),
        ("hideMounts", "CONFIG_KSU_SUSFS_SUS_MOUNT"),
        ("logging", "CONFIG_KSU_SUSFS_ENABLE_LOG"),
        ("uname", "CONFIG_KSU_SUSFS_SPOOF_UNAME"),
        ("cmdline", "CONFIG_KSU_SUSFS_SPOOF_CMDLINE_OR_BOOTCONFIG"),
    ]
    .into_iter()
    .filter(|(_, marker)| tokens.contains(marker))
    .map(|(key, _)| (key, "available"))
    .collect();
    Status::Active {
        provider: Box::new(Provider {
            implementation,
            kernel_type: if variant_text.starts_with("GKI") {
                "GKI"
            } else {
                "unknown"
            },
            version: version_text.clone(),
            variant: variant_text.clone(),
            audited: matches!(
                (implementation, variant_text.as_str(), version_text.as_str()),
                ("lkm", "GKI-LKM", "v2.3.0") | ("builtin", "GKI", "v2.3.0" | "v2.4.0")
            ),
            features,
            capabilities,
            proc_nodes: Vec::new(),
            static_kstat_fields: Vec::new(),
            redirect_uid_schemes: Vec::new(),
        }),
    }
}

fn status() -> Status {
    #[cfg(target_os = "android")]
    {
        if unsafe { libc::geteuid() } != 0 {
            return Status::Failed;
        }
        let mut status = classify(
            query::<16>(0x555e1),
            query::<8192>(0x555e2),
            query::<16>(0x555e3),
        );
        if let Status::Active { provider } = &mut status {
            provider.proc_nodes = device::probe_proc_nodes();
            let proc = |node: &str| provider.proc_nodes.iter().any(|value| value == node);
            let kstat = provider.capabilities.get("kstat") == Some(&"available");
            let redirect = provider.capabilities.get("redirect") == Some(&"available");
            let lkm = provider.implementation == "lkm";
            let builtin = provider.implementation == "builtin";
            if kstat && provider.audited {
                provider.static_kstat_fields = vec![
                    "ino",
                    "dev",
                    "nlink",
                    "size",
                    "atime_sec",
                    "atime_nsec",
                    "mtime_sec",
                    "mtime_nsec",
                    "ctime_sec",
                    "ctime_nsec",
                    "blocks",
                    "blksize",
                ];
            }
            if redirect && provider.audited {
                provider.redirect_uid_schemes = if lkm {
                    vec![0, 1, 2, 3, 4]
                } else if builtin {
                    vec![0, 1, 2]
                } else {
                    Vec::new()
                };
            }
            for (key, available) in [
                (
                    "avcSpoof",
                    (lkm && proc("susfs_avc_spoof")) || (builtin && provider.audited),
                ),
                (
                    "fullClone",
                    kstat && provider.audited && (builtin || proc("susfs_kstat")),
                ),
                ("staticKstat", kstat && provider.audited),
                ("hiddenModules", lkm && proc("susfs_hide_modules")),
                ("mountPrefixes", lkm && proc("susfs_hide_mounts")),
            ] {
                provider.capabilities.insert(
                    key,
                    if available {
                        "available"
                    } else {
                        "unavailable"
                    },
                );
            }
            if lkm
                && provider
                    .features
                    .iter()
                    .any(|feature| feature == "CONFIG_KSU_SUSFS_PRIORITY_UID_FILTER")
            {
                provider
                    .capabilities
                    .insert("priorityUidFilter", "unavailable");
            }
        }
        status
    }
    #[cfg(not(target_os = "android"))]
    {
        Status::Failed
    }
}

fn provider_snapshot(status: &Status) -> Option<device::ProviderSnapshot> {
    let Status::Active { provider } = status else {
        return None;
    };
    Some(device::ProviderSnapshot {
        implementation: provider.implementation.to_owned(),
        version: provider.version.clone(),
        variant: provider.variant.clone(),
        audited: provider.audited,
        features: provider.features.clone(),
        boot_id: device::boot_id(),
        uid: unsafe { libc::geteuid() },
        proc_nodes: provider.proc_nodes.clone(),
    })
}

fn installed_packages() -> std::io::Result<Vec<PackageEntry>> {
    let output = std::process::Command::new("/system/bin/cmd")
        .args(["package", "list", "packages", "-U"])
        .output()?;
    if !output.status.success() || output.stdout.len() > 1024 * 1024 {
        return Err(std::io::Error::other("package list is unavailable"));
    }
    let text = std::str::from_utf8(&output.stdout).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid package list")
    })?;
    let mut packages = BTreeMap::new();
    for line in text.lines().take(4096) {
        let mut name = None;
        let mut uid = None;
        for field in line.split_whitespace() {
            if let Some(value) = field.strip_prefix("package:") {
                name = Some(value);
            } else if let Some(value) = field.strip_prefix("uid:") {
                uid = value.parse::<u32>().ok();
            }
        }
        let (Some(name), Some(uid)) = (name, uid) else {
            continue;
        };
        if name.len() <= 255
            && name != "."
            && name != ".."
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_'))
        {
            packages.insert(name.to_owned(), uid);
        }
    }
    Ok(packages
        .into_iter()
        .map(|(name, uid)| PackageEntry { name, uid })
        .collect())
}

fn archive_store() -> std::io::Result<store::Store> {
    #[cfg(target_os = "android")]
    {
        use std::fs::OpenOptions;
        use std::os::unix::fs::OpenOptionsExt;

        let parent = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open("/data/adb")?;
        let metadata = parent.metadata()?;
        if !metadata.is_dir() || metadata.uid() != 0 || metadata.mode() & 0o077 != 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "untrusted Android ADB directory",
            ));
        }
        if unsafe { libc::geteuid() } != 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "archive storage requires root",
            ));
        }
        store::Store::open_or_create(Path::new("/data/adb/susfs-studio"))
    }
    #[cfg(not(target_os = "android"))]
    {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "archive storage is only available on Android",
        ))
    }
}

fn read_archive() -> Result<ReadData, store::SaveError> {
    let stored = archive_store()?.read()?;
    Ok(match stored {
        None => ReadData {
            kind: "empty",
            text: None,
            revision: None,
            receipt: None,
            receipt_status: "missing",
        },
        Some(stored) => ReadData {
            kind: "saved",
            text: std::str::from_utf8(&stored.bytes)
                .map_err(|error| {
                    store::SaveError::BeforeCommit(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        error,
                    ))
                })?
                .to_owned()
                .into(),
            revision: Some(stored.revision),
            receipt_status: if stored.receipt.is_some() {
                "available"
            } else {
                "missing"
            },
            receipt: stored.receipt,
        },
    })
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let action = args.first().map(String::as_str);
    if !matches!(
        (action, args.len()),
        (
            Some(
                "hello"
                    | "status"
                    | "preview"
                    | "stage"
                    | "read"
                    | "export"
                    | "apply"
                    | "verify"
                    | "apps"
                    | "boot-enabled",
            ),
            1
        ) | (
            Some(
                "save"
                    | "import"
                    | "restore"
                    | "backup"
                    | "plan"
                    | "apply-plan"
                    | "retry-plan"
                    | "verify-plan"
                    | "recover-plan"
                    | "operation-status"
                    | "boot"
            ),
            2
        ) | (Some("backups"), 1)
            | (Some("effect-probe"), 3)
    ) {
        std::process::exit(2);
    }
    let output = match action {
        Some("hello") => serde_json::to_string(&response("hello", "studioctl")),
        Some("preview") => {
            let mut input = Vec::new();
            let read = std::io::stdin()
                .lock()
                .take(archive::MAX_ARCHIVE as u64 + 1)
                .read_to_end(&mut input);
            let result = if read.is_err() || input.len() > archive::MAX_ARCHIVE {
                "invalid"
            } else {
                match std::str::from_utf8(&input)
                    .ok()
                    .map(archive::validate_envelope)
                {
                    Some(archive::Envelope::Valid) => "valid",
                    Some(archive::Envelope::Unknown) => "unknown",
                    _ => "invalid",
                }
            };
            serde_json::to_string(&response("preview", result))
        }
        Some("stage") => match archive_store().and_then(|store| store.prepare()) {
            Ok(prepared) => serde_json::to_string(&response(
                "stage",
                StageData {
                    token: prepared.token,
                    upload_path: prepared.upload_path,
                    baseline: prepared.baseline,
                    revision: prepared.revision,
                },
            )),
            Err(error) => serde_json::to_string(&io_failure("stage", error)),
        },
        Some("plan") => {
            let status = status();
            match provider_snapshot(&status) {
                None => {
                    let reason = match &status {
                        Status::Missing => "PROVIDER_MISSING",
                        Status::UnknownProtocol => "PROVIDER_UNKNOWN_PROTOCOL",
                        Status::Failed => "PROVIDER_DIAGNOSTIC_FAILED",
                        Status::Active { .. } => unreachable!(),
                    };
                    let provider = device::ProviderSnapshot {
                        implementation: "unknown".to_owned(),
                        version: "unreported".to_owned(),
                        variant: "unknown".to_owned(),
                        audited: false,
                        features: Vec::new(),
                        boot_id: device::boot_id(),
                        uid: unsafe { libc::geteuid() },
                        proc_nodes: Vec::new(),
                    };
                    match archive_store().and_then(|store| {
                        let (before, after) = store.read_staged_candidate(&args[1])?;
                        operations::create_blocked(
                            &store,
                            before.as_deref(),
                            &after,
                            reason,
                            &provider,
                        )
                    }) {
                        Ok(plan) => {
                            serde_json::to_string(&response("plan", operations::public_json(&plan)))
                        }
                        Err(error) => serde_json::to_string(&io_failure("plan", error)),
                    }
                }
                Some(provider) => match archive_store().and_then(|store| {
                    let (before, after) = store.read_staged_candidate(&args[1])?;
                    operations::create(&store, before.as_deref(), &after, &provider)
                }) {
                    Ok(plan) => {
                        serde_json::to_string(&response("plan", operations::public_json(&plan)))
                    }
                    Err(error) => serde_json::to_string(&io_failure("plan", error)),
                },
            }
        }
        Some("save" | "import") => {
            let id = if action == Some("save") {
                "save"
            } else {
                "import"
            };
            match archive_store().map(|store| store.save_staged(&args[1])) {
                Ok(Ok(receipt)) => serde_json::to_string(&response(id, receipt)),
                Ok(Err(error)) => serde_json::to_string(&failure(id, error)),
                Err(error) => serde_json::to_string(&io_failure(id, error)),
            }
        }
        Some("restore") => match archive_store().map(|store| store.restore_staged(&args[1])) {
            Ok(Ok(receipt)) => serde_json::to_string(&response("restore", receipt)),
            Ok(Err(error)) => serde_json::to_string(&failure("restore", error)),
            Err(error) => serde_json::to_string(&io_failure("restore", error)),
        },
        Some("read" | "export") => {
            let id = if action == Some("read") {
                "read"
            } else {
                "export"
            };
            match read_archive() {
                Ok(data) => serde_json::to_string(&response(id, data)),
                Err(error) => serde_json::to_string(&failure(id, error)),
            }
        }
        Some("apply-plan") => {
            let status = status();
            match provider_snapshot(&status) {
                None => match archive_store().and_then(|store| {
                    operations::blocked_report(&store, &args[1], "PROVIDER_MISSING")
                }) {
                    Ok(report) => serde_json::to_string(&response("apply-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("apply-plan", error)),
                },
                Some(provider) => match archive_store()
                    .and_then(|store| operations::apply(&store, &args[1], &provider))
                {
                    Ok(report) => serde_json::to_string(&response("apply-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("apply-plan", error)),
                },
            }
        }
        Some("verify-plan") => {
            let status = status();
            match provider_snapshot(&status) {
                None => match archive_store().and_then(|store| {
                    operations::blocked_report(&store, &args[1], "PROVIDER_MISSING")
                }) {
                    Ok(report) => serde_json::to_string(&response("verify-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("verify-plan", error)),
                },
                Some(provider) => match archive_store()
                    .and_then(|store| operations::verify(&store, &args[1], &provider))
                {
                    Ok(report) => serde_json::to_string(&response("verify-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("verify-plan", error)),
                },
            }
        }
        Some("retry-plan") => {
            let status = status();
            match provider_snapshot(&status) {
                None => match archive_store().and_then(|store| {
                    operations::blocked_report(&store, &args[1], "PROVIDER_MISSING")
                }) {
                    Ok(report) => serde_json::to_string(&response("retry-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("retry-plan", error)),
                },
                Some(provider) => match archive_store()
                    .and_then(|store| operations::retry(&store, &args[1], &provider))
                {
                    Ok(report) => serde_json::to_string(&response("retry-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("retry-plan", error)),
                },
            }
        }
        Some("recover-plan") => {
            let status = status();
            match provider_snapshot(&status) {
                None => match archive_store().and_then(|store| {
                    operations::blocked_report(&store, &args[1], "PROVIDER_MISSING")
                }) {
                    Ok(report) => serde_json::to_string(&response("recover-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("recover-plan", error)),
                },
                Some(provider) => match archive_store()
                    .and_then(|store| operations::recover(&store, &args[1], &provider))
                {
                    Ok(report) => serde_json::to_string(&response("recover-plan", report)),
                    Err(error) => serde_json::to_string(&io_failure("recover-plan", error)),
                },
            }
        }
        Some("operation-status") => {
            match archive_store().and_then(|store| operations::load(&store, &args[1])) {
                Ok(plan) => serde_json::to_string(&response(
                    "operation-status",
                    operations::public_json(&plan),
                )),
                Err(error) => serde_json::to_string(&io_failure("operation-status", error)),
            }
        }
        Some("apps") => {
            let status = status();
            let allowed = matches!(&status, Status::Active { provider }
                if provider.audited
                    && provider.implementation == "builtin"
                    && provider.capabilities.get("priorityUidFilter") == Some(&"available"));
            if !allowed {
                serde_json::to_string(&response(
                    "apps",
                    serde_json::json!({
                        "status": "blocked",
                        "reason": "TRUSTED_UID_SOURCE_UNAVAILABLE",
                    }),
                ))
            } else {
                match installed_packages() {
                    Ok(packages) => serde_json::to_string(&response(
                        "apps",
                        serde_json::json!({"status":"available", "packages":packages}),
                    )),
                    Err(error) => serde_json::to_string(&io_failure("apps", error)),
                }
            }
        }
        Some("effect-probe") => {
            let path = &args[2];
            if args[1] != "map"
                || !path.starts_with('/')
                || path == "/"
                || path.len() >= 256
                || path.chars().any(char::is_whitespace)
                || path.chars().any(char::is_control)
                || path.split('/').any(|part| matches!(part, "." | ".."))
            {
                serde_json::to_string(&response(
                    "effect-probe",
                    serde_json::json!({"status":"invalid"}),
                ))
            } else {
                Ok(if device::effect_probe_map(path) {
                    "visible"
                } else {
                    "hidden"
                }
                .to_owned())
            }
        }
        Some("boot-enabled") => match archive_store().and_then(|store| store.read()) {
            Ok(Some(stored)) => {
                let status = serde_json::from_slice::<serde_json::Value>(&stored.bytes)
                    .ok()
                    .map(|root| operations::automatic_enabled(&root))
                    .map_or(
                        "invalid",
                        |enabled| {
                            if enabled { "enabled" } else { "disabled" }
                        },
                    );
                serde_json::to_string(&response(
                    "boot-enabled",
                    serde_json::json!({"status":status}),
                ))
            }
            Ok(None) => serde_json::to_string(&response(
                "boot-enabled",
                serde_json::json!({"status":"missing"}),
            )),
            Err(error) => serde_json::to_string(&io_failure("boot-enabled", error)),
        },
        Some("boot") => {
            let status = status();
            match provider_snapshot(&status) {
                None => serde_json::to_string(&response(
                    "boot",
                    serde_json::json!({"status":"deferred", "reason":"PROVIDER_MISSING"}),
                )),
                Some(provider) => match archive_store()
                    .and_then(|store| operations::boot(&store, &args[1], &provider))
                {
                    Ok(report) => serde_json::to_string(&response("boot", report)),
                    Err(error) => serde_json::to_string(&io_failure("boot", error)),
                },
            }
        }
        Some("apply" | "verify") => serde_json::to_string(&response(
            if action == Some("apply") {
                "apply"
            } else {
                "verify"
            },
            serde_json::json!({"status":"rejected", "reason":"PROVIDER_NOT_AUTHORIZED", "rules":{}}),
        )),
        Some("backups") => match archive_store().and_then(|store| store.backups()) {
            Ok(data) => serde_json::to_string(&response("backups", data)),
            Err(error) => serde_json::to_string(&io_failure("backups", error)),
        },
        Some("backup") => match archive_store().and_then(|store| store.read_backup(&args[1])) {
            Ok(data) => serde_json::to_string(&response(
                "backup",
                serde_json::json!({
                    "kind": "saved", "text": String::from_utf8(data.bytes).unwrap(), "revision": data.revision
                }),
            )),
            Err(error) => serde_json::to_string(&io_failure("backup", error)),
        },
        _ => {
            let status = status();
            let control = Control::for_status(&status);
            serde_json::to_string(&response(
                "status",
                StatusData {
                    status,
                    device: device(),
                    control,
                },
            ))
        }
    };
    match output {
        Ok(json) => println!("{json}"),
        Err(_) => std::process::exit(1),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn reply(text: &str) -> Reply {
        Reply {
            error: 0,
            text: Some(text.to_owned()),
            modified: !text.is_empty(),
            absent: false,
        }
    }
    #[test]
    fn matches_shared_response_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../contracts/diagnostic-v1.json")).unwrap();
        assert_eq!(
            serde_json::to_value(response("hello", "studioctl")).unwrap(),
            fixtures["hello"]
        );
        let mut active = classify(
            reply("v2.3.0"),
            reply("CONFIG_KSU_SUSFS_SUS_PATH\nCONFIG_KSU_SUSFS_ENABLE_LOG\nSUSFS_LKM_MODULES"),
            reply("GKI-LKM"),
        );
        if let Status::Active { provider } = &mut active {
            provider.proc_nodes = vec!["susfs_path".to_owned(), "susfs_enable_log".to_owned()];
        }
        for (name, status) in [
            ("active", active),
            ("missing", Status::Missing),
            ("unknownProtocol", Status::UnknownProtocol),
            ("failed", Status::Failed),
        ] {
            let device = (name == "active").then(|| Device {
                model: Some("Demo phone".into()),
                system: Some("Android 17 (API 37)".into()),
                kernel: Some("6.6.118-demo".into()),
            });
            let control = Control::for_status(&status);
            let result = serde_json::to_value(response(
                "status",
                StatusData {
                    status,
                    device,
                    control,
                },
            ))
            .unwrap();
            assert_eq!(result, fixtures[name]);
        }
    }
    #[test]
    fn recognizes_complete_lkm_response() {
        let status = classify(
            reply("v2.3.0"),
            reply("CONFIG_KSU_SUSFS_SUS_PATH\nCONFIG_KSU_SUSFS_ENABLE_LOG\nSUSFS_LKM_MODULES"),
            reply("GKI-LKM"),
        );
        assert!(
            matches!(status, Status::Active { provider } if provider.implementation == "lkm"
                && provider.kernel_type == "GKI"
                && provider.variant == "GKI-LKM"
                && provider.audited
                && provider.features.contains(&"CONFIG_KSU_SUSFS_SUS_PATH".to_owned())
                && provider.capabilities["paths"] == "available"
                && provider.capabilities["logging"] == "available")
        );
    }
    #[test]
    fn inconsistent_lkm_variant_has_unknown_implementation() {
        let status = classify(
            reply("v2.3.0"),
            reply("CONFIG_KSU_SUSFS_SUS_PATH"),
            reply("GKI-LKM"),
        );
        assert!(
            matches!(status, Status::Active { provider } if provider.implementation == "unknown" && !provider.audited)
        );
    }
    #[test]
    fn unfamiliar_version_is_reported_without_audit() {
        let status = classify(
            reply("v9.0.0"),
            reply("CONFIG_KSU_SUSFS_SUS_PATH"),
            reply("GKI"),
        );
        assert!(matches!(status, Status::Active { provider } if !provider.audited));
    }

    #[test]
    fn rejects_feature_reports_the_web_boundary_cannot_accept() {
        for features in [
            "CONFIG_KSU_SUSFS_",
            "CONFIG_KSU_SUSFS_lower",
            "CONFIG_KSU_SUSFS_PATH\nCONFIG_KSU_SUSFS_PATH",
        ] {
            assert!(matches!(
                classify(reply("v2.3.0"), reply(features), reply("GKI")),
                Status::UnknownProtocol
            ));
        }
    }
    #[test]
    fn never_marks_unknown_response_active() {
        let untouched = || Reply {
            error: 126,
            text: Some(String::new()),
            modified: false,
            absent: true,
        };
        assert!(matches!(
            classify(untouched(), untouched(), untouched()),
            Status::Missing
        ));
        assert!(matches!(
            classify(reply("v2.3.0"), reply("unexpected"), reply("GKI")),
            Status::UnknownProtocol
        ));
        assert!(matches!(
            classify(
                Reply {
                    error: 126,
                    text: None,
                    modified: false,
                    absent: false
                },
                untouched(),
                untouched()
            ),
            Status::Failed
        ));
        assert!(matches!(
            classify(
                reply("v2.3.0"),
                Reply {
                    error: 126,
                    text: None,
                    modified: false,
                    absent: false
                },
                untouched()
            ),
            Status::UnknownProtocol
        ));
        assert!(matches!(
            classify(
                Reply {
                    error: 126,
                    text: Some("v2.3.0".into()),
                    modified: true,
                    absent: true
                },
                untouched(),
                untouched()
            ),
            Status::UnknownProtocol
        ));
    }
}
