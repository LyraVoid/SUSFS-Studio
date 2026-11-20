# Rule Operation Boundary

Studio's provider is read-only. Archive validation and comparison are not device application, and feature markers are not permission to write or evidence of effect. The Home application action is disabled, and the CLI apply and verify commands return a structured rejection without sending a rule operation to the provider. No per-rule result is fabricated.

## Review matrix

| Category and archive fields | Minimum capability evidence | Stage restriction | Confirmation and receipt | Effect verification |
| --- | --- | --- | --- | --- |
| Path: `path`, `looping` | Reported path feature plus a verified implementation-specific regular or looping ABI. | Target availability and boot ordering require device evidence. | Disabled; a future write would require explicit confirmation and a receipt for each entry. | Independently verify visibility from the intended process context. |
| Map: `path` | Reported map feature and verified provider ABI. | Target and process lifetime require device evidence. | Disabled; confirmation and individual receipts required before any write. | Independently inspect the intended process mapping view. |
| kstat: `path`, `mode`, optional static fields | Reported kstat feature and a verified ABI for the selected mode; full clone and static support are not inferred from the marker. | Snapshot timing and mount ordering require explicit verification. | Disabled; confirmation and individual receipts required before any write. | Independently compare stat results in the intended context. |
| Redirect: `path`, `destination`, `uidScheme` | Reported redirect feature and verified implementation/version-specific UID semantics. | Target existence and mount ordering require device evidence. | Disabled; confirmation and individual receipts required before any write. | Independently verify the open result under the intended UID. |

The diagnostic implementation currently queries only version, feature, and variant commands in `native/src/main.rs`. Its capabilities describe reported configuration markers. For one inspected built-in dispatch implementation, `kernel/extension/susfs.c` in the locally inspected source tree routes separate path, looping path, map, normal/static kstat, and redirect commands behind corresponding feature guards. This establishes only that implementation's dispatch, not a stable cross-version ABI, timing, success semantics, or LKM equivalence. The installed GKI-LKM device reported SUSFS 2.3.0 and the four markers; no write was tested.

## Arm64 source and artifact comparison

The inspected built-in 2.3 and 2.4 source trees declare the same command IDs and request fields for these four categories. The 2.4 source changes internal path matching state, so equal request fields do not establish equal runtime behavior. The local 2.3 LKM artifact and 2.4 built-in object also show matching request sizes and result offsets in their debug type metadata:

| Request | Size (bytes) | Result offset (bytes) | Source constraints still relevant |
| --- | --- | --- | --- |
| Path (regular or looping) | 260 | 256 | NUL-terminated path in 256 bytes. Looping has a distinct command and must be tested separately across mount changes. |
| Map | 260 | 256 | NUL-terminated path in 256 bytes. The target file and the observing process's mapping must both be established. |
| Kstat | 376 | 372 | Path starts at byte 16, with 64-bit `long` fields on arm64 and 32-bit flags at byte 368. Matching layout does not prove matching flags or full-clone semantics. An earlier snapshot must exist before an update can reuse it. |
| Redirect | 520 | 516 | Two NUL-terminated 256-byte paths and a 32-bit UID selector at byte 512. Acceptance does not prove that the desired process took the redirect. |

The inspected LKM dispatch requires UID 0 and leaves the caller's result field untouched when the command is not handled. The installed device's root diagnostic query reported LKM 2.3 and all four feature markers; a Studio invocation under UID 2000 returned a diagnostic failure before querying. This is not a test of kernel-side write authorization. No installed LKM artifact has been matched byte-for-byte to the reference build, and neither built-in version was booted in this round. No write, independent effect measurement, or rollback was performed.

The source review found both module `post-fs-data` loading and an optional earlier loader in reference artifacts. The current live provider's response does not identify when it was loaded. A late UI session cannot establish that a pre-mount kstat snapshot was captured or schedule a future stage simply by displaying “pending reboot.” Studio does not register any such task.

Provider writes remain disabled for every combination. Before enabling one, verify the exact device build, authorization and complete return semantics, startup stage, independent effect and rollback. Confirmations and receipts must distinguish accepted, failed, unknown, and independently verified effects; they must not be merged into archive save or restore.

An ownership flag that disables a host's internal implementation is not a grant to Studio. Studio does not switch ownership, invoke another manager's mutation commands, or use a lower-level interface to bypass that boundary.
