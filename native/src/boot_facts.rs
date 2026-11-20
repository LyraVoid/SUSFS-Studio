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
    pub status: &'static str,
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
    pub source: String,
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
            source: "/proc/sys/kernel/osrelease".to_owned(),
            confidence: "current-runtime",
        });
    let version =
        read_field("/proc/sys/kernel/version", MAX_KERNEL_FIELD, false).map(|value| BootField {
            value,
            source: "/proc/sys/kernel/version".to_owned(),
            confidence: "current-runtime",
        });
    let cmdline = read_field("/proc/cmdline", MAX_CMDLINE, false);
    let bootconfig = read_field("/proc/bootconfig", MAX_BOOTCONFIG, true);
    let mut current = BootSlot {
        id: current_slot.clone().unwrap_or_else(|| "current".to_owned()),
        current: true,
        source: "current-runtime",
        status: "current-runtime",
        release,
        version,
        cmdline: cmdline
            .map(|value| BootField {
                value,
                source: "/proc/cmdline".to_owned(),
                confidence: "current-runtime",
            })
            .into_iter()
            .collect(),
        bootconfig: bootconfig
            .map(|value| BootField {
                value,
                source: "/proc/bootconfig".to_owned(),
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
            slots.push(read_image_slot(id));
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
fn read_image_slot(id: &str) -> BootSlot {
    use std::collections::BTreeSet;
    use std::path::Path;

    let mut parsed = Vec::new();
    let mut present = 0;
    for role in ["boot", "init_boot", "vendor_boot"] {
        let path = format!("/dev/block/by-name/{role}_{id}");
        if Path::new(&path).symlink_metadata().is_err() {
            continue;
        }
        present += 1;
        match parse_image(&path, role) {
            Ok(image) => parsed.push(image),
            Err(()) => {}
        }
    }
    let release = parsed
        .iter()
        .filter_map(|image| image.release.as_ref())
        .map(|(value, source)| (value.clone(), source.clone()))
        .collect::<BTreeSet<_>>();
    let version = parsed
        .iter()
        .filter_map(|image| image.version.as_ref())
        .map(|(value, source)| (value.clone(), source.clone()))
        .collect::<BTreeSet<_>>();
    let field = |(value, source): &(String, String)| BootField {
        value: value.clone(),
        source: source.clone(),
        confidence: "boot-image",
    };
    BootSlot {
        id: id.to_owned(),
        current: false,
        source: "inactive-image",
        status: if parsed.iter().any(|image| !image.empty) {
            "parsed-image"
        } else if present > 0 && parsed.len() == present {
            "empty-image"
        } else {
            "invalid-image"
        },
        release: (release.len() == 1)
            .then(|| release.first().map(field))
            .flatten(),
        version: (version.len() == 1)
            .then(|| version.first().map(field))
            .flatten(),
        cmdline: parsed
            .iter()
            .flat_map(|image| image.cmdline.iter())
            .cloned()
            .collect(),
        bootconfig: parsed
            .iter()
            .flat_map(|image| image.bootconfig.iter())
            .cloned()
            .collect(),
        note: None,
    }
}

#[cfg(unix)]
struct ParsedImage {
    empty: bool,
    release: Option<(String, String)>,
    version: Option<(String, String)>,
    cmdline: Vec<BootField>,
    bootconfig: Vec<BootField>,
}

#[cfg(unix)]
fn parse_image(path: &str, role: &str) -> Result<ParsedImage, ()> {
    use android_bootimg::parser::{BootImage, BootImageVersion};
    use memmap2::MmapOptions;
    use std::fs::File;
    use std::io::{Seek, SeekFrom};
    use std::os::fd::AsRawFd;
    use std::os::unix::fs::FileExt;

    const AVB_FOOTER_MAGIC: &[u8; 4] = b"AVBf";
    const AVB_FOOTER_SIZE: u64 = 64;
    const BLKGETSIZE64: u32 = 0x8008_1272;
    const MAX_KERNEL_PROBE: usize = 256 * 1024 * 1024;

    let file = File::open(path).map_err(|_| ())?;
    let metadata = file.metadata().map_err(|_| ())?;
    let source_size = if metadata.is_file() {
        metadata.len()
    } else {
        let mut size = 0_u64;
        if unsafe { libc::ioctl(file.as_raw_fd(), BLKGETSIZE64 as _, &raw mut size) } != 0 {
            let mut seekable = file.try_clone().map_err(|_| ())?;
            seekable.seek(SeekFrom::End(0)).map_err(|_| ())?
        } else {
            size
        }
    };
    if source_size < 8 {
        return Ok(ParsedImage {
            empty: true,
            release: None,
            version: None,
            cmdline: Vec::new(),
            bootconfig: Vec::new(),
        });
    }
    let mut magic = [0_u8; 8];
    file.read_exact_at(&mut magic, 0).map_err(|_| ())?;
    if magic.iter().all(|byte| *byte == 0) {
        return Ok(ParsedImage {
            empty: true,
            release: None,
            version: None,
            cmdline: Vec::new(),
            bootconfig: Vec::new(),
        });
    }
    let payload_size = if source_size >= AVB_FOOTER_SIZE {
        let mut footer = [0_u8; AVB_FOOTER_SIZE as usize];
        file.read_exact_at(&mut footer, source_size - AVB_FOOTER_SIZE)
            .map_err(|_| ())?;
        if &footer[..4] == AVB_FOOTER_MAGIC {
            let original = u64::from_be_bytes(footer[12..20].try_into().map_err(|_| ())?);
            if original == 0 || original > source_size {
                return Err(());
            }
            original
        } else {
            source_size
        }
    } else {
        source_size
    };
    let payload_size = usize::try_from(payload_size).map_err(|_| ())?;
    let mapping = unsafe { MmapOptions::new().len(payload_size).map(&file) }.map_err(|_| ())?;
    let boot = std::panic::catch_unwind(|| BootImage::parse(&mapping))
        .map_err(|_| ())?
        .map_err(|_| ())?;
    let header = boot.get_header();
    let format = match header.get_version() {
        BootImageVersion::Android(_) => "android",
        BootImageVersion::Vendor(_) => "vendor",
        BootImageVersion::RawRamdisk => "ramdisk",
    };
    let (release, version) = boot
        .get_blocks()
        .get_kernel()
        .map_or((None, None), |kernel| {
            let mut output = ProbeOutput::new(MAX_KERNEL_PROBE);
            if kernel.dump(&mut output, false).is_err() || output.exceeded {
                return (None, None);
            }
            linux_banner(&output.bytes).unwrap_or((None, None))
        });
    let source = |field: &str| format!("{role}_{field}:{format}");
    let mut cmdline = Vec::new();
    let mut parts = Vec::new();
    if header.has_cmdline()
        && let Some(value) = c_string(header.get_cmdline())
    {
        parts.push(value);
    }
    if header.has_extra_cmdline()
        && let Some(value) = c_string(header.get_extra_cmdline())
    {
        parts.push(value);
    }
    if !parts.is_empty() {
        cmdline.push(BootField {
            value: parts.join(" "),
            source: source("header_cmdline"),
            confidence: "boot-image",
        });
    }
    let bootconfig = bootconfig_value(&boot, &mapping)
        .ok()
        .flatten()
        .map(|value| {
            vec![BootField {
                value,
                source: source("header_bootconfig"),
                confidence: "boot-image",
            }]
        })
        .unwrap_or_default();
    Ok(ParsedImage {
        empty: false,
        release: release.map(|value| (value, source("linux_banner"))),
        version: version.map(|value| (value, source("linux_banner"))),
        cmdline,
        bootconfig,
    })
}

#[cfg(unix)]
struct ProbeOutput {
    bytes: Vec<u8>,
    limit: usize,
    exceeded: bool,
}

#[cfg(unix)]
impl ProbeOutput {
    const fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
            exceeded: false,
        }
    }
}

#[cfg(unix)]
impl std::io::Write for ProbeOutput {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        if self.bytes.len().saturating_add(buffer.len()) > self.limit {
            self.exceeded = true;
            return Err(std::io::Error::other("kernel parser output limit exceeded"));
        }
        self.bytes.extend_from_slice(buffer);
        Ok(buffer.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(unix)]
fn bootconfig_value(
    boot: &android_bootimg::parser::BootImage<'_>,
    payload: &[u8],
) -> Result<Option<String>, ()> {
    use android_bootimg::parser::BootImageVersion;
    if !matches!(boot.get_header().get_version(), BootImageVersion::Vendor(4)) {
        return Ok(None);
    }
    let header = boot.get_header();
    let size = header.get_bootconfig_size() as usize;
    if size == 0 {
        return Ok(None);
    }
    let page = header.page_size();
    let align = |value: usize| -> Option<usize> {
        (page > 0)
            .then(|| value.checked_add(page - 1))
            .flatten()
            .map(|value| value / page * page)
    };
    let offset = header
        .hdr_space()
        .checked_add(align(header.get_ramdisk_size() as usize).ok_or(())?)
        .and_then(|value| value.checked_add(align(header.get_dtb_size() as usize)?))
        .and_then(|value| {
            value.checked_add(align(header.get_vendor_ramdisk_table_size() as usize)?)
        })
        .ok_or(())?;
    let bytes = payload
        .get(offset..offset.checked_add(size).ok_or(())?)
        .ok_or(())?;
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    let value = std::str::from_utf8(&bytes[..end])
        .map_err(|_| ())?
        .trim_end();
    Ok((!value.is_empty()).then(|| value.to_owned()))
}

#[cfg(unix)]
fn c_string(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|byte| *byte == 0)?;
    std::str::from_utf8(&bytes[..end])
        .ok()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(unix)]
fn linux_banner(kernel: &[u8]) -> Result<(Option<String>, Option<String>), ()> {
    use std::collections::BTreeSet;

    const NEEDLE: &[u8] = b"Linux version ";
    let mut candidates = BTreeSet::new();
    let mut offset = 0;
    while let Some(found) = kernel[offset..]
        .windows(NEEDLE.len())
        .position(|window| window == NEEDLE)
    {
        let start = offset + found;
        let end = kernel[start..]
            .iter()
            .position(|byte| matches!(*byte, b'\0' | b'\n'))
            .map_or(kernel.len(), |length| start + length);
        if let Ok(line) = std::str::from_utf8(&kernel[start..end])
            && let Some(value) = parse_banner_line(line)
        {
            candidates.insert(value);
        }
        offset = start + NEEDLE.len();
        if offset >= kernel.len() {
            break;
        }
    }
    if candidates.len() == 1 {
        let (release, version) = candidates.into_iter().next().ok_or(())?;
        Ok((Some(release), Some(version)))
    } else {
        Ok((None, None))
    }
}

#[cfg(unix)]
fn parse_banner_line(line: &str) -> Option<(String, String)> {
    let release = line
        .strip_prefix("Linux version ")?
        .split_whitespace()
        .next()?;
    if release.len() > 64
        || !release
            .bytes()
            .all(|byte| byte.is_ascii_graphic() || byte == b' ')
    {
        return None;
    }
    let version_start = line.rfind(") #").map(|offset| offset + 2)?;
    let version = line[version_start..].trim();
    if version.is_empty() || version.len() > 64 || version.chars().any(char::is_control) {
        return None;
    }
    Some((release.to_owned(), version.to_owned()))
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
    #[cfg(unix)]
    use super::parse_image;
    #[cfg(unix)]
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    #[cfg(unix)]
    static NEXT_IMAGE: AtomicU64 = AtomicU64::new(0);

    #[cfg(unix)]
    fn test_image(bytes: &[u8]) -> (PathBuf, impl Drop + use<>) {
        struct Remove(PathBuf);
        impl Drop for Remove {
            fn drop(&mut self) {
                let _ = fs::remove_file(&self.0);
            }
        }

        let path = std::env::temp_dir().join(format!(
            "susfs-studio-boot-{}-{}.img",
            std::process::id(),
            NEXT_IMAGE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::write(&path, bytes).unwrap();
        (path.clone(), Remove(path))
    }

    #[cfg(unix)]
    fn android_boot_image(cmdline: &str, kernel: &[u8]) -> Vec<u8> {
        const PAGE: usize = 2048;
        let mut image = vec![0_u8; PAGE + kernel.len()];
        image[..8].copy_from_slice(b"ANDROID!");
        image[8..12].copy_from_slice(&(kernel.len() as u32).to_le_bytes());
        image[36..40].copy_from_slice(&(PAGE as u32).to_le_bytes());
        image[64..64 + cmdline.len()].copy_from_slice(cmdline.as_bytes());
        image[PAGE..].copy_from_slice(kernel);
        image
    }

    #[cfg(unix)]
    #[test]
    fn parses_bounded_values_from_an_inactive_boot_image() {
        let image = android_boot_image(
            "androidboot.slot_suffix=_b",
            b"padding\0Linux version 6.6.118-test (builder@host) #1 SMP PREEMPT\0",
        );
        let (path, cleanup) = test_image(&image);
        let parsed = parse_image(path.to_str().unwrap(), "boot").unwrap();
        assert!(!parsed.empty);
        assert_eq!(parsed.release.unwrap().0, "6.6.118-test");
        assert_eq!(parsed.version.unwrap().0, "#1 SMP PREEMPT");
        assert_eq!(parsed.cmdline[0].value, "androidboot.slot_suffix=_b");
        assert_eq!(parsed.cmdline[0].confidence, "boot-image");
        drop(cleanup);
    }

    #[cfg(unix)]
    #[test]
    fn distinguishes_empty_and_invalid_inactive_images() {
        let (path, cleanup) = test_image(&[0_u8; 4096]);
        assert!(parse_image(path.to_str().unwrap(), "boot").unwrap().empty);
        drop(cleanup);

        let (path, cleanup) = test_image(b"not an Android boot image");
        assert!(parse_image(path.to_str().unwrap(), "boot").is_err());
        drop(cleanup);
    }

    #[cfg(target_os = "android")]
    #[test]
    fn slot_suffix_is_normalized_without_accepting_paths() {
        assert_eq!(normalize_slot("_a").as_deref(), Some("a"));
        assert_eq!(normalize_slot("B").as_deref(), Some("b"));
        assert_eq!(normalize_slot("../../a"), None);
    }
}
