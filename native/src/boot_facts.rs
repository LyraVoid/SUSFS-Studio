#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::Serialize;

const MAX_CMDLINE: usize = 8 * 1024;
const MAX_BOOTCONFIG: usize = 16 * 1024;
const MAX_KERNEL_FIELD: usize = 64;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootFacts {
    pub parser: &'static str,
    pub read_at: u64,
    pub current_slot: Option<String>,
    pub evidence: Vec<BootEvidence>,
    pub slots: Vec<BootSlot>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootEvidence {
    pub source: String,
    pub slot: Option<String>,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootSlot {
    pub id: String,
    pub current: bool,
    pub source: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<BootField>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<BootField>,
    pub cmdline: Vec<BootField>,
    pub bootconfig: Vec<BootField>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootField {
    pub value: String,
    pub source: &'static str,
    pub confidence: &'static str,
}

#[cfg(target_os = "android")]
pub fn read() -> Option<BootFacts> {
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    let suffix = crate::device::property(c"ro.boot.slot_suffix");
    let current_slot = suffix.as_deref().and_then(normalize_slot);
    let mut evidence = vec![BootEvidence {
        source: "ro.boot.slot_suffix".to_owned(),
        slot: current_slot.clone(),
        status: if current_slot.is_some() {
            "ok"
        } else if suffix.is_some() {
            "invalid"
        } else {
            "unavailable"
        },
        detail: suffix,
    }];
    let release =
        read_field("/proc/sys/kernel/osrelease", MAX_KERNEL_FIELD, false).map(|value| BootField {
            value,
            source: "/proc/sys/kernel/osrelease",
            confidence: "current-runtime",
        });
    let version =
        read_field("/proc/sys/kernel/version", MAX_KERNEL_FIELD, false).map(|value| BootField {
            value,
            source: "/proc/sys/kernel/version",
            confidence: "current-runtime",
        });
    let cmdline = read_field("/proc/cmdline", MAX_CMDLINE, false);
    let bootconfig = read_field("/proc/bootconfig", MAX_BOOTCONFIG, true);
    let mut current = BootSlot {
        id: current_slot.clone().unwrap_or_else(|| "current".to_owned()),
        current: true,
        source: "current-runtime",
        release,
        version,
        cmdline: cmdline
            .map(|value| BootField {
                value,
                source: "/proc/cmdline",
                confidence: "current-runtime",
            })
            .into_iter()
            .collect(),
        bootconfig: bootconfig
            .map(|value| BootField {
                value,
                source: "/proc/bootconfig",
                confidence: "current-runtime",
            })
            .into_iter()
            .collect(),
        note: None,
    };
    if current.release.is_none()
        || current.version.is_none()
        || current.cmdline.is_empty()
        || current.bootconfig.is_empty()
    {
        current.note = Some("Some active-runtime fields were unavailable or invalid.".to_owned());
    }
    let mut slots = vec![current];
    if let Some(slot) = &current_slot {
        for id in ["a", "b"] {
            if id == slot {
                continue;
            }
            let path = format!("/dev/block/by-name/boot_{id}");
            if Path::new(&path).symlink_metadata().is_err() {
                continue;
            }
            evidence.push(BootEvidence {
                source: "by-name".to_owned(),
                slot: Some(id.to_owned()),
                status: "inactive-image-present",
                detail: Some(path),
            });
            slots.push(BootSlot {
                id: id.to_owned(),
                current: false,
                source: "inactive-image",
                release: None,
                version: None,
                cmdline: Vec::new(),
                bootconfig: Vec::new(),
                note: Some(
                    "The read-only boot image exists; runtime values require booting this slot."
                        .to_owned(),
                ),
            });
        }
    }
    slots.sort_by(|left, right| left.id.cmp(&right.id));
    Some(BootFacts {
        parser: "studio-boot-facts/1",
        read_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map_or(0, |duration| duration.as_millis() as u64),
        current_slot,
        evidence,
        slots,
    })
}

#[cfg(not(target_os = "android"))]
pub fn read() -> Option<BootFacts> {
    None
}

#[cfg(target_os = "android")]
fn read_field(path: &str, limit: usize, multiline: bool) -> Option<String> {
    use std::fs::File;
    use std::io::Read;

    let mut bytes = Vec::new();
    File::open(path)
        .ok()?
        .take(u64::try_from(limit).ok()? + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > limit {
        return None;
    }
    let value = std::str::from_utf8(&bytes).ok()?.trim_end().to_owned();
    if value.is_empty()
        || value.chars().any(|character| {
            character == '\0'
                || (character.is_control()
                    && character != '\t'
                    && !(multiline && matches!(character, '\n' | '\r')))
                || (!multiline && matches!(character, '\n' | '\r'))
        })
    {
        return None;
    }
    Some(value)
}

#[cfg(target_os = "android")]
fn normalize_slot(value: &str) -> Option<String> {
    let slot = value.trim().trim_start_matches('_');
    (!slot.is_empty() && slot.len() <= 32 && slot.bytes().all(|byte| byte.is_ascii_alphanumeric()))
        .then(|| slot.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "android")]
    use super::normalize_slot;

    #[cfg(target_os = "android")]
    #[test]
    fn slot_suffix_is_normalized_without_accepting_paths() {
        assert_eq!(normalize_slot("_a").as_deref(), Some("a"));
        assert_eq!(normalize_slot("B").as_deref(), Some("b"));
        assert_eq!(normalize_slot("../../a"), None);
    }
}
