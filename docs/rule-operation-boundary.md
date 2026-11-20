# Rule Operation Boundary

Studio's provider is read-only. Archive validation and comparison are not device application, and feature markers are not permission to write or evidence of effect. The current interface does not offer a device-rule confirmation or per-rule receipt. No rule operation is sent to the provider.

## Review matrix

| Category and archive fields | Minimum capability evidence | Stage restriction | Confirmation and receipt | Effect verification |
| --- | --- | --- | --- | --- |
| Path: `path`, `looping` | Reported path feature plus a verified implementation-specific regular or looping ABI. | Target availability and boot ordering require device evidence. | Disabled; a future write would require explicit confirmation and a receipt for each entry. | Independently verify visibility from the intended process context. |
| Map: `path` | Reported map feature and verified provider ABI. | Target and process lifetime require device evidence. | Disabled; confirmation and individual receipts required before any write. | Independently inspect the intended process mapping view. |
| kstat: `path`, `mode`, optional static fields | Reported kstat feature and a verified ABI for the selected mode; full clone and static support are not inferred from the marker. | Snapshot timing and mount ordering require explicit verification. | Disabled; confirmation and individual receipts required before any write. | Independently compare stat results in the intended context. |
| Redirect: `path`, `destination`, `uidScheme` | Reported redirect feature and verified implementation/version-specific UID semantics. | Target existence and mount ordering require device evidence. | Disabled; confirmation and individual receipts required before any write. | Independently verify the open result under the intended UID. |

The diagnostic implementation currently queries only version, feature, and variant commands in `native/src/main.rs`. Its capabilities describe reported configuration markers. For one inspected built-in dispatch implementation, `kernel/extension/susfs.c` in the locally inspected source tree routes separate path, looping path, map, normal/static kstat, and redirect commands behind corresponding feature guards. This establishes only that implementation's dispatch, not a stable cross-version ABI, timing, success semantics, or LKM equivalence. The installed GKI-LKM device reported SUSFS 2.3.0 and the four markers; no write was tested.

Before enabling writes, review public ABI definitions and each supported version's payload, authorization, return semantics, startup stage, rollback, and observable effect on real devices. Changing the provider permission model requires a separate decision. Confirmations and receipts must distinguish accepted, failed, unknown, and independently verified effects; they must not be merged into archive save or restore.
