use serde::Serialize;
use std::collections::BTreeMap;

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

#[derive(Debug)]
#[cfg(any(target_os = "android", test))]
struct Reply {
    error: i32,
    text: Option<String>,
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
        absent,
    }
}

#[cfg(any(target_os = "android", test))]
fn classify(version: Reply, features: Reply, variant: Reply) -> Status {
    let replies = [&version, &features, &variant];
    if replies
        .iter()
        .all(|reply| reply.error == 126 && reply.absent)
    {
        return Status::Missing;
    }
    if replies.iter().all(|reply| reply.error == 126) && replies.iter().any(|reply| !reply.absent) {
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
    let implementation = if tokens.contains(&"SUSFS_LKM_MODULES") {
        "lkm"
    } else {
        "builtin"
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
        _ => serde_json::to_string(&response("status", status())),
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
            assert_eq!(
                serde_json::to_value(response("status", status)).unwrap(),
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
    fn never_marks_unknown_response_active() {
        let untouched = || Reply {
            error: 126,
            text: Some(String::new()),
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
                    absent: false
                },
                untouched()
            ),
            Status::UnknownProtocol
        ));
    }
}
