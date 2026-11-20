# Rule Operation Boundary

Studio's provider operation layer uses its own archive, operation plan, journal, fixed executable arguments, and effect probes. A feature marker, a loaded kernel module, an archive receipt, or a returned syscall value alone does not authorize an operation or prove its effect. Every item must have a known Provider implementation and audited ABI, the required runtime proc extension, an eligible stage and UID, an independent effect probe, and a recovery path.

The Rules surface keeps host access, Provider identity, raw features, adapter confirmation, per-item eligibility, operation state, effect state, and recovery state separate. A missing host, absent Provider, unknown protocol, unreported feature, explicitly unsupported feature, unaudited ABI, missing proc extension, stale evidence, missing authorization, deferred boot-stage work, and pending reboot are distinct results.

## Provider ABI matrix

The table describes the evidence level, not a claim that every combination behaves identically. Unknown builds stay fail-closed until their runtime identity and request/response layout are re-audited.

| Provider family | Versions and variants | Current evidence | Operation disposition |
| --- | --- | --- | --- |
| LKM | SUSFS 2.3.0, GKI-LKM, arm64, kernel 6.6, KernelSU `v3.3.1-50-g64833c00` | Real-device request, return, effect, restart, and cleanup tests completed for the supported operations below. | Eligible when the per-item proc extension and capability checks pass. |
| LKM | Other 2.3 builds, NON-GKI, other kernels, other architectures | No matching runtime test. The source/layout review is not build-identity proof. | Blocked as unaudited or unreported. |
| LKM | SUSFS 2.4 | No matching running Provider was tested in this pass. | Blocked until runtime dispatch, return semantics, effects, and recovery are verified. |
| Built-In | GKI 2.4.0, arm64, kernel 6.6, PKX110 / Android 17 | Runtime request, return, item effect, restart reset, and cleanup tested for the operations below. | Eligible when the subfeature is reported and its per-item ABI and probe pass. |
| Built-In | GKI 2.3.0 | Reference-source evidence only. | Blocked as unaudited at runtime. |
| Built-In | NON-GKI or unknown | No audited runtime target. | Blocked. |
| Any | Unknown version, implementation, or protocol | The interface may remain visible for diagnostics. | No write eligibility. |

Runtime capability detection reads the Provider version, features, variant, readable proc extensions, static-kstat field list, and redirect UID scheme report. A `CONFIG_*` token alone does not authorize a subfeature when the corresponding proc extension or exact ABI is absent. LKM module hiding and mount-prefix operations additionally require a live LKM identity and the exact extension nodes.

## Verified Built-In 2.4.0 matrix

| Area | Implemented operation | Stage and constraints | Independent effect and recovery |
| --- | --- | --- | --- |
| Detection | Version, implementation, variant, raw features, boot ID, UID, 12 static fields, UID schemes `[0,1,2]` | Fixed supercall request; no proc extension is required for Built-In. | Re-read after mutation and reboot. Missing, unknown protocol, and non-root remain distinct. |
| Path | Regular and looping add | Live add through the two fixed path commands. | App-UID `stat`; looping paths were hidden after the kernel re-flag pass. |
| Map | Add | Live fixed command. | A temporary real app process observed `hidden` in its own maps. The standard test helper cannot create the app task flag, so the formal plan remains unverified unless a real app observation is available. |
| Dynamic kstat | Normal and full clone | Pre-mount capture and post-mount update; a live request is `pending_reboot`. | Built-In supercall phases and app-context stat were verified by late invocation. A genuine Built-In boot sequence is blocked on the stated host by its independent `susfs_guard_lkm` autoload. |
| Static kstat | All 12 fields, add and same-mode update | Exact decimal input; conflicts or mode replacement wait for reboot. | Target-app `stat` matched all fields. The `device` field follows the kernel `dev_t` encoding boundary. |
| Redirect | Schemes 0, 1, 2 | Each archive value must be in the Provider report. | Opened and read the destination under a non-app shell UID, a non-KSU root UID, and an app UID respectively. Scheme 3 plans were blocked with `UID_SCHEME_UNSUPPORTED`. |
| Hide mounts | Unmanaged, explicit off/on | Live fixed toggle. | Root and non-su mountinfo KSU-ID counts changed from `27/27` to `27/0`. |
| Logging | Unmanaged, explicit off/on | Live fixed toggle. | The desired toggle was reissued idempotently and the latest kernel state line was read. |
| AVC log spoof | Unmanaged, explicit off/on | Built-In uses command `0x00060010`; no proc node is required. | Kernel acceptance and the latest kernel state line are observable. An independent KSU feature query is not equivalent to the SUSFS toggle; enabled spoof-event effect remains unverified on this Provider. |
| Priority UID filter | Unmanaged, empty list, add, replace, clear | Built-In only; empty is encoded as `,`. | A separate app UID queried a temporary target UID through `PRIORITY_USER`; filtered and unfiltered outcomes were distinguished. |
| uname | Unmanaged, manual values, real-value reset | Live Built-In supercall. | `uname` matched the manual value and returned the real kernel value after reboot. |
| cmdline / bootconfig | Unmanaged, manual value, reset intent | A manual value is applied live. The empty reset was rejected online on Built-In 2.4 and is returned as `pending_reboot`. | `/proc/bootconfig` matched the value; the real content is verified after reboot. |
| LKM hidden modules / prefixes | Entry remains visible | Not reported by Built-In. | Plans are blocked with `PROC_EXTENSION_REQUIRED`; no fake LKM operation is attempted. |

## Verified LKM 2.3.0 matrix

