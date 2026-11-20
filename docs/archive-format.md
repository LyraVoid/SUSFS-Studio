# Studio Archive Format

Studio archives are an offline JSON representation of four SUSFS rule categories and, in version 2, optional settings. Saving an archive does not call SUSFS. A separate provider-qualified plan and explicit confirmation are required before any archive field is resolved into a device operation.

The representative fixture is [archive-v1.json](../contracts/archive-v1.json). Positive and negative boundary cases shared by Rust and TypeScript are in [archive-envelope-cases.json](../contracts/archive-envelope-cases.json).

## Envelope

The root must be a JSON object with these required fields:

```json
{
  "format": "susfs-studio",
  "schema": 1,
  "rules": {
    "paths": [],
    "maps": [],
    "kstats": [],
    "redirects": []
  }
}
```

`schema` must be the numeric token `1` or `2`. A quoted string, `1.0`, a missing schema, another number, or a different `format` value is unknown. Unknown schemas remain available as original text and are never converted or overwritten. If a known schema has malformed structure or fields, it is invalid instead.

The four `rules` arrays are required. Unknown object fields are allowed at the envelope, rules, and individual-rule levels. They remain in the original text, including their original number tokens and ordering. They are not interpreted as device operations.

### Version 2 fields

- `settings`: optional object. `hideMounts`, `logging`, and `avcSpoof` are optional booleans or `null` (unmanaged). `priorityUidFilter` is an optional list of distinct package names, each 1–255 ASCII letters, digits, dots or underscores, excluding `.` and `..`. The sum of each name's byte length plus one must be at most 65,535. An explicitly empty list differs from an omitted filter.
- `uname`: optional `null` or object with `release` and `version`, each a nonblank single-line string of at most 64 UTF-8 bytes and no control characters.
- `cmdline`: optional `null` or a string shorter than 8,192 UTF-8 bytes. An empty string is allowed; a non-empty string must not be blank or contain controls other than newline and tab.
- `lkm`: optional object with optional `hiddenModules` (up to 16 distinct names of 1–63 ASCII letters, digits or underscores) and `mountPrefixes` (up to eight distinct paths following the path rules below).
- `automatic`: optional boolean that enables Studio's own boot handler. When true, the module runs `pre-mount` and `late-pre-mount` from `post-fs-data.sh` plus `post-mount` and `late-load` from `service.sh`. It never invokes the host manager's or FinaSU's task. When false or absent, Studio's boot handler exits without loading or applying a provider. The host may still load its own LKM outside Studio.

Studio queries the live Provider before considering any KO fallback. An active Built-In or LKM Provider is left in place. The known-KO fallback is disabled unless the module directory contains an explicit `load-lkm` marker; Studio does not infer permission to replace a Built-In Provider from a missing proc node.

Version 1 remains readable and editable without migration. A version upgrade is a previewed and separately confirmed save that changes only the schema token. The upgrade is unavailable if the old archive already uses any of the new keys as unknown metadata; Studio does not silently reinterpret them.

### Configuration exchange

The exchange view converts a separate SUSFS configuration format to or from Studio JSON. It never passes the original configuration to native storage or sends a command to another manager. Import accepts foreign schemas 1 and 2, with static kstat available only in foreign schema 2. Export writes foreign schema 2. Static values use exact JSON integer tokens in the exchange format and decimal strings in Studio. Redirect scopes 3 and 4 remain valid Studio values but are refused by this exchange profile. Unknown fields, rule kinds or versions are not approximated.

The formats differ in presentation: import creates Studio IDs and groups rules by category while preserving within-category order; export does not carry Studio IDs. Omitted tri-state settings and unset static fields use the target format's equivalent unset representation. Missing automatic and extension values export as disabled and empty lists; an omitted UID filter remains omitted. Studio's original archive and the selected foreign file remain unchanged by conversion. Saving a converted preview requires reviewing its difference from the current archive.

## Common constraints

- The input is at most 128 KiB before parsing.
- The input must be valid UTF-8 and must not start with a UTF-8 byte-order mark.
- The root object counts as nesting level 1. More than 64 nested objects or arrays is invalid.
- Duplicate object keys are invalid, including identical values and equivalent escaped names such as `"x"` and `"\u0078"`.
- The four arrays contain at most 128 entries in total.
- Every entry is an object. `id` is a non-empty single-line string of at most 128 UTF-8 bytes. IDs are unique across all four categories.
- Every entry has a `path`. It is an absolute UTF-8 path shorter than 256 bytes, cannot be `/`, and cannot contain whitespace, control characters, `//`, `.` segments, or `..` segments.
- A category may contain only one rule for the same `(category, path)` identity. Changing optional metadata does not make a duplicate path a new rule.
- All known fields use the required JSON type. Unknown fields do not relax a missing or invalid known field.

## Path rules

