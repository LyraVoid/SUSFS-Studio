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
| Built-In | GKI 2.3.0 / 2.4.0 | Reference source and local arm64 artifacts were inspected; no Built-In runtime was booted in this pass. | Detection and archive editing work; provider operations remain blocked for lack of runtime evidence. |
| Built-In | NON-GKI or unknown | No audited runtime target. | Blocked. |
| Any | Unknown version, implementation, or protocol | The interface may remain visible for diagnostics. | No write eligibility. |

Runtime capability detection reads the Provider version, features, variant, readable proc extensions, static-kstat field list, and redirect UID scheme report. A `CONFIG_*` token alone does not authorize a subfeature when the corresponding proc extension or exact ABI is absent. LKM module hiding and mount-prefix operations additionally require a live LKM identity and the exact extension nodes.

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
| Priority UID filter | Unmanaged, explicit empty list, add/remove | LKM is blocked as `ABI_NOT_AUDITED`. A Built-In app/UID source is exposed only for an audited Built-In Provider, which was not available. | No device effect is claimed for LKM. |
| uname | Unmanaged, manual values, real-value reset | Live for the audited LKM ABI. Manual spoof and reboot restoration were tested. | `uname(2)` probe and post-reboot real-value check. |
| cmdline / bootconfig | Unmanaged, manual value, explicit reset intent | The tested LKM writes `/proc/bootconfig`, not `/proc/cmdline`. Empty reset returns an unsupported boundary and becomes `pending_reboot`. | Proc probe before/after and post-reboot real bootconfig check. |
| LKM hidden modules | Add/remove/apply | Live list mutation with name and count validation. | Module visibility plus Provider state observed independently. Removal restores the list. |
| LKM mount prefixes | Add/remove/apply | Live absolute-path list mutation with count validation. | Mountinfo plus Provider state in the target context. Bind-mount test resource was removed after verification. |
| Automatic application | Studio-owned pre-mount, late-pre-mount, post-mount, late-load | `automatic=true` enables the module scripts. Studio loads the audited host GKI-LKM KO only when the archive enables automatic work and the Provider is missing. `automatic=false` exits before loading a KO. | Reboot test showed both kstat phases, post-mount redirect, `effectStatus=verified`, and later a disabled boot with no Provider load. |

## Reboot and recovery rules

A late UI session cannot recreate a missed mount snapshot. Dynamic kstat writes made after the pre-mount stage are reported as `pending_reboot`. A Provider that rejects an online reset is not treated as a successful deletion. If an inverse ABI is unavailable, Studio marks the state `pending_reboot` and waits rather than claiming online rollback.

The operation journal is written before and after each Provider call. Accepted items are not replayed. `retry-plan` can retry only known failed items. `recover-plan` re-reads Provider identity, boot ID, archive revision, item identity, the write-ahead record, and effect evidence before returning `applied` or `recovery_required`. A missing or ambiguous result remains `unknown` until that inspection completes.

Plans bind the Provider boot ID and archive revisions. A new boot or a changed Provider identity invalidates the plan's execution eligibility. The store keeps every current-boot plan even when the pre-Android clock makes early boot files appear older than later files.

## Ownership and host boundaries

Studio does not invoke FinaSU's `ksud susfs` controller or sidex15's `ksu_susfs`. It does not change a host ownership switch, write another controller's files, or treat a host's general-purpose bridge as origin isolation. The KernelSU file stream is used only with the opaque staging path returned by Studio, and every user value remains structured payload or validated data, never shell text.

No current evidence covers an arbitrary Built-In 2.4 runtime, NON-GKI kernels, other architectures, or every redirect UID scheme. Those combinations remain visible but disabled with a concrete reason.
