# Studio Archive Format

Studio archive version 1 is an offline JSON representation of four SUSFS rule categories. It is a Studio-owned storage format. Saving an archive does not call SUSFS, change the provider, apply a rule, or change another manager's state.

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

`schema` must be the numeric token `1`. A quoted string, `1.0`, a missing schema, another number, or a different `format` value is unknown. Unknown schemas remain available as original text and are never converted or overwritten. If a known version-1 document has malformed structure or fields, it is invalid instead.

The four `rules` arrays are required. Unknown object fields are allowed at the envelope, rules, and individual-rule levels. They remain in the original text, including their original number tokens and ordering. They are not interpreted as device operations.

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

- `valid`: version 1 and all known structural and field constraints pass.
- `invalid`: malformed JSON, invalid UTF-8, input or nesting overflow, duplicate keys, or a known version with invalid structure or fields.
- `unknown`: a well-formed document that is not the exact Studio version-1 envelope.

Malformed input, invalid UTF-8, an oversized file, excessive depth, and damaged JSON all produce a stable invalid result. A duplicate-key document remains available for inspection but cannot be saved.

Format validity is not device applicability. The preview does not prove that:

- a rule is semantically useful;
- the installed provider supports the category or full-clone/static variant;
- the target path currently exists;
- local SELinux, mount, boot-stage, or ownership constraints permit application;
- a rule is already applied.

Those are separate provider and device checks. No archive operation applies rules.

## Comparison

The browser reports added, removed, and changed JSON Pointer paths. Arrays are compared by position. Numeric tokens are compared exactly as written, so `1`, `1.0`, and `1e0` differ. Comparison stops after 500 changes or 64 levels and marks the result incomplete. The original text remains unchanged when a comparison is incomplete.

## Device storage and receipt

Device save is available only when the host exposes a verified constrained file stream. The native command creates a one-time token and an empty `0600` file below `/data/adb/susfs-studio/.staging/`. The WebUI writes the selected bytes through the host file stream, then invokes the fixed save command with that token. The path is never derived from a selected file name.

Under one non-blocking write lock, native then:

1. validates the staged object, ownership, mode, hard-link count, size, and stable contents;
2. rereads and validates the current archive;
3. compares it byte-for-byte with the baseline captured by `stage`;
4. consumes the staged input;
5. writes and synchronizes a same-directory exclusive temporary file;
6. atomically renames it to `archive.json`, synchronizes the directory, and writes the receipt in the same manner.

The revision is the lowercase SHA-256 digest of the exact saved bytes. The receipt records that revision, saved time, and byte count. A conflict or busy result leaves the current archive untouched. A failure before archive replacement is known not to have committed. A failure after replacement or during directory synchronization is reported as result unknown. The UI preserves the browser draft and requires a refresh before another save.

If the process stops after the archive rename but before the receipt is durable, the archive remains readable and the missing receipt is reported separately. Recovery starts by reading and validating the archive; it does not silently replay a save.

Export rereads `archive.json` and returns the exact UTF-8 text. Unknown fields and number tokens are therefore preserved. Restore is outside the current save/export scope.