```json
{ "id": "path-example", "path": "/data/example", "looping": false }
```

`looping` is a required boolean. It corresponds to the distinction between a regular path addition and the looping path addition exposed by providers. Format validation does not establish that the current provider supports either operation.

## Map rules

```json
{ "id": "map-example", "path": "/data/example" }
```

Map rules require only the common fields. Whether the provider exposes map hiding is reported separately by diagnostics.

## Kstat rules

Kstat rules support three modes:

```json
{ "id": "normal", "path": "/data/a", "mode": "normal" }
{ "id": "clone", "path": "/data/b", "mode": "fullClone" }
{
  "id": "static",
  "path": "/data/c",
  "mode": "static",
  "static": {
    "inode": "18446744073709551615",
    "device": "1",
    "links": "1",
    "size": "4096",
    "atimeSeconds": "-1",
    "atimeNanoseconds": "0"
  }
}
```

`mode` is required. `normal` and `fullClone` reject a `static` object. `static` requires a non-empty `static` object containing at least one recognized field. Unknown fields in `static` are retained.

All recognized static values are canonical decimal strings. JavaScript numbers are never used to write these values.

| Field | Range |
| --- | --- |
| `inode`, `device` | unsigned 64-bit |
| `links` | unsigned 32-bit |
| `size`, `blocks`, `blockSize` | non-negative signed 64-bit |
| `atimeSeconds`, `mtimeSeconds`, `ctimeSeconds` | signed 64-bit |
| `atimeNanoseconds`, `mtimeNanoseconds`, `ctimeNanoseconds` | `0` through `999999999` |

Decimal strings use `0` or a non-zero digit followed by digits. Negative signed values use a minus sign and no leading zeroes. Overflow, leading zeroes, exponent notation, fractions, and JSON numbers are invalid for these fields.

## Redirect rules

```json
{
  "id": "redirect-example",
  "path": "/system/example",
  "destination": "/system/example.redirect",
  "uidScheme": 2
}
```

`destination` follows the same path constraints as `path` and must differ from it. `uidScheme` is a JSON integer from `0` through `4`. These values follow the provider ABI's uid-scheme range; the archive does not claim that a particular provider or redirect combination is available.

## Validation boundaries

The browser and `studioctl preview` use the same classification cases:

- `valid`: a supported schema and all known structural and field constraints pass.
- `invalid`: malformed JSON, invalid UTF-8, input or nesting overflow, duplicate keys, or a known version with invalid structure or fields.
- `unknown`: a well-formed document without the Studio format and a supported schema token.

Malformed input, invalid UTF-8, an oversized file, excessive depth, and damaged JSON all produce a stable invalid result. A duplicate-key document remains available for inspection but cannot be saved.

Format validity is not device applicability. The preview does not prove that:

- a rule is semantically useful;
- the installed provider supports the category or full-clone/static variant;
- the target path currently exists;
- local SELinux, mount, boot-stage, or ownership constraints permit application;
- a rule is already applied.

Those are separate provider and device checks. Archive save itself applies no rules. The operation plan determines whether a field is eligible, blocked, deferred, or requires a reboot.

## Comparison

The browser reports added, removed, and changed JSON Pointer paths. Arrays are compared by position. Numeric tokens are compared exactly as written, so `1`, `1.0`, and `1e0` differ. Comparison stops after 500 changes or 64 levels and marks the result incomplete. The original text remains unchanged when a comparison is incomplete.

Rule edits replace only the edited values or list entries in the source text. Untouched groups, unknown fields, and their original numeric tokens are not reserialized. Switching a static kstat rule to another mode is refused if that would discard unknown static fields. If the comparison parser cannot represent an archive field or the full difference cannot be reviewed, the rule pages do not save it.

## Device storage and receipt

Device save is available only when the host exposes a verified constrained file stream. The native command creates a one-time token and an empty `0600` file below `/data/adb/susfs-studio/.staging/`. The WebUI writes the selected bytes through the host file stream, then invokes the fixed save command with that token. The path is never derived from a selected file name.

Under one non-blocking write lock, native then:

1. validates the staged object, ownership, mode, hard-link count, size, and stable contents;
2. rereads and validates the current archive;
3. compares it byte-for-byte with the baseline captured by `stage`;
4. consumes the staged input;
5. writes and synchronizes a same-directory exclusive temporary file;
6. atomically renames it to `archive.json`, synchronizes the directory, and writes the receipt in the same manner.

The staging baseline records the device and inode of the prepared input. Replacing the input, even with another private regular file, invalidates the stage. An update of the executable invalidates any outstanding stages written with the earlier baseline encoding; prepare a fresh stage after reviewing the archive.

The revision is the lowercase SHA-256 digest of the exact saved bytes. The receipt records that revision, saved time, and byte count. A conflict or busy result leaves the current archive untouched. A failure before archive replacement is known not to have committed. A failure after replacement or during directory synchronization is reported as result unknown. The UI preserves the browser draft and requires a refresh before another save.