| Area | Implemented operation | Stage and constraints | Independent effect and recovery |
| --- | --- | --- | --- |
| Detection | Version, implementation, variant, raw features, runtime proc nodes, boot ID, UID, static fields, UID schemes | Fixed syscall and proc inspection; root required for writes. | Re-read after mutation and after reboot. Missing Provider, unknown protocol, and non-root access remain distinct. |
| Path | Regular and looping add/remove | Live for the audited GKI-LKM 2.3.0 ABI. Fixed path length validation and NUL-safe request storage. | App-domain visibility probe. Removal uses the affected proc node; unsupported removal waits for reboot. |
| Map | Add/remove | Live with a real target mapping in an app-domain process. | `/proc/self/maps` observed inside the app SELinux domain. Proc removal and restart/reboot recovery. |
| Dynamic kstat | Normal and full clone, snapshot, post-mount redirect | `pre-mount` captures; `late-pre-mount` deduplicates; `post-mount` updates. A live request becomes `pending_reboot`. | Stat syscall probe after the post-mount update. A missed snapshot is never reconstructed online. |
| Static kstat | Twelve reported fields, exact decimal strings, 64-bit range validation | Live add/update by identity; conflicts are explicit. | Target-process stat probe. The device run covered the reported field set with a live value; all field-width boundaries are fixture/unit tested. |
| Redirect | Source, destination, UID schemes 0–4 | Live where the Provider reports the scheme. Scheme 2 was executed under a service-range app UID. | Open-result probe in the intended app domain. Schemes 0, 1, 3, and 4 remain archive/protocol tested but do not have per-scheme device evidence. |
| Hide mounts | Unmanaged, explicit off/on | Live tri-state write. | App-range mountinfo observation. Inverse toggle. |
| Logging | Unmanaged, explicit off/on | Live proc write. | Independent proc-state probe. Inverse toggle. |
| AVC spoof | Unmanaged, explicit off/on | Live proc write when the extension is reported. | App-domain SELinux trigger and `enter`/`hits` state observation. Inverse toggle. |
| Priority UID filter | Unmanaged, explicit empty list, add/remove | LKM is blocked as `ABI_NOT_AUDITED`. A Built-In app/UID source is exposed only for an audited Built-In Provider. | No device effect is claimed for LKM. |
| uname | Unmanaged, manual values, real-value reset | Live for the audited LKM ABI. Manual spoof and reboot restoration were tested. | `uname(2)` probe and post-reboot real-value check. |
| cmdline / bootconfig | Unmanaged, manual value, explicit reset intent | The tested LKM writes `/proc/bootconfig`, not `/proc/cmdline`. Empty reset returns an unsupported boundary and becomes `pending_reboot`. | Proc probe before/after and post-reboot real bootconfig check. |
| LKM hidden modules | Add/remove/apply | Live list mutation with name and count validation. | Module visibility plus Provider state observed independently. Removal restores the list. |
| LKM mount prefixes | Add/remove/apply | Live absolute-path list mutation with count validation. | Mountinfo plus Provider state in the target context. Bind-mount test resource was removed after verification. |
| Automatic application | Studio-owned pre-mount, late-pre-mount, post-mount, late-load | `automatic=true` enables the module scripts. Studio first queries the live Provider and never loads a KO for an active Built-In or LKM Provider. The known-KO fallback requires the separate opt-in `load-lkm` module file. | LKM reboot phases were previously verified. A Built-In 2.4 reboot captured both dynamic-kstat snapshots before mount, deduplicated them at late pre-mount, applied both after mount, and passed independent verification. A later disabled boot created no current-boot plan and left the Provider rules absent. |

## Reboot and recovery rules

A late UI session cannot recreate a missed mount snapshot. Dynamic kstat writes made after the pre-mount stage are reported as `pending_reboot`. A Provider that rejects an online reset is not treated as a successful deletion. If an inverse ABI is unavailable, Studio marks the state `pending_reboot` and waits rather than claiming online rollback.

Built-In 2.4 has no audited online delete command for paths, Map, redirect, or kstat. Removing an existing Built-In rule therefore produces `ONLINE_REMOVE_UNAVAILABLE` and `pending_reboot`; Studio does not invent a proc delete.

The operation journal is written before and after each Provider call. Accepted items are not replayed. `retry-plan` can retry only known failed items. `recover-plan` re-reads Provider identity, boot ID, archive revision, item identity, the write-ahead record, and effect evidence before returning `applied` or `recovery_required`. A missing or ambiguous result remains `unknown` until that inspection completes.

Plans bind the Provider boot ID and archive revisions. A new boot or a changed Provider identity invalidates the plan's execution eligibility. The store keeps every current-boot plan even when the pre-Android clock makes early boot files appear older than later files.

## Ownership and host boundaries

Studio does not invoke FinaSU's `ksud susfs` controller or sidex15's `ksu_susfs`. It does not change a host ownership switch, write another controller's files, or treat a host's general-purpose bridge as origin isolation. The KernelSU file stream is used only with the opaque staging path returned by Studio, and every user value remains structured payload or validated data, never shell text.

An earlier host configuration autoloaded LKM 2.3 even though the kernel exposed Built-In 2.4. Studio did not modify that private host configuration. After the host was changed to the Built-In Provider, the Studio-owned boot sequence completed without a new KO load.

No current evidence covers an arbitrary Built-In runtime, Built-In GKI 2.3, NON-GKI kernels, other architectures, LKM 2.4, every host autoload policy, or redirect schemes not reported by a Provider. Those combinations remain visible and fail closed with a concrete reason.
