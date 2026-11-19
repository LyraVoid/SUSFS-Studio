use serde::Serialize;
use std::collections::BTreeMap;

#[cfg(test)]
mod archive;

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
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Status {
    Active { provider: Provider },
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
    capabilities: BTreeMap<&'static str, &'static str>,
}

#[derive(Serialize)]
struct StatusData {
    #[serde(flatten)]
    status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    device: Option<Device>,
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
        || version_text.is_empty()
        || tokens.is_empty()
        || !matches!(variant_text.as_str(), "GKI" | "NON-GKI" | "GKI-LKM")
        || tokens
            .iter()
            .any(|token| *token != "SUSFS_LKM_MODULES" && !token.starts_with("CONFIG_KSU_SUSFS_"))
    {
        return Status::UnknownProtocol;
    }
    let implementation = match (variant_text.as_str(), tokens.contains(&"SUSFS_LKM_MODULES")) {
        ("GKI-LKM", true) => "lkm",
        ("GKI-LKM", false) | (_, true) => "unknown",
        (_, false) => "builtin",
    };
    let mut capabilities = BTreeMap::new();
    for (key, token) in [
        ("paths", "CONFIG_KSU_SUSFS_SUS_PATH"),
        ("map", "CONFIG_KSU_SUSFS_SUS_MAP"),
        ("kstat", "CONFIG_KSU_SUSFS_SUS_KSTAT"),
        ("redirect", "CONFIG_KSU_SUSFS_OPEN_REDIRECT"),
    ] {
        capabilities.insert(
            key,
            if tokens.contains(&token) {
                "available"
            } else {
                "unavailable"
            },
        );
    }
    Status::Active {
        provider: Provider {
            implementation,
            kernel_type: if variant_text.starts_with("GKI") {
                "GKI"
            } else {
                "unknown"
            },
            version: version_text.clone(),
            capabilities,
        },
    }
}

fn status() -> Status {
    #[cfg(target_os = "android")]
    {
        if unsafe { libc::geteuid() } != 0 {
            return Status::Failed;
        }
        classify(
            query::<16>(0x555e1),
            query::<8192>(0x555e2),
            query::<16>(0x555e3),
        )
    }
    #[cfg(not(target_os = "android"))]
    {
        Status::Failed
    }
}

fn main() {
    let action = std::env::args().nth(1);
    if std::env::args().len() != 2 || !matches!(action.as_deref(), Some("hello" | "status")) {
        std::process::exit(2);
    }
    let output = match action.as_deref() {
        Some("hello") => serde_json::to_string(&response("hello", "studioctl")),
        _ => serde_json::to_string(&response(
            "status",
            StatusData {
                status: status(),
                device: device(),
            },
        )),
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
        let active = classify(
            reply("v2.3.0"),
            reply("CONFIG_KSU_SUSFS_SUS_PATH\nSUSFS_LKM_MODULES"),
            reply("GKI-LKM"),
        );
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
            assert_eq!(
                serde_json::to_value(response("status", StatusData { status, device })).unwrap(),
                fixtures[name]
            );
        }
    }
    #[test]
    fn recognizes_complete_lkm_response() {
        let status = classify(
            reply("v2.3.0"),
            reply("CONFIG_KSU_SUSFS_SUS_PATH\nSUSFS_LKM_MODULES"),
            reply("GKI-LKM"),
        );
        assert!(
            matches!(status, Status::Active { provider } if provider.implementation == "lkm" && provider.kernel_type == "GKI" && provider.capabilities["paths"] == "available")
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
            matches!(status, Status::Active { provider } if provider.implementation == "unknown")
        );
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