On the rule pages, Studio rereads the archive after saving and checks the exact text, revision, and persisted receipt before showing success. Refresh can rebase a retained draft on a newer archive if all affected entries still match. If any edited entry changed or replay would be invalid, the draft and current text remain available separately, with saving disabled.

Every staged save and restore first preserves the current archive as a private backup before replacing it. The backup contains the exact prior bytes and is subject to the same trusted-file checks as the current archive. Creating a plan does not consume or bypass the archive revisions.

If the process stops after the archive rename but before the receipt is durable, the archive remains readable and the missing receipt is reported separately. Recovery starts by reading and validating the archive; it does not silently replay a save.

Interrupted atomic temporary files are not replayed or automatically removed on a subsequent stage. A matching name alone does not establish ownership by the current transaction. Such files can consume space until an administrator identifies and removes them.

Export rereads `archive.json` and returns the exact UTF-8 text. Unknown fields and number tokens are therefore preserved.

A trusted archive file within the size limit can be read for inspection even if its UTF-8 JSON text is invalid or uses an unknown schema. It receives no valid receipt, and native staging still refuses to overwrite it. Unsafe file types, untrusted permissions, oversized files, and undecodable bytes are not exposed through the text interface.

Restore accepts a selected supported Studio archive through the same staging path and baseline check as save. Under the same lock, it writes the current archive to an exclusive `0600` temporary file, synchronizes it, publishes it with an atomic no-replace rename, and synchronizes the directory before consuming the stage and replacing the archive and receipt. If the filesystem cannot publish without replacement, restore fails closed. It refuses restore when no current archive exists. An interrupted attempt can leave a temporary file or backup; neither is automatically deleted. A backup write or sync failure leaves the current archive unchanged. After archive replacement, an unconfirmed sync or receipt is result unknown: refresh and inspect before another attempt. The revision is the digest of the restored bytes and may match an earlier revision. A receipt returned by `read` is associated with those bytes, not with an individual browser request. This operation does not change kernel runtime state.

Automatic backups are the prior archives preserved by staged saves and restores. The list returns up to 32 newest trusted files with an opaque identifier, filesystem modification time in Unix seconds, size, validation state, and SHA-256 revision for valid content. Unsafe file types, links, and permissions are excluded; malformed, unknown-schema, and oversized archives are marked unavailable. Backup reading validates the archive again and never accepts a filesystem path. The WebUI compares the returned revision with the selection and previews the exact returned text. Restoring those bytes still requires separate confirmation and validation against the latest reviewed current-archive revision.

## Device operation transaction

Operation protocol version 2 is defined by the shared [operation fixture](../contracts/operation-v2.json). A plan is bound to the baseline and candidate archive revisions, Provider implementation/version/variant, raw features, runtime proc extensions, boot ID, executing UID, and one identity and idempotency key per item. The public plan omits archive payload text.

An item records its category, intent, stage, eligibility, reason, effect probe, recovery method, identity digest, status, and attempts. Plan and effect state are separate. Operation states include `saved`, `applying`, `applied`, `partial`, `failed`, `unknown`, `deferred`, `pending_reboot`, `blocked`, and `recovery_required`; effect state is `unverified`, `partial`, or `verified`.

Before a Provider mutation, Studio durably writes the plan with the item in `applying`. A successful fixed call is recorded as `applied` even when the effect probes do not observe the expected result. A missing or ambiguous response becomes `unknown`; it is never automatically replayed. Read Provider identity, boot ID, journal, and effect state before choosing recovery. `retry-plan` executes only items in the known failure set, not accepted items.

Current-boot operation files are protected from journal retention even when the pre-Android-time clock gives them an epoch-era filesystem timestamp. The journal remains bounded by removing the oldest terminal plans outside the current boot first.

The verified GKI-LKM 2.3.0 combination uses the following stages:

| Category | Stage and recovery |
| --- | --- |
| Path, Map, redirect, static kstat, settings, uname, cmdline/bootconfig, hidden modules, prefixes | Live mutation where a known Provider implementation, reported feature, and required ABI evidence permit it. Each accepted entry has a fixed proc deletion, inverse toggle, real-uname reset, or provider reapply recovery. |
| Dynamic kstat | `pre-mount` captures the snapshot and defers post-mount completion; `late-pre-mount` deduplicates the snapshot; `post-mount` performs the redirect. A live request is `pending_reboot` and cannot synthesize the missed pre-mount state. |
| LKM cmdline empty reset | The tested Provider rejects the empty write. Studio records `pending_reboot` and does not claim an online reset. |
| Previously hidden path/rule replacement | Use the audited add/remove ABI when possible. Unsupported deletion or combinations wait for reboot rather than inventing an ABI. |
