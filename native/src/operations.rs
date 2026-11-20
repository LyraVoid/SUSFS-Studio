use crate::device::{
    self, DeviceAction, DeviceOutcome, EffectEvidence, ProviderSnapshot, StaticKstat,
};
use crate::store::Store;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

const PLAN_VERSION: u32 = 2;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub id: String,
    pub idempotency_key: String,
    pub category: String,
    pub intent: String,
    pub stage: String,
    pub eligibility: String,
    pub reason: String,
    pub effect_probe: String,
    pub recovery: String,
    pub identity_digest: String,
    pub execution_uid: u32,
    pub status: String,
    pub attempts: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect: Option<EffectEvidence>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationPlan {
    pub plan_version: u32,
    pub id: String,
    pub baseline_revision: Option<String>,
    pub candidate_revision: String,
    pub provider: ProviderSnapshot,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default = "unverified")]
    pub effect_status: String,
    pub created_at: String,
    pub updated_at: String,
    pub items: Vec<PlanItem>,
    #[serde(default)]
    before: String,
    #[serde(default)]
    after: String,
}

#[derive(Debug)]
pub(crate) struct RuntimeOperation {
    item: PlanItem,
    action: Option<DeviceAction>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationReport {
    pub plan_id: String,
    pub status: String,
    #[serde(default = "unverified")]
    pub effect_status: String,
    pub saved: bool,
    pub applied: Vec<String>,
    pub failed: BTreeMap<String, String>,
    pub pending_reboot: Vec<String>,
    pub deferred: Vec<String>,
    pub blocked: BTreeMap<String, String>,
    pub unknown: Vec<String>,
    pub items: Vec<PlanItem>,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn short_digest(value: &str) -> String {
    digest(value.as_bytes())[..32].to_owned()
}

fn now() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn unverified() -> String {
    "unverified".to_owned()
}

fn object(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

fn array(value: Option<&Value>) -> &[Value] {
    value.and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

fn string(value: Option<&Value>) -> Option<&str> {
    value?.as_str()
}

fn bool_value(value: Option<&Value>) -> Option<bool> {
    value?.as_bool()
}

fn rules(root: &Value) -> BTreeMap<(String, String), Value> {
    let mut output = BTreeMap::new();
    let Some(rules) = root.get("rules").and_then(object) else {
        return output;
    };
    for group in ["paths", "maps", "kstats", "redirects"] {
        for rule in array(rules.get(group)) {
            if let Some(path) = string(rule.get("path")) {
                output.insert((group.to_owned(), path.to_owned()), rule.clone());
            }
        }
    }
    output
}

fn settings<'a>(root: &'a Value, key: &str) -> Option<&'a Value> {
    root.get("settings")?.get(key)
}

fn static_fields(rule: &Value) -> StaticKstat {
    let Some(fields) = rule.get("static").and_then(object) else {
        return StaticKstat::default();
    };
    let unsigned = |name: &str| {
        fields
            .get(name)
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<u64>().ok())
    };
    let signed = |name: &str| {
        fields
            .get(name)
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<i64>().ok())
    };
    let nanoseconds = |name: &str| {
        fields
            .get(name)
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<u32>().ok())
    };
    StaticKstat {
        inode: unsigned("inode"),
        device: unsigned("device"),
        links: unsigned("links").and_then(|value| value.try_into().ok()),
        size: signed("size"),
        atime_seconds: signed("atimeSeconds"),
        atime_nanoseconds: nanoseconds("atimeNanoseconds"),
        mtime_seconds: signed("mtimeSeconds"),
        mtime_nanoseconds: nanoseconds("mtimeNanoseconds"),
        ctime_seconds: signed("ctimeSeconds"),
        ctime_nanoseconds: nanoseconds("ctimeNanoseconds"),
        blocks: signed("blocks"),
        block_size: signed("blockSize"),
    }
}

fn rule_action(group: &str, rule: &Value, remove: bool) -> Option<DeviceAction> {
    let path = string(rule.get("path"))?.to_owned();
    match (group, remove) {
        ("paths", false) => Some(DeviceAction::AddPath {
            path,
            looping: bool_value(rule.get("looping")).unwrap_or(false),
        }),
        ("paths", true) => Some(DeviceAction::RemovePath { path }),
        ("maps", false) => Some(DeviceAction::AddMap { path }),
        ("maps", true) => Some(DeviceAction::RemoveMap { path }),
        ("redirects", false) => Some(DeviceAction::AddRedirect {
            path,
            destination: string(rule.get("destination"))?.to_owned(),
            uid_scheme: rule
                .get("uidScheme")
                .and_then(Value::as_u64)
                .and_then(|value| value.try_into().ok())?,
        }),
        ("redirects", true) => Some(DeviceAction::RemoveRedirect { path }),
        ("kstats", false) => match string(rule.get("mode"))? {
            "normal" => Some(DeviceAction::AddKstat {
                path,
                full_clone: false,
            }),
            "fullClone" => Some(DeviceAction::AddKstat {
                path,
                full_clone: true,
            }),
            "static" => Some(DeviceAction::AddStaticKstat {
                path,
                fields: static_fields(rule),
            }),
            _ => None,
        },
        ("kstats", true) => Some(DeviceAction::RemoveKstat { path }),
        _ => None,
    }
}

