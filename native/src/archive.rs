use serde::Deserialize;
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

#[derive(Debug)]
enum Value {
    Object(BTreeMap<String, Value>),
    Array(Vec<Value>),
    String(String),
    Number(String),
    Other,
}

impl<'de> Deserialize<'de> for Value {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ValueVisitor;
        impl<'de> Visitor<'de> for ValueVisitor {
            type Value = Value;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a JSON value")
            }
            fn visit_bool<E: de::Error>(self, _: bool) -> Result<Value, E> {
                Ok(Value::Other)
            }
            fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
                Ok(Value::Other)
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
    if text.len() > 128 * 1024 || exceeds_depth(text) {
        return Envelope::Invalid;
    }
    let Ok(Value::Object(root)) = serde_json::from_str::<Value>(text) else {
        return Envelope::Invalid;
    };
    if !matches!(root.get("format"), Some(Value::String(value)) if value == "susfs-studio")
        || !matches!(root.get("schema"), Some(Value::Number(value)) if value == "1")
    {
        return Envelope::Unknown;
    }
    let Some(Value::Object(rules)) = root.get("rules") else {
        return Envelope::Invalid;
    };
    let mut ids = BTreeSet::new();
    for group in ["paths", "maps", "kstats", "redirects"] {
        let Some(Value::Array(entries)) = rules.get(group) else {
            return Envelope::Invalid;
        };
        for entry in entries {
            let Value::Object(entry) = entry else {
                return Envelope::Invalid;
            };
            let Some(Value::String(id)) = entry.get("id") else {
                return Envelope::Invalid;
            };
            if id.trim().is_empty() || !ids.insert(id) {
                return Envelope::Invalid;
            }
            if let Some(path) = entry.get("path") {
                match path {
                    Value::String(path)
                        if path.starts_with('/') && !path.contains('\0') && path.len() < 256 => {}
                    _ => return Envelope::Invalid,
                }
            }
            if let Some(inode) = entry.get("inode") {
                match inode {
                    Value::String(inode)
                        if !inode.is_empty()
                            && inode.bytes().all(|b| b.is_ascii_digit())
                            && (inode == "0" || !inode.starts_with('0'))
                            && inode.parse::<u64>().is_ok() => {}
                    _ => return Envelope::Invalid,
                }
            }
        }
    }
    Envelope::Valid
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
