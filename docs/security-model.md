# Security Model

SUSFS Studio treats the host WebView, browser files, archive text, Provider replies, and reboot boundaries as separate trust domains. Controls fail closed when identity, ownership, capability, stage, or result is not established.

## Assets and trust boundaries

Protected assets include the host manager, KernelSU module files, Studio's private archive and journal, Provider runtime state, target-process visibility, boot configuration, and the user's chosen export or backup bytes.

The bundled document is trusted only within its package. A host-provided JavaScript bridge is not origin-isolated merely because Studio calls it with fixed strings. The host remains responsible for restricting top-level navigation and exposing the general-purpose `ksu.exec` and `ksu.io` interfaces only to the intended document and frames.

Studio's native executable is the authority for archive structure, Provider identity, capability planning, journal state, operation eligibility, and effect status. Browser state is a presentation layer and cannot promote a blocked item into an executable one.

## Threat controls

| Threat | Control | Residual boundary |
| --- | --- | --- |
| WebView injection or an untrusted frame calls the host bridge | The bundled page has a local-only CSP, no embedded frames, and no network connections. Studio sends fixed executable paths and fixed subcommands. | A legacy host bridge may be visible to frames or navigated pages. Studio cannot repair that host-wide interface and does not claim origin isolation. |
| Command injection through a path, package, UID, module name, archive value, or file name | User content is never concatenated into a shell command. Native receives structured archive bytes, validates paths and lists, and resolves them to fixed request structures. The adapter embeds only a 32-hex token returned by its own stage call. | The host's underlying `exec` interface remains general-purpose. |
| Path traversal or shell metacharacters | Archive paths are absolute, shorter than 256 bytes, and reject whitespace, controls, `/`, empty or dot segments, and duplicate identities. Module names and prefixes have separate bounded alphabets. | A syntactically valid path can still name a sensitive resource; eligibility and effect probes are separate controls. |
| Symlink or hard-link substitution in private storage | Store, stage, backup, receipt, and journal opens use directory file descriptors, `O_NOFOLLOW`, trusted ownership/mode checks, regular-file checks, and link-count checks. | Android directory ownership and SELinux policy are prerequisites, not properties provable by Studio. |
| TOCTOU between selection, plan, save, and apply | Stage captures the baseline device and inode. Save and restore compare the exact current archive under a non-blocking write lock. Plans bind baseline/candidate revisions and identity digests. | The selected browser file itself remains local untrusted input and is validated after read. |
| Replay after an ambiguous result | The item is durably marked `applying` before Provider execution. A missing, short, malformed, or interrupted response becomes `unknown`; automatic replay is forbidden. Recovery re-reads Provider identity, boot ID, journal, and effects. | A kernel-side operation that leaves no observable trace cannot be proven either applied or absent. |
| Wrong execution UID or process context | Provider calls require root and report the executing UID. Eligibility records the expected UID. Effect probes use fixed `su -Z` process contexts for app-domain path/map/open tests. | Redirect schemes and target application scope must be audited per Provider build. |
| Archive tampering | The archive and staged upload are size-limited, UTF-8 JSON with duplicate-key rejection, structural validation, exact revision binding, stable inode and hard-link checks, and atomic durable replacement. Unknown schemas remain inspectable but not writable. | A privileged actor can change the private store; the receipt detects bytes only when the archive still matches the recorded revision. |
| Receipt forgery or stale receipt | The WebUI parses protocol, request ID, digest shape, byte count, archive text, receipt revision, save time, and readback together. The revision is the SHA-256 of exact bytes. A receipt from a different revision or boot remains unusable. | The receipt proves archive bytes, not kernel effects. |
| Concurrent save or apply | A non-blocking native store lock protects archive replacement and journal state. Revision conflicts retain the draft. A second apply is rejected; accepted items are skipped. Current-boot journal files are protected from time-based retention pruning. | Separate processes can still race outside the lock only by replacing untrusted files, which staging and identity checks reject. |
| Short write or failed sync | Upload writes are checked, staged files are re-read, and archive/receipt updates use same-directory temporary files, `fsync`, and rename. A result after replacement is reported unknown until readback. | Visible rename is not proof of persistence across sudden power loss. |
| Provider spoofing or stale capability evidence | Detection requires syscall version, raw features, variant consistency, implementation classification, adapter confirmation, runtime proc nodes, boot ID, and current execution UID. Unknown versions report active diagnostics without write authorization. | A compromised kernel can lie to all userspace probes. |
| Sensitive data in logs and receipts | Public plans omit archive text, redact per-item values, use identity digests, and bound item counts, field lengths, effects, and journal size. Boot logs contain phase names and opaque plan IDs only. | Exported archives are user-controlled files and may contain sensitive paths chosen by the user. |
| Host app metadata or icon confusion | Studio keeps package names and UIDs from its native fixed query. Optional host labels must refer to a name in that set and pass length and control-character checks. Host icon URIs are decorative and fall back to a text tile. | A malicious host can mislabel an app or supply a misleading icon, but cannot change the selected package name or native UID resolution through this presentation path. |

## Result semantics

`saved` means Studio-owned bytes are durable with a matching receipt. `applied` means a Provider call returned an accepted result for that item. `partial` means at least one item in the plan accepted and at least one failed, deferred, blocked, or remained unknown. `unknown` means the result could not be determined. `pending_reboot` means the requested effect or reversal depends on a lifecycle change.

`effectStatus: verified` is set only from independent probes for every accepted item. It is never derived from archive storage, a plan ID, a loaded module, or a syscall acknowledgement. Missing effects downgrade the effect result rather than changing the operation result into a claimed success.

## Deployment constraints

The module uses a private root-owned `/data/adb/susfs-studio` store and its own boot scripts. It does not invoke FinaSU's controller, use sidex15's userspace binary, change host ownership state, modify the host manager, or write another controller's configuration.

The automatic boot path performs a fixed host GKI-LKM load only when the Studio archive enables automatic work and the Provider is missing. With automatic work disabled, `post-fs-data.sh` exits before loading a KO. This behavior was tested with an actual reboot and Provider cleanup.

## Verification limits

The strongest current evidence is for LKM SUSFS 2.3.0 and Built-In GKI SUSFS 2.4.0 on the stated arm64, kernel 6.6 and KernelSU/FinaSU hosts. Built-In 2.3, LKM 2.4, NON-GKI kernels, other architectures, unknown Provider versions, unobserved redirect schemes, and other hosts remain unverified. They are still operable when implementation identity and protocol are known; missing evidence does not silently become successful effect evidence. A host that does not enforce origin-scoped bridge exposure remains a host-level security limitation even when Studio's own inputs are fixed.