fn capability(
    provider: &ProviderSnapshot,
    action: &DeviceAction,
    marker: &str,
) -> Result<(), String> {
    if !provider.audited {
        return Err("PROVIDER_UNAUDITED".to_owned());
    }
    if provider.boot_id.is_empty() {
        return Err("INSTANCE_UNKNOWN".to_owned());
    }
    let proc = |node: &str| {
        provider
            .proc_nodes
            .iter()
            .any(|candidate| candidate == node)
    };
    match action {
        DeviceAction::RemovePath { .. }
            if provider.implementation == "lkm" && !proc("susfs_path") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::RemoveMap { .. }
            if provider.implementation == "lkm" && !proc("susfs_map") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::RemoveRedirect { .. }
            if provider.implementation == "lkm" && !proc("susfs_open_redirect") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::RemoveKstat { .. }
            if provider.implementation == "lkm" && !proc("susfs_kstat") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::UpdateKstat {
            full_clone: true, ..
        } if provider.implementation == "lkm" && !proc("susfs_kstat") => {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::ToggleAvcSpoof(_)
            if provider.implementation == "lkm" && !proc("susfs_avc_spoof") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::AddRedirect { uid_scheme, .. }
            if !provider.redirect_uid_schemes.is_empty()
                && !provider
                    .redirect_uid_schemes
                    .contains(&u32::from(*uid_scheme)) =>
        {
            return Err("UID_SCHEME_UNSUPPORTED".to_owned());
        }
        DeviceAction::AddHiddenModule(_) | DeviceAction::RemoveHiddenModule(_)
            if !proc("susfs_hide_modules") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::AddMountPrefix(_) | DeviceAction::RemoveMountPrefix(_)
            if !proc("susfs_hide_mounts") =>
        {
            return Err("PROC_EXTENSION_REQUIRED".to_owned());
        }
        DeviceAction::SetPriorityUidFilter(_) if provider.implementation != "builtin" => {
            return Err("ABI_NOT_AUDITED".to_owned());
        }
        _ => {}
    }
    if marker.is_empty()
        || provider.features.iter().any(|feature| feature == marker)
        || matches!(
            action,
            DeviceAction::ToggleAvcSpoof(_)
                | DeviceAction::AddHiddenModule(_)
                | DeviceAction::RemoveHiddenModule(_)
                | DeviceAction::AddMountPrefix(_)
                | DeviceAction::RemoveMountPrefix(_)
        )
    {
        Ok(())
    } else {
        Err("CAPABILITY_UNREPORTED".to_owned())
    }
}

#[allow(clippy::too_many_arguments)]
fn push_operation(
    output: &mut Vec<RuntimeOperation>,
    category: &str,
    intent: &str,
    stage: &str,
    marker: &str,
    effect_probe: &str,
    recovery: &str,
    identity: &str,
    action: DeviceAction,
    provider: &ProviderSnapshot,
) {
    let builtin_remove = provider.implementation == "builtin"
        && matches!(
            action,
            DeviceAction::RemovePath { .. }
                | DeviceAction::RemoveMap { .. }
                | DeviceAction::RemoveRedirect { .. }
                | DeviceAction::RemoveKstat { .. }
        );
    let (eligibility, reason) = if builtin_remove {
        ("pending_reboot", "ONLINE_REMOVE_UNAVAILABLE".to_owned())
    } else if matches!(action, DeviceAction::ResetCmdline) {
        (
            "pending_reboot",
            "EXPLICIT_RESET_REQUIRES_REBOOT".to_owned(),
        )
    } else {
        match capability(provider, &action, marker) {
            Ok(()) => ("eligible", "CAPABILITY_VERIFIED".to_owned()),
            Err(reason) => ("blocked", reason),
        }
    };
    output.push(RuntimeOperation {
        item: PlanItem {
            id: short_digest(&format!("{category}:{intent}:{identity}")),
            idempotency_key: short_digest(&format!(
                "{category}:{intent}:{identity}:{}:{}:{}",
                provider.version, provider.variant, provider.boot_id
            )),
            category: category.to_owned(),
            intent: intent.to_owned(),
            stage: stage.to_owned(),
            eligibility: eligibility.to_owned(),
            reason,
            effect_probe: effect_probe.to_owned(),
            recovery: if builtin_remove {
                "reboot-to-restore".to_owned()
            } else {
                recovery.to_owned()
            },
            identity_digest: digest(identity.as_bytes()),
            execution_uid: provider.uid,
            status: match eligibility {
                "eligible" => "saved",
                "pending_reboot" => "pending_reboot",
                _ => "blocked",
            }
            .to_owned(),
            attempts: 0,
            effect: None,
        },
        action: Some(action),
    });
}

fn settings_changes(
    before: &Value,
    after: &Value,
    provider: &ProviderSnapshot,
) -> Vec<RuntimeOperation> {
    let mut output = Vec::new();
    for (key, marker, effect) in [
        (
            "hideMounts",
            "CONFIG_KSU_SUSFS_SUS_MOUNT",
            "NON_SU_MOUNTINFO",
        ),
        ("logging", "CONFIG_KSU_SUSFS_ENABLE_LOG", "KERNEL_LOG"),
        ("avcSpoof", "", "AVC_FEATURE_STATE"),
    ] {
        let next = settings(after, key);
        let previous = settings(before, key);
        if next == previous {
            continue;
        }
        let Some(enabled) = bool_value(next) else {
            continue;
        };
        let action = match key {
            "hideMounts" => DeviceAction::ToggleHideMounts(enabled),
            "logging" => DeviceAction::ToggleLogging(enabled),
            _ => DeviceAction::ToggleAvcSpoof(enabled),
        };
        push_operation(
            &mut output,
            key,
            "update",
            "live",
            marker,
            effect,
            "inverse-toggle",
            key,
            action,
            provider,
        );
    }

    if settings(after, "priorityUidFilter") != settings(before, "priorityUidFilter")
        && let Some(values) = settings(after, "priorityUidFilter").and_then(Value::as_array)
    {
        let packages = values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect();
        push_operation(
            &mut output,
            "priorityUidFilter",
            "update",
            "live",
            "CONFIG_KSU_SUSFS_PRIORITY_UID_FILTER",
            "PRIORITY_UID",
            "provider-reapply",
            "priorityUidFilter",
            DeviceAction::SetPriorityUidFilter(packages),
            provider,
        );
    }

    if after.get("uname") != before.get("uname") {
        match after.get("uname") {
            Some(Value::Object(values)) => {
                let release = string(values.get("release")).unwrap_or_default();
                let version = string(values.get("version")).unwrap_or_default();
                let action = if release == "default" && version == "default" {
                    DeviceAction::ResetUname
                } else {
                    DeviceAction::SetUname {
                        release: release.to_owned(),
                        version: version.to_owned(),
                    }
                };
                push_operation(
                    &mut output,
                    "uname",
                    "update",
                    "live",
                    "CONFIG_KSU_SUSFS_SPOOF_UNAME",
                    "UNAME_SYSCALL",
                    "reset-real-uname",
                    "uname",
                    action,
                    provider,
                );
            }
            Some(Value::Null) | None => {}
            _ => {}
        }
    }

    if after.get("cmdline") != before.get("cmdline") {
        match after.get("cmdline") {
            Some(Value::String(value)) => {
                let action = if value.is_empty() {
                    DeviceAction::ResetCmdline
                } else {
                    DeviceAction::SetCmdline(value.clone())
                };
                push_operation(
                    &mut output,
                    "cmdline",
                    "update",
                    "live",
                    "CONFIG_KSU_SUSFS_SPOOF_CMDLINE_OR_BOOTCONFIG",
                    "PROC_CMDLINE",
                    "explicit-reset",
                    "cmdline",
                    action,
                    provider,
                );
            }
            Some(Value::Null) | None => {}
            _ => {}
        }
    }
    output
}

fn list(values: Option<&Value>) -> BTreeSet<String> {
    values
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn extension_changes(
    before: &Value,
    after: &Value,
    provider: &ProviderSnapshot,
) -> Vec<RuntimeOperation> {
    let mut output = Vec::new();
    let before_lkm = before.get("lkm");
    let after_lkm = after.get("lkm");
    for (key, marker, add, remove, probe) in [
        (
            "hiddenModules",
            "SUSFS_LKM_MODULES",
            DeviceAction::AddHiddenModule as fn(String) -> DeviceAction,
            DeviceAction::RemoveHiddenModule as fn(String) -> DeviceAction,
            "PROC_MODULES",
        ),
        (
            "mountPrefixes",
            "CONFIG_KSU_SUSFS_SUS_MOUNT",
            DeviceAction::AddMountPrefix as fn(String) -> DeviceAction,
            DeviceAction::RemoveMountPrefix as fn(String) -> DeviceAction,
            "PROC_MOUNTINFO",
        ),
    ] {
        let previous = list(before_lkm.and_then(|value| value.get(key)));
        let next = list(after_lkm.and_then(|value| value.get(key)));
        for value in next.difference(&previous) {
            push_operation(
                &mut output,
                key,
                "add",
                "live",
                marker,
                probe,
                "proc-remove",
                &format!("{key}:{value}"),
                add(value.clone()),
                provider,
            );
        }
        for value in previous.difference(&next) {
            push_operation(
                &mut output,
                key,
                "remove",
                "live",
                marker,
                probe,
                "proc-add",
                &format!("{key}:{value}"),
                remove(value.clone()),
                provider,
            );
        }
    }
    output
}

fn rule_changes(
    before: &Value,
    after: &Value,
    provider: &ProviderSnapshot,
) -> Vec<RuntimeOperation> {
    let mut output = Vec::new();
    let previous = rules(before);
    let next = rules(after);
    for (key, rule) in &next {
        let (group, path) = key;
        let marker = match group.as_str() {
            "paths" => "CONFIG_KSU_SUSFS_SUS_PATH",
            "maps" => "CONFIG_KSU_SUSFS_SUS_MAP",
            "kstats" => "CONFIG_KSU_SUSFS_SUS_KSTAT",
            "redirects" => "CONFIG_KSU_SUSFS_OPEN_REDIRECT",
            _ => continue,
        };
        let old = previous.get(key);
        if old == Some(rule) {
            continue;
        }
        let Some(action) = rule_action(group, rule, false) else {
            continue;
        };
        let changed_same_path = old.is_some();
        let static_update = changed_same_path
            && matches!(action, DeviceAction::AddStaticKstat { .. })
            && old.is_some_and(|rule| string(rule.get("mode")) == Some("static"));
        let (stage, eligibility_override, reason, recovery) = if static_update {
            ("live", "eligible", "STATIC_KSTAT_UPDATE", "boot-reload")
        } else if changed_same_path {
            (
                "pending-reboot",
                "pending_reboot",
                "RULE_REPLACEMENT_REQUIRES_REBOOT",
                "reboot-then-verify",
            )
        } else {
            match action {
                DeviceAction::AddKstat { .. } => (
                    "pre-mount/post-mount",
                    "pending_reboot",
                    "LIVE_KSTAT_STAGE_MISSED",
                    "boot-stage-retry",
                ),
                DeviceAction::AddStaticKstat { .. } => {
                    ("live", "eligible", "CAPABILITY_VERIFIED", "proc-remove")
                }
                _ => ("live", "eligible", "CAPABILITY_VERIFIED", "proc-remove"),
            }
        };
        let mut item = RuntimeOperation {
            item: PlanItem {
                id: short_digest(&format!("{group}:add:{path}")),
                idempotency_key: short_digest(&format!(
                    "{group}:add:{path}:{}:{}:{}",
                    provider.version, provider.variant, provider.boot_id
                )),
                category: group.clone(),
                intent: if changed_same_path { "update" } else { "add" }.to_owned(),
                stage: stage.to_owned(),
                eligibility: eligibility_override.to_owned(),
                reason: reason.to_owned(),
                effect_probe: match group.as_str() {
                    "paths" => "APP_PATH_VISIBILITY",
                    "maps" => "PROCESS_MAPS",
                    "kstats" => "APP_STAT",
                    _ => "UID_OPEN",
                }
                .to_owned(),
                recovery: if provider.implementation == "builtin" {
                    "reboot-to-restore".to_owned()
                } else {
                    recovery.to_owned()
                },
                identity_digest: digest(path.as_bytes()),
                execution_uid: provider.uid,
                status: if eligibility_override == "eligible" {
                    "saved".to_owned()
                } else {
                    eligibility_override.to_owned()
                },
                attempts: 0,
                effect: None,
            },
            action: Some(action),
        };
        if item.item.eligibility != "blocked"
            && let Err(reason) = capability(provider, item.action.as_ref().unwrap(), marker)
        {
            item.item.eligibility = "blocked".to_owned();
            item.item.reason = reason;
            item.item.status = "blocked".to_owned();
        }
        output.push(item);
    }
    for (key, rule) in previous {
        if next.contains_key(&key) {
            continue;
        }
        let (group, path) = key;
        let marker = match group.as_str() {
            "paths" => "CONFIG_KSU_SUSFS_SUS_PATH",
            "maps" => "CONFIG_KSU_SUSFS_SUS_MAP",
            "kstats" => "CONFIG_KSU_SUSFS_SUS_KSTAT",
            "redirects" => "CONFIG_KSU_SUSFS_OPEN_REDIRECT",
            _ => continue,
        };
        let Some(action) = rule_action(&group, &rule, true) else {
            continue;
        };
        push_operation(
            &mut output,
            &group,
            "remove",
            "live",
            marker,
            "RESTORED_VISIBILITY",
            "pending-reboot-if-remove-fails",
            &path,
            action,
            provider,
        );
    }
    output
}

pub(crate) fn runtime_operations(
    before: &str,
    after: &str,
    provider: &ProviderSnapshot,
) -> Vec<RuntimeOperation> {
    let before: Value = serde_json::from_str(before).unwrap_or(Value::Null);
    let after: Value = serde_json::from_str(after).unwrap_or(Value::Null);
    let mut output = Vec::new();
    output.extend(settings_changes(&before, &after, provider));
    output.extend(rule_changes(&before, &after, provider));
    output.extend(extension_changes(&before, &after, provider));
    output
}

pub fn create(
    store: &Store,
    before: Option<&[u8]>,
    after: &[u8],
    provider: &ProviderSnapshot,
) -> io::Result<OperationPlan> {
    let _lock = store.lock()?;
    let before_text = before
        .map(std::str::from_utf8)
        .transpose()
        .map_err(|_| io::ErrorKind::InvalidData)?
        .unwrap_or("null");
    let after_text = std::str::from_utf8(after).map_err(|_| io::ErrorKind::InvalidData)?;
    let runtime = runtime_operations(before_text, after_text, provider);
    let mut items: Vec<_> = runtime
        .into_iter()
        .map(|operation| operation.item)
        .collect();
    items.sort_by(|left, right| left.id.cmp(&right.id));
    let baseline_revision = before.map(digest);
    let candidate_revision = digest(after);
    let plan_id = short_digest(&format!(
        "{PLAN_VERSION}:{}:{}:{}:{}:{}:{}:{}",
        baseline_revision.as_deref().unwrap_or("empty"),
        candidate_revision,
        provider.version,
        provider.variant,
        provider.boot_id,
        digest(provider.features.join("\n").as_bytes()),
        digest(
            format!(
                "{}\n{}",
                provider.proc_nodes.join("\n"),
                provider
                    .redirect_uid_schemes
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(",")
            )
            .as_bytes(),
        ),
    ));
    if store.read_operation(&plan_id)?.is_some() {
        return load(store, &plan_id);
    }
    let status = if items.iter().any(|item| item.eligibility == "eligible") {
        "ready"
    } else if items
        .iter()
        .any(|item| item.eligibility == "pending_reboot")
    {
        "pending_reboot"
    } else {
        "blocked"
    };
    let created_at = now();
    let plan = OperationPlan {
        plan_version: PLAN_VERSION,
        id: plan_id.clone(),
        baseline_revision,
        candidate_revision,
        provider: provider.clone(),
        status: status.to_owned(),
        reason: None,
        effect_status: unverified(),
        created_at: created_at.clone(),
        updated_at: created_at,
        items,
        before: before_text.to_owned(),
        after: after_text.to_owned(),
    };
    persist(store, &plan)?;
    Ok(plan)
}

pub fn create_blocked(
    store: &Store,
    before: Option<&[u8]>,
    after: &[u8],
    reason: &str,
    provider: &ProviderSnapshot,
) -> io::Result<OperationPlan> {
    let mut plan = create(store, before, after, provider)?;
    if plan.reason.as_deref() != Some(reason) {
        plan.reason = Some(reason.to_owned());
        plan.status = "blocked".to_owned();
        plan.updated_at = now();
        persist(store, &plan)?;
    }
    Ok(plan)
}

fn persist(store: &Store, plan: &OperationPlan) -> io::Result<()> {
    let bytes = serde_json::to_vec(plan).map_err(io::Error::other)?;
    store.write_operation(&plan.id, &bytes)
}

pub fn load(store: &Store, id: &str) -> io::Result<OperationPlan> {
    let bytes = store
        .read_operation(id)?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "operation plan is missing"))?;
    let plan: OperationPlan = serde_json::from_slice(&bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "operation plan is invalid"))?;
    if plan.plan_version != PLAN_VERSION
        || plan.id != id
        || plan.candidate_revision.len() != 64
        || plan.items.iter().any(|item| item.id.len() != 32)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "operation plan is invalid",
        ));
    }
    Ok(plan)
}

