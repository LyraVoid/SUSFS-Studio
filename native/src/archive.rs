use serde::Deserialize;
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

pub const MAX_ARCHIVE: usize = 128 * 1024;
pub const MAX_RULES: usize = 128;

#[derive(Debug, PartialEq, Eq)]
enum Value {
    Object(BTreeMap<String, Value>),
    Array(Vec<Value>),
    String(String),
    Number(String),
    Bool(bool),
    Null,
}

impl<'de> Deserialize<'de> for Value {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ValueVisitor;
        impl<'de> Visitor<'de> for ValueVisitor {
            type Value = Value;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a JSON value")
            }
            fn visit_bool<E: de::Error>(self, value: bool) -> Result<Value, E> {
                Ok(Value::Bool(value))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
                Ok(Value::Null)
            }
            fn visit_i64<E: de::Error>(self, n: i64) -> Result<Value, E> {
                Ok(Value::Number(n.to_string()))
            }
            fn visit_u64<E: de::Error>(self, n: u64) -> Result<Value, E> {
                Ok(Value::Number(n.to_string()))
            }
            fn visit_f64<E: de::Error>(self, _: f64) -> Result<Value, E> {
                Ok(Value::Number(String::new()))
            }
            fn visit_str<E: de::Error>(self, s: &str) -> Result<Value, E> {
                Ok(Value::String(s.to_owned()))
            }
            fn visit_string<E: de::Error>(self, s: String) -> Result<Value, E> {
                Ok(Value::String(s))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
                let mut values = Vec::new();
                while let Some(value) = seq.next_element()? {
                    values.push(value);
                }
                Ok(Value::Array(values))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
                let mut values = BTreeMap::new();
                while let Some(key) = map.next_key::<String>()? {
                    let value = map.next_value()?;
                    if values.insert(key, value).is_some() {
                        return Err(de::Error::custom("duplicate key"));
                    }
                }
                Ok(Value::Object(values))
            }
        }
        deserializer.deserialize_any(ValueVisitor)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Envelope {
    Valid,
    Invalid,
    Unknown,
}

fn exceeds_depth(text: &str) -> bool {
    let mut depth = 0_u32;
    let mut string = false;
    let mut escape = false;
    for byte in text.bytes() {
        if string {
            if escape {
                escape = false;
            } else if byte == b'\\' {
                escape = true;
            } else if byte == b'"' {
                string = false;
            }
        } else {
            match byte {
                b'"' => string = true,
                b'{' | b'[' => {
                    depth += 1;
                    if depth > 64 {
                        return true;
                    }
                }
                b'}' | b']' => depth = depth.saturating_sub(1),
                _ => {}
            }
        }
    }
    false
}

pub fn validate_envelope(text: &str) -> Envelope {
    if text.len() > MAX_ARCHIVE || exceeds_depth(text) {
        return Envelope::Invalid;
    }
    let Ok(Value::Object(root)) = serde_json::from_str::<Value>(text) else {
        return Envelope::Invalid;
    };
    if !matches!(root.get("format"), Some(Value::String(value)) if value == "susfs-studio")
        || !matches!(root.get("schema"), Some(Value::Number(value)) if matches!(value.as_str(), "1" | "2"))
    {
        return Envelope::Unknown;
    }
    if matches!(root.get("schema"), Some(Value::Number(value)) if value == "2")
        && !valid_settings(&root)
    {
        return Envelope::Invalid;
    }
    let Some(Value::Object(rules)) = root.get("rules") else {
        return Envelope::Invalid;
    };
    let mut ids = BTreeSet::new();
    let mut identities = BTreeSet::new();
    let mut count = 0_usize;
    for group in ["paths", "maps", "kstats", "redirects"] {
        let Some(Value::Array(entries)) = rules.get(group) else {
            return Envelope::Invalid;
        };
        count += entries.len();
        if count > MAX_RULES {
            return Envelope::Invalid;
        }
        for entry in entries {
            let Value::Object(entry) = entry else {
                return Envelope::Invalid;
            };
            let Some(Value::String(id)) = entry.get("id") else {
                return Envelope::Invalid;
            };
            if !valid_id(id) || !ids.insert(id) {
                return Envelope::Invalid;
            }
            let Some(Value::String(path)) = entry.get("path") else {
                return Envelope::Invalid;
            };
            if !valid_path(path) || !identities.insert((group, path)) {
                return Envelope::Invalid;
            }
            match group {
                "paths" => {
                    if !matches!(entry.get("looping"), Some(Value::Bool(_))) {
                        return Envelope::Invalid;
                    }
                }
                "maps" => {}
                "kstats" => {
                    let Some(Value::String(mode)) = entry.get("mode") else {
                        return Envelope::Invalid;
                    };
                    match (mode.as_str(), entry.get("static")) {
                        ("normal" | "fullClone", None) => {}
                        ("static", Some(Value::Object(fields))) => {
                            if !valid_static(fields) {
                                return Envelope::Invalid;
                            }
                        }
                        _ => return Envelope::Invalid,
                    }
                }
                "redirects" => {
                    let Some(Value::String(destination)) = entry.get("destination") else {
                        return Envelope::Invalid;
                    };
                    let Some(Value::Number(uid_scheme)) = entry.get("uidScheme") else {
                        return Envelope::Invalid;
                    };
                    if !valid_path(destination)
                        || destination == path
                        || !matches!(uid_scheme.as_str(), "0" | "1" | "2" | "3" | "4")
                    {
                        return Envelope::Invalid;
                    }
                }
                _ => unreachable!(),
            }
        }
    }
    Envelope::Valid
}

