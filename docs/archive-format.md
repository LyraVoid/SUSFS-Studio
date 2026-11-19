# Configuration Archive Format

Studio archive version 1 is a JSON object with `format` equal to `"susfs-studio"`, numeric `schema` equal to `1`, and a `rules` object. The rules object contains arrays named `paths`, `maps`, `kstats`, and `redirects`. Each entry is an object with a non-empty `id`; IDs must be unique across all four arrays. Additional fields are retained in the original text. The [sample](../contracts/archive-v1.json) illustrates the envelope.

The browser preview checks the envelope and IDs only. It does not validate rule-specific fields, migrate data, apply rules, or establish compatibility with the device. Other formats and schema versions remain available as original text and are marked unknown. Invalid version-1 structures remain available for inspection but are not marked valid. No native importer or saved-device configuration uses this format yet.

The native test-only envelope validator and browser preview share [classification cases](../contracts/archive-envelope-cases.json). The native validator rejects duplicate keys outright. It is not yet an import or persistence API.

Exact 64-bit values must be represented as decimal strings when authoring a Studio archive. The preview also preserves JSON number tokens losslessly for inspection of other inputs. It does not rewrite or export parsed data. Any repeated object key triggers an ambiguity warning, including equivalent escaped names and identical values. The original text is preserved; comparison uses the parsed value and must not be treated as an unambiguous interpretation.

Comparisons report added, removed, and changed JSON Pointer paths. Arrays are compared by position, so moving an entry can produce multiple changes. Numeric tokens are compared exactly as written: `1`, `1.0`, and `1e0` are reported as different. Comparison stops after 500 changes or 64 levels and explicitly indicates an incomplete result. The original text is retained even when comparison is incomplete.