pub fn public_json(plan: &OperationPlan) -> serde_json::Value {
    let mut value = serde_json::to_value(plan).unwrap_or(Value::Null);
    if let Some(object) = value.as_object_mut() {
        object.remove("before");
        object.remove("after");
    }
    value
}

fn current_provider(
    planned: &ProviderSnapshot,
    current: &ProviderSnapshot,
) -> Result<(), io::Error> {
    if planned.implementation != current.implementation
        || planned.version != current.version
        || planned.variant != current.variant
        || planned.audited != current.audited
        || planned.features != current.features
        || planned.proc_nodes != current.proc_nodes
        || planned.redirect_uid_schemes != current.redirect_uid_schemes
        || planned.boot_id != current.boot_id
        || planned.uid != current.uid
    {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "provider instance changed",
        ));
    }
    Ok(())
}

fn apply_outcome(item: &mut PlanItem, outcome: DeviceOutcome) {
    item.attempts = item.attempts.saturating_add(1);
    match outcome.status {
        "applied" => item.status = "applied".to_owned(),
        "pending_reboot" => item.status = "pending_reboot".to_owned(),
        "deferred" => item.status = "deferred".to_owned(),
        "unknown" => item.status = "unknown".to_owned(),
        _ => item.status = "failed".to_owned(),
    }
    item.reason = outcome.code;
}