fn valid_list(value: Option<&Value>, limit: usize, valid: impl Fn(&str) -> bool) -> bool {
    let Some(value) = value else { return true };
    let Value::Array(entries) = value else {
        return false;
    };
    let mut seen = BTreeSet::new();
    let mut size = 0;
    entries.len() <= limit
        && entries.iter().all(|entry| {
            let Value::String(entry) = entry else {
                return false;
            };
            size += entry.len() + 1;
            size <= 65535 && valid(entry) && seen.insert(entry)
        })
}

fn valid_settings(root: &BTreeMap<String, Value>) -> bool {
    let switches =
        |value: Option<&Value>| matches!(value, None | Some(Value::Null | Value::Bool(_)));
    let text = |value: &str, limit, multiline| {
        !value.trim().is_empty()
            && value.len() < limit
            && value
                .chars()
                .all(|c| !c.is_control() || (multiline && matches!(c, '\n' | '\t')))
    };
    switches(root.get("automatic"))
        && !matches!(root.get("automatic"), Some(Value::Null))
        && match root.get("settings") {
            None => true,
            Some(Value::Object(settings)) => {
                ["hideMounts", "logging", "avcSpoof"]
                    .iter()
                    .all(|key| switches(settings.get(*key)))
                    && valid_list(settings.get("priorityUidFilter"), 65535, |name| {
                        !name.is_empty()
                            && name.len() <= 255
                            && !matches!(name, "." | "..")
                            && name
                                .bytes()
                                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_'))
                    })
            }
            _ => false,
        } && match root.get("uname") {
        None | Some(Value::Null) => true,
        Some(Value::Object(uname)) => ["release", "version"].iter().all(
            |key| matches!(uname.get(*key), Some(Value::String(value)) if text(value, 65, false)),
        ),
        _ => false,
    } && match root.get("cmdline") {
        None | Some(Value::Null) => true,
        Some(Value::String(value)) => value.is_empty() || text(value, 8192, true),
        _ => false,
    } && match root.get("lkm") {
        None => true,
        Some(Value::Object(lkm)) => {
            valid_list(lkm.get("hiddenModules"), 16, |name| {
                !name.is_empty()
                    && name.len() <= 63
                    && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
            }) && valid_list(lkm.get("mountPrefixes"), 8, valid_path)
        }
        _ => false,
    }
}

fn valid_id(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}

fn valid_path(value: &str) -> bool {
    value.starts_with('/')
        && value != "/"
        && value.len() < 256
        && !value.chars().any(char::is_whitespace)
        && !value.chars().any(char::is_control)
        && !value.contains("//")
        && !value.split('/').any(|part| matches!(part, "." | ".."))
}

fn canonical(value: Option<&Value>, maximum: u64) -> bool {
    matches!(
        value,
        Some(Value::String(value))
            if !value.is_empty()
                && (value == "0" || !value.starts_with('0'))
                && value.bytes().all(|byte| byte.is_ascii_digit())
                && value.parse::<u64>().is_ok_and(|number| number <= maximum)
    )
}

fn canonical_signed(value: Option<&Value>, minimum: i64, maximum: i64) -> bool {
    matches!(
        value,
        Some(Value::String(value))
            if !value.is_empty()
                && value.parse::<i64>().is_ok_and(|number| {
                    number >= minimum
                        && number <= maximum
                        && number.to_string() == *value
                })
    )
}

fn static_field_valid(name: &str, value: &Value) -> Option<bool> {
    Some(match name {
        "inode" | "device" => canonical(Some(value), u64::MAX),
        "links" => canonical(Some(value), u32::MAX.into()),
        "size" | "blocks" | "blockSize" => canonical_signed(Some(value), 0, i64::MAX),
        "atimeSeconds" | "mtimeSeconds" | "ctimeSeconds" => {
            canonical_signed(Some(value), i64::MIN, i64::MAX)
        }
        "atimeNanoseconds" | "mtimeNanoseconds" | "ctimeNanoseconds" => {
            canonical(Some(value), 999_999_999)
        }
        _ => return None,
    })
}

fn valid_static(fields: &BTreeMap<String, Value>) -> bool {
    let mut known = false;
    for (name, value) in fields {
        let Some(valid) = static_field_valid(name, value) else {
            continue;
        };
        if !valid {
            return false;
        }
        known = true;
    }
    known
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_envelope_cases() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../contracts/archive-envelope-cases.json"))
                .unwrap();
        for case in cases.as_array().unwrap() {
            let expected = match case["expected"].as_str().unwrap() {
                "valid" => Envelope::Valid,
                "invalid" => Envelope::Invalid,
                _ => Envelope::Unknown,
            };
            assert_eq!(
                validate_envelope(case["text"].as_str().unwrap()),
                expected,
                "{}",
                case["name"]
            );
        }
    }
}