pub fn apply(
    store: &Store,
    id: &str,
    current_provider_snapshot: &ProviderSnapshot,
) -> io::Result<OperationReport> {
    apply_inner(
        store,
        id,
        current_provider_snapshot,
        persist,
        device::execute,
    )
}

fn apply_inner(
    store: &Store,
    id: &str,
    current_provider_snapshot: &ProviderSnapshot,
    persist_plan: impl Fn(&Store, &OperationPlan) -> io::Result<()>,
    execute: impl Fn(&DeviceAction, &ProviderSnapshot) -> DeviceOutcome,
) -> io::Result<OperationReport> {
    let _lock = store.lock()?;
    let current = store
        .read_archive_unlocked()?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "archive is missing"))?;
    let mut plan = load(store, id)?;
    if digest(&current) != plan.candidate_revision {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "archive revision changed",
        ));
    }
    current_provider(&plan.provider, current_provider_snapshot)?;
    if plan.status != "ready" {
        return Err(io::Error::new(
            if matches!(
                plan.status.as_str(),
                "applying" | "unknown" | "recovery_required"
            ) {
                io::ErrorKind::WouldBlock
            } else {
                io::ErrorKind::AlreadyExists
            },
            "operation plan is not awaiting application",
        ));
    }
    let runtime: BTreeMap<_, _> =
        runtime_operations(&plan.before, &plan.after, current_provider_snapshot)
            .into_iter()
            .map(|operation| (operation.item.id.clone(), operation))
            .collect();
    plan.status = "applying".to_owned();
    plan.updated_at = now();
    persist_plan(store, &plan)?;

    for index in 0..plan.items.len() {
        let item = &mut plan.items[index];
        if item.status == "applied" {
            continue;
        }
        if item.eligibility == "blocked" {
            item.status = "blocked".to_owned();
            continue;
        }
        if item.eligibility == "pending_reboot" {
            item.status = "pending_reboot".to_owned();
            continue;
        }
        let Some(operation) = runtime.get(&item.id) else {
            item.status = "failed".to_owned();
            item.reason = "PLAN_ITEM_MISMATCH".to_owned();
            continue;
        };
        let Some(action) = &operation.action else {
            item.status = "failed".to_owned();
            item.reason = "PLAN_ACTION_MISSING".to_owned();
            continue;
        };
        item.status = "applying".to_owned();
        plan.updated_at = now();
        persist_plan(store, &plan)?;
        let outcome = execute(action, current_provider_snapshot);
        apply_outcome(&mut plan.items[index], outcome);
        plan.updated_at = now();
        persist_plan(store, &plan)?;
    }

    plan.status = summarize(&plan.items);
    plan.updated_at = now();
    persist_plan(store, &plan)?;
    Ok(report("saved", plan))
}

pub fn retry(
    store: &Store,
    id: &str,
    current_provider_snapshot: &ProviderSnapshot,
) -> io::Result<OperationReport> {
    prepare_retry(store, id, current_provider_snapshot)?;
    apply(store, id, current_provider_snapshot)
}

fn prepare_retry(
    store: &Store,
    id: &str,
    current_provider_snapshot: &ProviderSnapshot,
) -> io::Result<()> {
    let _lock = store.lock()?;
    let current = store
        .read_archive_unlocked()?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "archive is missing"))?;
    let mut plan = load(store, id)?;
    if digest(&current) != plan.candidate_revision {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "archive revision changed",
        ));
    }
    current_provider(&plan.provider, current_provider_snapshot)?;
    if !matches!(plan.status.as_str(), "failed" | "partial") {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "operation plan has no known failure to retry",
        ));
    }
    let failed = plan.items.iter_mut().filter(|item| item.status == "failed");
    let mut count = 0;
    for item in failed {
        item.status = "saved".to_owned();
        item.effect = None;
        count += 1;
    }
    if count == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "operation plan has no failed items",
        ));
    }
    plan.status = "ready".to_owned();
    plan.updated_at = now();
    persist(store, &plan)
}

fn summarize(items: &[PlanItem]) -> String {
    let has = |status: &str| items.iter().any(|item| item.status == status);
    let applied = items.iter().any(|item| item.status == "applied");
    if has("unknown") || has("recovery_required") {
        "unknown".to_owned()
    } else if has("failed") {
        if applied {
            "partial".to_owned()
        } else {
            "failed".to_owned()
        }
    } else if applied
        && (has("blocked") || has("pending_reboot") || has("deferred") || has("failed"))
    {
        "partial".to_owned()
    } else if has("pending_reboot") {
        "pending_reboot".to_owned()
    } else if has("deferred") {
        "deferred".to_owned()
    } else if has("applied") {
        "applied".to_owned()
    } else if has("blocked") {
        "blocked".to_owned()
    } else {
        "idle".to_owned()
    }
}

fn report(status: &str, plan: OperationPlan) -> OperationReport {
    let plan_id = plan.id.clone();
    let plan_status = plan.status.clone();
    let effect_status = plan.effect_status.clone();
    let items = plan.items;
    OperationReport {
        plan_id,
        status: if status == "recovered" {
            "recovered".to_owned()
        } else {
            plan_status
        },
        effect_status,
        saved: status == "saved",
        applied: items
            .iter()
            .filter(|item| item.status == "applied")
            .map(|item| item.id.clone())
            .collect(),
        failed: items
            .iter()
            .filter(|item| item.status == "failed")
            .map(|item| (item.id.clone(), item.reason.clone()))
            .collect(),
        pending_reboot: items
            .iter()
            .filter(|item| item.status == "pending_reboot")
            .map(|item| item.id.clone())
            .collect(),
        deferred: items
            .iter()
            .filter(|item| item.status == "deferred")
            .map(|item| item.id.clone())
            .collect(),
        blocked: items
            .iter()
            .filter(|item| item.status == "blocked")
            .map(|item| (item.id.clone(), item.reason.clone()))
            .collect(),
        unknown: items
            .iter()
            .filter(|item| item.status == "unknown")
            .map(|item| item.id.clone())
            .collect(),
        items,
    }
}

pub fn blocked_report(store: &Store, id: &str, reason: &str) -> io::Result<OperationReport> {
    let plan = load(store, id)?;
    Ok(OperationReport {
        plan_id: plan.id,
        status: "blocked".to_owned(),
        effect_status: plan.effect_status,
        saved: false,
        applied: Vec::new(),
        failed: BTreeMap::new(),
        pending_reboot: Vec::new(),
        deferred: Vec::new(),
        blocked: plan
            .items
            .iter()
            .map(|item| (item.id.clone(), reason.to_owned()))
            .collect(),
        unknown: Vec::new(),
        items: plan.items,
    })
}

pub fn verify(
    store: &Store,
    id: &str,
    current_provider_snapshot: &ProviderSnapshot,
) -> io::Result<OperationReport> {
    let _lock = store.lock()?;
    let mut plan = load(store, id)?;
    current_provider(&plan.provider, current_provider_snapshot)?;
    let runtime: BTreeMap<_, _> =
        runtime_operations(&plan.before, &plan.after, current_provider_snapshot)
            .into_iter()
            .map(|operation| (operation.item.id.clone(), operation))
            .collect();
    for item in &mut plan.items {
        if item.status != "applied" {
            continue;
        }
        if let Some(action) = runtime
            .get(&item.id)
            .and_then(|operation| operation.action.as_ref())
        {
            item.effect = Some(device::verify(action, current_provider_snapshot));
        }
    }
    plan.updated_at = now();
    let applied: Vec<_> = plan
        .items
        .iter()
        .filter(|item| item.status == "applied")
        .collect();
    let observed = applied
        .iter()
        .filter(|item| item.effect.as_ref().is_some_and(|effect| effect.observed))
        .count();
    plan.effect_status = if !applied.is_empty() && observed == applied.len() {
        "verified"
    } else if observed > 0 {
        "partial"
    } else {
        "unverified"
    }
    .to_owned();
    plan.status = summarize(&plan.items);
    persist(store, &plan)?;
    Ok(report("saved", plan))
}

pub fn recover(
    store: &Store,
    id: &str,
    current_provider_snapshot: &ProviderSnapshot,
) -> io::Result<OperationReport> {
    let _lock = store.lock()?;
    let mut plan = load(store, id)?;
    current_provider(&plan.provider, current_provider_snapshot)?;
    let runtime: BTreeMap<_, _> =
        runtime_operations(&plan.before, &plan.after, current_provider_snapshot)
            .into_iter()
            .map(|operation| (operation.item.id.clone(), operation))
            .collect();
    for item in &mut plan.items {
        if !matches!(
            item.status.as_str(),
            "applying" | "unknown" | "recovery_required"
        ) {
            continue;
        }
        let effect = runtime
            .get(&item.id)
            .and_then(|operation| operation.action.as_ref())
            .map(|action| device::verify(action, current_provider_snapshot));
        if effect.as_ref().is_some_and(|effect| effect.observed) {
            item.status = "applied".to_owned();
        } else {
            item.status = "recovery_required".to_owned();
        }
        item.effect = effect;
    }
    plan.status = summarize(&plan.items);
    if plan.status == "unknown" && !plan.items.iter().any(|item| item.status == "unknown") {
        plan.status = "recovery_required".to_owned();
    }
    plan.updated_at = now();
    persist(store, &plan)?;
    Ok(report("recovered", plan))
}

pub(crate) fn automatic_enabled(root: &Value) -> bool {
    bool_value(root.get("automatic")).unwrap_or(false)
}

pub fn boot(
    store: &Store,
    phase: &str,
    provider: &ProviderSnapshot,
) -> io::Result<OperationReport> {
    let stage = match phase {
        "pre-mount" => "pre-mount",
        "late-pre-mount" => "late-pre-mount",
        "post-mount" => "post-mount",
        "late-load" | "service" | "boot-completed" => "live",
        _ => return Err(io::ErrorKind::InvalidInput.into()),
    };
    let _lock = store.lock()?;
    let archive = store
        .read_archive_unlocked()?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "archive is missing"))?;
    let text = std::str::from_utf8(&archive)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "archive is invalid"))?;
    let root: Value = serde_json::from_str(text)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "archive is invalid"))?;
    if !automatic_enabled(&root) {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "automatic application is disabled",
        ));
    }
    let mut runtime = runtime_operations("null", text, provider);
    let pre_id = boot_plan_id("pre-mount", &archive, provider);
    let pre = if matches!(stage, "post-mount" | "late-pre-mount") {
        load(store, &pre_id).ok()
    } else {
        None
    };
    runtime.retain_mut(|operation| select_boot_action(operation, stage, pre.as_ref()));
    for operation in &mut runtime {
        if operation.item.eligibility == "eligible" {
            operation.item.reason = "BOOT_STAGE".to_owned();
            operation.item.status = "saved".to_owned();
        }
    }
    let id = boot_plan_id(phase, &archive, provider);
    if let Ok(existing) = load(store, &id) {
        return Ok(report("saved", existing));
    }
    let created = now();
    let mut plan = OperationPlan {
        plan_version: PLAN_VERSION,
        id,
        baseline_revision: None,
        candidate_revision: digest(&archive),
        provider: provider.clone(),
        status: "saved".to_owned(),
        reason: None,
        effect_status: unverified(),
        created_at: created.clone(),
        updated_at: created,
        items: runtime
            .iter()
            .map(|operation| operation.item.clone())
            .collect(),
        before: "null".to_owned(),
        after: text.to_owned(),
    };
    persist(store, &plan)?;
    let actions: BTreeMap<_, _> = runtime
        .into_iter()
        .map(|operation| (operation.item.id.clone(), operation.action))
        .collect();
    for index in 0..plan.items.len() {
        let id = plan.items[index].id.clone();
        let Some(Some(action)) = actions.get(&id) else {
            continue;
        };
        plan.items[index].status = "applying".to_owned();
        plan.updated_at = now();
        persist(store, &plan)?;
        let outcome = device::execute(action, provider);
        apply_outcome(&mut plan.items[index], outcome);
        if matches!(stage, "pre-mount" | "late-pre-mount") && plan.items[index].status == "applied"
        {
            plan.items[index].status = "deferred".to_owned();
            plan.items[index].reason = "KSTAT_SNAPSHOT_CAPTURED".to_owned();
        }
        plan.updated_at = now();
        persist(store, &plan)?;
    }
    plan.status = summarize(&plan.items);
    persist(store, &plan)?;
    Ok(report("saved", plan))
}

fn select_boot_action(
    operation: &mut RuntimeOperation,
    stage: &str,
    pre: Option<&OperationPlan>,
) -> bool {
    if stage == "late-pre-mount" {
        if !matches!(operation.action, Some(DeviceAction::AddKstat { .. })) {
            return false;
        }
        let captured = pre.is_some_and(|plan| {
            plan.items.iter().any(|item| {
                item.id == operation.item.id
                    && matches!(item.status.as_str(), "applied" | "deferred")
            })
        });
        if captured {
            operation.action = None;
            operation.item.status = "deferred".to_owned();
            operation.item.reason = "KSTAT_SNAPSHOT_ALREADY_CAPTURED".to_owned();
        } else if operation.item.eligibility == "pending_reboot" {
            operation.item.eligibility = "eligible".to_owned();
            operation.item.reason = "BOOT_STAGE".to_owned();
            operation.item.status = "saved".to_owned();
        }
        return true;
    }
    let action = operation.action.as_mut();
    match stage {
        "pre-mount" => {
            if matches!(action, Some(DeviceAction::AddKstat { .. }))
                && operation.item.eligibility == "pending_reboot"
            {
                operation.item.eligibility = "eligible".to_owned();
                operation.item.reason = "BOOT_STAGE".to_owned();
                operation.item.status = "saved".to_owned();
            }
            matches!(action, Some(DeviceAction::AddKstat { .. }))
        }
        "post-mount" => {
            let Some(DeviceAction::AddKstat { path, full_clone }) = action else {
                return false;
            };
            let captured = pre.is_some_and(|plan| {
                plan.items.iter().any(|item| {
                    item.id == operation.item.id
                        && matches!(item.status.as_str(), "applied" | "deferred")
                })
            });
            if !captured {
                operation.action = None;
                operation.item.eligibility = "pending_reboot".to_owned();
                operation.item.reason = "PRE_MOUNT_KSTAT_MISSED".to_owned();
                operation.item.status = "pending_reboot".to_owned();
                return true;
            }
            operation.action = Some(DeviceAction::UpdateKstat {
                path: path.clone(),
                full_clone: *full_clone,
            });
            operation.item.stage = "post-mount".to_owned();
            operation.item.effect_probe = "STAT_SYSCALL".to_owned();
            operation.item.eligibility = "eligible".to_owned();
            operation.item.reason = "BOOT_STAGE".to_owned();
            operation.item.status = "saved".to_owned();
            true
        }
        _ => {
            if matches!(action, Some(DeviceAction::AddKstat { .. })) {
                operation.action = None;
                operation.item.eligibility = "pending_reboot".to_owned();
                operation.item.reason = "LIVE_KSTAT_STAGE_MISSED".to_owned();
                operation.item.status = "pending_reboot".to_owned();
            }
            true
        }
    }
}

fn boot_plan_id(phase: &str, archive: &[u8], provider: &ProviderSnapshot) -> String {
    short_digest(&format!(
        "boot:{phase}:{}:{}:{}",
        digest(archive),
        provider.boot_id,
        provider.version
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn provider(proc_nodes: &[&str]) -> ProviderSnapshot {
        ProviderSnapshot {
            implementation: "lkm".to_owned(),
            version: "v2.3.0".to_owned(),
            variant: "GKI-LKM".to_owned(),
            audited: true,
            features: vec![
                "CONFIG_KSU_SUSFS_SUS_PATH".to_owned(),
                "CONFIG_KSU_SUSFS_SUS_MAP".to_owned(),
                "CONFIG_KSU_SUSFS_SUS_KSTAT".to_owned(),
                "CONFIG_KSU_SUSFS_OPEN_REDIRECT".to_owned(),
                "CONFIG_KSU_SUSFS_SUS_MOUNT".to_owned(),
                "CONFIG_KSU_SUSFS_ENABLE_LOG".to_owned(),
                "CONFIG_KSU_SUSFS_SPOOF_UNAME".to_owned(),
                "CONFIG_KSU_SUSFS_SPOOF_CMDLINE_OR_BOOTCONFIG".to_owned(),
            ],
            boot_id: "boot".to_owned(),
            uid: 0,
            proc_nodes: proc_nodes.iter().map(|node| (*node).to_owned()).collect(),
            redirect_uid_schemes: vec![0, 1, 2, 3, 4],
        }
    }

    fn builtin() -> ProviderSnapshot {
        let mut provider = provider(&[]);
        provider.implementation = "builtin".to_owned();
        provider.variant = "GKI".to_owned();
        provider.version = "v2.4.0".to_owned();
        provider
            .features
            .push("CONFIG_KSU_SUSFS_PRIORITY_UID_FILTER".to_owned());
        provider.redirect_uid_schemes = vec![0, 1, 2];
        provider
    }

    #[test]
    fn dynamic_kstat_is_never_claimed_live() {
        let before = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[{"id":"k","path":"/data/k","mode":"normal"}],"redirects":[]}}"#;
        let operations = runtime_operations(before, after, &provider(&["susfs_kstat"]));
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].item.stage, "pre-mount/post-mount");
        assert_eq!(operations[0].item.eligibility, "pending_reboot");
    }

    #[test]
    fn missed_pre_mount_snapshot_cannot_execute_post_mount() {
        let after = r#"{"format":"susfs-studio","schema":2,"automatic":true,"rules":{"paths":[],"maps":[],"kstats":[{"id":"k","path":"/data/k","mode":"normal"}],"redirects":[]}}"#;
        let mut operations = runtime_operations("null", after, &provider(&["susfs_kstat"]));
        operations.retain_mut(|operation| select_boot_action(operation, "post-mount", None));
        assert_eq!(operations.len(), 1);
        assert!(operations[0].action.is_none());
        assert_eq!(operations[0].item.status, "pending_reboot");
        assert_eq!(operations[0].item.reason, "PRE_MOUNT_KSTAT_MISSED");
    }

    #[test]
    fn live_kstat_cannot_reuse_a_post_mount_plan() {
        let after = r#"{"format":"susfs-studio","schema":2,"automatic":true,"rules":{"paths":[],"maps":[],"kstats":[{"id":"k","path":"/data/k","mode":"normal"}],"redirects":[]}}"#;
        let mut operations = runtime_operations("null", after, &provider(&["susfs_kstat"]));
        operations.retain_mut(|operation| select_boot_action(operation, "live", None));
        assert_eq!(operations.len(), 1);
        assert!(operations[0].action.is_none());
        assert_eq!(operations[0].item.status, "pending_reboot");
        assert_eq!(operations[0].item.reason, "LIVE_KSTAT_STAGE_MISSED");
    }

    #[test]
    fn priority_filter_is_blocked_for_lkm() {
        let before = r#"{"format":"susfs-studio","schema":2,"settings":{},"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"settings":{"priorityUidFilter":[]},"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let mut lkm = provider(&[]);
        lkm.features
            .push("CONFIG_KSU_SUSFS_PRIORITY_UID_FILTER".to_owned());
        let operations = runtime_operations(before, after, &lkm);
        assert_eq!(operations[0].item.reason, "ABI_NOT_AUDITED");
    }

    #[test]
    fn lkm_cmdline_clear_waits_for_reboot_instead_of_inventing_reset() {
        let before = r#"{"format":"susfs-studio","schema":2,"cmdline":"androidboot.demo=1","rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"cmdline":"","rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let operations = runtime_operations(before, after, &provider(&[]));
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].item.eligibility, "pending_reboot");
        assert_eq!(operations[0].item.reason, "EXPLICIT_RESET_REQUIRES_REBOOT");
    }

    #[test]
    fn builtin_cmdline_clear_also_waits_for_reboot() {
        let before = r#"{"format":"susfs-studio","schema":2,"cmdline":"androidboot.demo=1","rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"cmdline":"","rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let operations = runtime_operations(before, after, &builtin());
        assert_eq!(operations[0].item.eligibility, "pending_reboot");
        assert_eq!(operations[0].item.reason, "EXPLICIT_RESET_REQUIRES_REBOOT");
    }

    #[test]
    fn removals_need_the_matching_proc_extension() {
        let before = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[{"id":"p","path":"/data/p","looping":false}],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let operations = runtime_operations(before, after, &provider(&[]));
        assert_eq!(operations[0].item.intent, "remove");
        assert_eq!(operations[0].item.reason, "PROC_EXTENSION_REQUIRED");
    }

    #[test]
    fn builtin_removals_wait_for_reboot_without_inventing_a_delete_abi() {
        let before = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[{"id":"p","path":"/data/p","looping":false}],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let operations = runtime_operations(before, after, &builtin());
        assert_eq!(operations[0].item.intent, "remove");
        assert_eq!(operations[0].item.eligibility, "pending_reboot");
        assert_eq!(operations[0].item.reason, "ONLINE_REMOVE_UNAVAILABLE");
    }

    #[test]
    fn builtin_avc_and_full_clone_use_their_supercalls() {
        let provider = builtin();
        assert!(capability(&provider, &DeviceAction::ToggleAvcSpoof(true), "").is_ok());
        assert!(
            capability(
                &provider,
                &DeviceAction::UpdateKstat {
                    path: "/data/k".to_owned(),
                    full_clone: true,
                },
                "CONFIG_KSU_SUSFS_SUS_KSTAT",
            )
            .is_ok()
        );
    }

    #[test]
    fn redirect_is_limited_to_reported_uid_schemes() {
        let provider = builtin();
        assert_eq!(
            capability(
                &provider,
                &DeviceAction::AddRedirect {
                    path: "/system/a".to_owned(),
                    destination: "/system/b".to_owned(),
                    uid_scheme: 3,
                },
                "CONFIG_KSU_SUSFS_OPEN_REDIRECT",
            ),
            Err("UID_SCHEME_UNSUPPORTED".to_owned())
        );
    }

    #[test]
    fn static_kstat_can_update_in_place_but_mode_changes_wait_for_reboot() {
        let before = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[{"id":"k","path":"/data/k","mode":"static","static":{"inode":"1"}}],"redirects":[]}}"#;
        let after = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[{"id":"k","path":"/data/k","mode":"static","static":{"inode":"2"}}],"redirects":[]}}"#;
        let operations = runtime_operations(before, after, &builtin());
        assert_eq!(operations[0].item.eligibility, "eligible");
        assert_eq!(operations[0].item.reason, "STATIC_KSTAT_UPDATE");

        let dynamic = r#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[{"id":"k","path":"/data/k","mode":"normal"}],"redirects":[]}}"#;
        let operations = runtime_operations(before, dynamic, &builtin());
        assert_eq!(operations[0].item.eligibility, "pending_reboot");
    }

    #[test]
    fn plan_output_redacts_archive_payloads() {
        let before = br#"{"format":"susfs-studio","schema":2,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}"#;
        let after = br#"{"format":"susfs-studio","schema":2,"rules":{"paths":[{"id":"p","path":"/private/secret","looping":false}],"maps":[],"kstats":[],"redirects":[]}}"#;
        let methods = provider(&["susfs_path"]);
        let before_text = std::str::from_utf8(before).unwrap();
        let after_text = std::str::from_utf8(after).unwrap();
        let operation = runtime_operations(before_text, after_text, &methods)
            .into_iter()
            .next()
            .unwrap();
        let json = serde_json::to_string(&operation.item).unwrap();
        assert!(!json.contains("/private/secret"));
    }

    #[test]
    fn shared_plan_and_report_fixture_match_the_rust_model() {
        let fixture: Value =
            serde_json::from_slice(include_bytes!("../../contracts/operation-v2.json")).unwrap();
        let plan: OperationPlan = serde_json::from_value(fixture["plan"].clone()).unwrap();
        assert_eq!(plan.plan_version, PLAN_VERSION);
        assert_eq!(plan.status, "ready");
        assert_eq!(plan.items[0].eligibility, "eligible");
        let report: OperationReport = serde_json::from_value(fixture["report"].clone()).unwrap();
        assert_eq!(report.plan_id, plan.id);
        assert_eq!(report.applied, [plan.items[0].id.clone()]);
        let public = public_json(&plan);
        assert!(public.get("before").is_none());
        assert!(public.get("after").is_none());
    }

    fn test_store(name: &str) -> (PathBuf, Store) {
        let path = std::env::temp_dir().join(format!(
            "studio-operations-{name}-{}-{}",
            std::process::id(),
            now()
        ));
        let store = Store::open_or_create(&path).unwrap();
        (path, store)
    }

    fn cleanup(path: &Path) {
        fs::remove_dir_all(path).unwrap();
    }

    fn provider_with_path() -> ProviderSnapshot {
        let mut provider = provider(&["susfs_path"]);
        provider.features.push("SUSFS_LKM_MODULES".to_owned());
        provider
    }

    fn outcome(status: &'static str, code: &'static str) -> DeviceOutcome {
        DeviceOutcome {
            status,
            code: code.to_owned(),
        }
    }

    #[test]
    fn duplicate_apply_is_rejected_and_partial_result_is_explicit() {
        let (dir, store) = test_store("duplicate");
        let after = br#"{"format":"susfs-studio","schema":2,"settings":{"logging":true},"rules":{"paths":[{"id":"p","path":"/data/p","looping":false}],"maps":[],"kstats":[],"redirects":[]}}"#;
        let provider = provider_with_path();
        let plan = create(&store, None, after, &provider).unwrap();
        assert_eq!(plan.status, "ready");
        store.save(None, after).unwrap();
        let report = apply_inner(
            &store,
            &plan.id,
            &provider,
            persist,
            |action, _| match action {
                DeviceAction::AddPath { .. } => outcome("applied", "ACCEPTED"),
                _ => outcome("failed", "SUSFS_EIO"),
            },
        )
        .unwrap();
        assert_eq!(report.status, "partial");
        assert_eq!(report.applied.len(), 1);
        assert_eq!(report.failed.len(), 1);
        assert_eq!(
            apply(&store, &plan.id, &provider).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        let unchanged = create(&store, None, after, &provider).unwrap();
        assert_eq!(unchanged.status, "partial");
        prepare_retry(&store, &plan.id, &provider).unwrap();
        let retried = Cell::new(0);
        let report = apply_inner(&store, &plan.id, &provider, persist, |action, _| {
            assert!(matches!(action, DeviceAction::ToggleLogging(true)));
            retried.set(retried.get() + 1);
            outcome("applied", "ACCEPTED")
        })
        .unwrap();
        assert_eq!(retried.get(), 1);
        assert_eq!(report.status, "applied");
        cleanup(&dir);
    }

    #[test]
    fn write_ahead_failure_prevents_the_provider_mutation() {
        let (dir, store) = test_store("write-ahead");
        let after = br#"{"format":"susfs-studio","schema":2,"rules":{"paths":[{"id":"p","path":"/data/p","looping":false}],"maps":[],"kstats":[],"redirects":[]}}"#;
        let provider = provider_with_path();
        let plan = create(&store, None, after, &provider).unwrap();
        store.save(None, after).unwrap();
        let executed = Cell::new(false);
        let error = apply_inner(
            &store,
            &plan.id,
            &provider,
            |_, current| {
                if current.items.iter().any(|item| item.status == "applying") {
                    Err(io::Error::other("write-ahead unavailable"))
                } else {
                    persist(&store, current)
                }
            },
            |_, _| {
                executed.set(true);
                outcome("applied", "ACCEPTED")
            },
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::Other);
        assert!(!executed.get());
        assert_eq!(load(&store, &plan.id).unwrap().status, "applying");
        assert_eq!(
            apply(&store, &plan.id, &provider).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        cleanup(&dir);
    }

    #[test]
    fn process_loss_after_execution_preserves_unknown_recovery_boundary() {
        let (dir, store) = test_store("after-execute");
        let after = br#"{"format":"susfs-studio","schema":2,"rules":{"paths":[{"id":"p","path":"/data/p","looping":false}],"maps":[],"kstats":[],"redirects":[]}}"#;
        let provider = provider_with_path();
        let plan = create(&store, None, after, &provider).unwrap();
        store.save(None, after).unwrap();
        let executed = Cell::new(false);
        let error = apply_inner(
            &store,
            &plan.id,
            &provider,
            |_, current| {
                if executed.get() {
                    Err(io::Error::other("process stopped before receipt"))
                } else {
                    persist(&store, current)
                }
            },
            |_, _| {
                executed.set(true);
                outcome("applied", "ACCEPTED")
            },
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::Other);
        assert!(executed.get());
        let stored = load(&store, &plan.id).unwrap();
        assert_eq!(stored.status, "applying");
        assert!(stored.items.iter().any(|item| item.status == "applying"));
        cleanup(&dir);
    }
}
