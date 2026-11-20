# Android Host Integration

This document records the integration boundary for Android hosts. It separates verified behavior from host-dependent security properties.

Host projects are outside this module's implementation scope. An unverified host remains unverified; Studio's fixed calls and bundled CSP do not turn its general-purpose bridge into an origin-isolated interface. A host without the required bridge degrades to local preview and reports the unavailable capability. No manager modification or replacement is required to use that preview.

## Required WebUI contract

The WebUI supports an injected `window.studioDiagnostics` with two argument-free methods:

- `hello()` returns a JSON string or a promise resolving to one fixed protocol-1 envelope.
- `status()` returns a JSON string or a promise resolving to one fixed protocol-1 status envelope.

The WebUI also adapts a host-provided `ksu.exec` command bridge to these methods. It sends only fixed `hello` and `status` commands for `/data/adb/modules/susfs_studio/bin/studioctl`, using `/system/bin/timeout` with a three-second limit, fixed options, and generated callback identifiers. User input is never sent as a command. The WebUI performs the handshake before the status query and applies a five-second deadline. It validates the request ID, protocol number, success flag, response size, provider fields, and capability values.

Archive save additionally requires host file operations compatible with `ksu.io()` version 1. The WebUI checks that `io().version()` returns `1`, then uses `FileOutputStream().open(path, false)`, `write(id, base64)`, and `close(id)`. It accepts only the path returned by native `stage` and verifies the exact form `/data/adb/susfs-studio/.staging/<32 lowercase hex>.input`. It never writes a selected file name or user-supplied path through this API. A host without the stream keeps device save disabled but may still use local preview and device export.

## Required host safeguards

Before injecting the diagnostic bridge, a host must demonstrate all of the following:

1. The page is served from a host-controlled HTTPS origin backed only by the installed module's `webroot/`.
2. Top-level navigation is rejected unless the destination is the exact local origin and an allowed entry path. External links are opened outside the WebView.
3. Embedded frames, new windows, content access, and file access are disabled or rejected.
4. The bridge is exposed only after the page origin is checked. Diagnostic methods accept no command, argument, file path, environment, callback name, or user-provided string. The archive adapter internally accepts only a token it created during a successful `stage` call.
5. Each method maps to a fixed executable path and fixed argument vector. The process runs off the WebView UI thread, has an execution timeout, caps stdout/stderr, and returns one structured response.
6. The bridge is not exposed to untrusted or navigated frames. This must be enforced by the host; a page CSP alone cannot establish the JavaScript interface's calling origin.
7. A file-stream API is not isolated merely because Studio uses a constrained path. The host must keep it away from untrusted pages and frames, and native must independently verify every staged object.

## Current host evidence

The installed build reports revision `64833c00`. Its published `WebViewHelper.kt`, `SuFilePathHandler.java`, `WebViewInterface.kt`, and `WebUIState.kt` were inspected at that revision. The following describes source evidence, not a navigation probe:

| Location | Observed behavior | Consequence |
| --- | --- | --- |
| `manager/app/src/main/java/me/weishu/kernelsu/ui/webui/WebViewHelper.kt:109-113` | JavaScript and DOM storage are enabled; file access is disabled. | This is useful but does not establish origin isolation. |
| `WebViewHelper.kt:115-127` | A `WebViewAssetLoader` serves the module `webroot` from a host-controlled domain. | The local asset path is a suitable basis for a dedicated bridge, subject to navigation checks. |
| `WebViewHelper.kt:129-166` | `shouldInterceptRequest` handles assets, but no `shouldOverrideUrlLoading` implementation was found in this WebView client. | Top-level navigation restriction is not evidenced. |
| `WebViewHelper.kt:217-224` | Objects named `ksu` and `ksu_download` are injected. | The existing interface is broader than the diagnostic contract. |
| `WebViewInterface.kt:53-60` | `exec` accepts a command string. | Fixed diagnostic calls still rely on a general-purpose root interface. |
| `WebViewInterface.kt:78-103` | The callback form accepts command text, options, and a callback name. | The adapter limits its own command, options, and callback identifiers; the host interface remains general-purpose. |
| `WebViewInterface.kt:105-175` | `spawn` accepts a command, JSON arguments, options, and callback name. | The adapter does not use this method. |
| `WebViewInterface.kt:205-224` | `moduleInfo()` exposes host module metadata. | It is not a SUSFS diagnostic response and cannot prove provider status. |
| `WebViewInterface.kt:284-288` and `ui/webui/file/` | `io()` returns a version-1 file API with stream open, read, write, and close operations. | Studio can transfer raw bytes without shell interpolation, subject to native staging checks and host page isolation. |

The local asset handler returns an empty response for missing or rejected paths. That does not enforce an exact document allowlist or deny navigation to another origin. `allowFileAccess` is explicitly disabled; no explicit `allowContentAccess` policy or new-window handler was found in this revision. File selection is delegated to an Android picker, and the download listener delegates eligible HTTP(S) URLs to an external activity. Disposal destroys the WebView and releases its associated interfaces, file chooser callback, and root shell; it is not a per-navigation origin check.

Android's legacy JavaScript interface is available to all frames, without caller-origin metadata. Checking a top-level URL is not sufficient to isolate a general-purpose bridge. A hardened host needs a separate origin-scoped, main-frame-only bridge for bundled documents, fixed operations, and independent navigation and subresource restrictions. The current source does not satisfy that contract. No debug manager was installed over the existing package.

On 2026-11-20, an isolated, temporary module-owned test page was opened in the installed host on the stated PKX110. A hash route worked, an unknown local path displayed an empty document, and a different bundled document loaded and called the read-only `moduleInfo()` identity method. A same-origin iframe also called that method. An external HTTPS link loaded inside the same WebView rather than being rejected or opened externally. No bridge method was called by the external page, so its actual bridge access was not verified. A popup request did not visibly create a new window, and an input opened the Android file picker. The data-URL download probe did not establish a completed download. These probes used a deliberately unrestricted test page, not Studio's bundled CSP; Studio's own CSP blocks frames, but is not a host-level isolation guarantee. Test files and temporary changes were removed and the module and private store were verified against their pre-test archives.

Inspection of the installed `v3.3.1` APK also found `io`, `FileOutputStream`, `open`, `write`, and `close` entry points. The file API accepts arbitrary paths and remains a general-purpose privileged interface. Studio's token-bound path limits its own calls; it does not restrict other JavaScript in the same WebView.

The device used for the smoke check reported host package version `v3.3.1-50-g64833c00`, version code `32730`, Android 17, WebView `157.0.8103.50`, and kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`. These facts identify the test environment; they do not establish that every host version has the same behavior.

On this device, the development module installed successfully and the executable retained mode `0755` after reboot. The module WebUI opened through that host. A read-only query showed `v2.3.0`, GKI-LKM, model, Android/API, and kernel. Refresh returned the same confirmed status. The LKM was loaded separately before this query. No other host version or provider combination is covered by this observation.

On 2026-11-20, the updated debug module was deployed to the same PKX110 device. A harmless 830-byte Studio fixture was selected through the manager file picker, previewed against an empty device archive, explicitly confirmed, written through `ksu.io()`, and saved with revision `46fd15c02ad4c4c0c958a45f6350d601951348e0788f3aaedc96ec818c23ccd9`. The UI showed the matching receipt. Refreshing returned the saved archive with no differences, and exporting from the device produced a byte-identical file. The native and exported files and the original fixture had the same SHA-256 digest. Provider status before and after the flow remained `v2.3.0`, GKI-LKM, with all four reported capabilities available. The test archive, receipt, staging state, and both downloaded test files were removed after copying the evidence to `.local/`.

This evidence covers one host build and one provider combination. It does not establish behavior for other managers, WebView versions, provider variants, concurrent UI instances, process termination at every transaction point, or hosts without the file API.

The automatic backup list and read commands were also verified on the same Android device with the packaged debug executable, a private mount namespace, and two harmless archives. The listed digest and returned bytes matched the retained archive; the current archive matched the restore receipt. The installed module and its store were not changed by this check. The current backup picker was tested in Chromium with a test bridge, not in the installed manager; the earlier manager round trip used an exported JSON file.

### Compatibility evidence matrix

| Environment | Evidence | Status |
| --- | --- | --- |
| PKX110, Android 17 API 37, host `v3.3.1-50-g64833c00` (32730), WebView `157.0.8103.50`, kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`, GKI-LKM provider `v2.3.0` | Host load, archive save/export and restore; the current rule editor also saved and verified a receipt. | Verified only for the stated operations; host navigation did not block the earlier external-link probe. |
| Same PKX110, host `v1.6.4` (33211) | Four-category rule archive round trip; two WebUI activities with stale-revision recovery; injected receipt-publication failure. | Verified only for the stated operations. The tagged source does not demonstrate origin isolation. |
| Same PKX110, alternate manager build `0f3f42ba` (115404) | The app opens but reports its kernel patch missing and system patch inactive. No module WebUI or bridge check is possible from that inactive state. | Inactive; unverified. |
| Same PKX110, alternate manager build `31.1` (31100) | The app opens and reports its runtime not installed. No module WebUI or bridge check is possible from that inactive state. | Inactive; unverified. |
| Built-in GKI provider, SUSFS 2.3 | Reference source inspected; no running test target in this round. | Unverified. |
| Built-in GKI provider, SUSFS 2.4 | A local arm64 reference build exists; see [rule operation boundary](rule-operation-boundary.md#arm64-source-and-artifact-comparison). The device reported a locked bootloader and green verified boot. The image was not booted or flashed. | Artifact only; unverified. |
| LKM provider, SUSFS 2.4 | No verified matching runtime target. | Unverified. |

Package presence is not evidence that a manager currently owns root, can open the module WebUI, or implements the required bridges. The alternate managers were not substituted for the active host. A built-in provider requires a separate bootable environment or a verified boot and recovery path; it cannot be inferred from the running kernel's GKI release string.

The bundled CSP restricts connections and frames; the static browser test confirms frame blocking. The smoke host rejects external and unknown top-level navigation, but that behavior is not evidence for the installed manager. The installed manager's general-purpose root command and file bridges are not constrained by Studio's fixed calls. External-link navigation, unknown local paths, frame bridge exposure, and file selection must be separately tested on each actual host; no general isolation claim follows from the smoke host.

On 2026-11-20, a debug build was installed on this device after preserving the installed module. Through the actual manager WebUI and file picker, an 830-byte harmless archive was saved, then a different 125-byte archive was selected, reviewed and restored. The UI receipt and private archive matched SHA-256 `4fa35650ce63b62f79bcbe7ed2193c6f4c3188dd45f12768c8b12fbc36288f7f`; the preserved prior archive matched `46fd15c02ad4c4c0c958a45f6350d601951348e0788f3aaedc96ec818c23ccd9`. The provider's read-only status was unchanged. The generated archive, receipt, backup, staging directory, upload files and installer were removed after copying evidence locally. This does not verify interruption, navigation isolation or other hosts.

With temporary debug assets in the same host, the automatic backup selector displayed the real 830-byte backup. The user-visible confirmation showed its source and differences; restoring it produced revision `46fd15c02ad4c4c0c958a45f6350d601951348e0788f3aaedc96ec818c23ccd9`, a matching receipt, and preserved the prior 94-byte archive with revision `d3813c8f4be7c3d650157a2a3ada6580dd369f3f1a4331299fb35723fc93be28`. Two independently opened WebUI activities then reviewed different files against the same baseline. After the first saved, the second reported a newer revision, retained its draft and disabled confirmation; the archive and receipt still matched the first page. This was an interleaved save, not a simultaneous native lock-contention test. The provider status remained unchanged. The pre-test module and private store were restored and matched their archives byte-for-byte.

### Rule page archive acceptance

On 2026-11-20, the PKX110 ran the rule pages in host `v1.6.4` (33211), Android 17 API 37, WebView `157.0.8103.50`, and the GKI-LKM provider `v2.3.0` on kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`. Only the Studio module's WebUI and debug executable were temporarily replaced. The original private store was set aside and a separate copy of the shared archive fixture was used.

The WebUI changed the path looping flag, Map source, static kstat inode string, and redirect UID scheme. Before confirmation the device archive still matched the fixture. After confirmation the readback and receipt both reported 827 bytes and revision `b9a3b9d949516d0fa212bbd0dd8a3f6a9fdb6d0495a71c83ba5b960e112ebc81`. The exact bytes matched the four expected source edits and were identical to the file exported after refresh. The provider status response was unchanged. The original module files and private store were restored; file contents, paths, modes, and ownership were checked against retained inventory, and all on-device test artifacts were removed. Directory timestamps changed during the temporary swaps.

This checks the archive round trip on the stated host, not provider application, host isolation, or other managers.

### Rule page recovery and follow-up compatibility

The debug bundle at `667810e` was used in two independently opened WebUI activities on `v1.6.4` (33211). Both reviewed revision `46fd15c02ad4c4c0c958a45f6350d601951348e0788f3aaedc96ec818c23ccd9`. The Map edit saved and verified its receipt. The stale Paths activity reported a newer revision, retained its draft, and disabled confirmation. The archive and receipt remained unchanged by the rejected save. After refresh, the Paths review showed only its own looping-flag change against the newer Map revision. This was an interleaved save, not native lock contention.

In the isolated test store, a directory at the receipt target prevented receipt publication after archive replacement. The Paths activity reported an unknown result. A native read returned the exact combined archive with revision `f426b146c11f71e5265cd028b31252e390cfa3f14b9839607e6d6e88bfc16096` and no receipt. Refresh left the draft available and save disabled; it did not replay the write. This tests one receipt failure, not power loss or all interruption points.

The installed host `v3.3.1-50-g64833c00` (32730) also opened the same debug bundle, reported the live GKI-LKM status, loaded the archive in Rules, and saved an independent Paths edit after the test obstruction was removed. The WebUI verified its receipt. The other installed managers (`0f3f42ba` and `31.1`) still reported inactive runtimes, so their module WebUIs were not tested. No manager was replaced and the locked, verified-boot device was not flashed or rebooted.

Read-only review of the `v1.6.4` tagged source found a local HTTPS asset loader, disabled file access, and general-purpose JavaScript command and file interfaces. The WebView client did not provide an exact top-level document allowlist or an origin-scoped bridge. External navigation and frame exposure were not probed on that build in this round. A separate UID 2000 CLI invocation completed the handshake but could not query the provider or read the private archive. Provider status before, after, and following cleanup was identical; the Studio module and private store were restored and their paths, file contents, modes, and owners matched the pre-test inventory. Provider writes remain disabled.

## Decision

When a compatible command bridge is present, the module uses it for fixed queries and Studio archive storage. A malformed or unavailable bridge reports failure instead of simulated status. The standalone browser remains in demo mode when no host interface is present. If command execution exists but the verified file stream does not, device save remains disabled and names the missing capability.

The command and file bridges remain general-purpose privileged host interfaces. Fixed calls and token paths in this module do not restrict what other JavaScript in the WebView can invoke. Embedded frames and external connections are restricted by the bundled page's CSP, but top-level navigation and interface exposure remain host-dependent. Treat every host version as unverified until local load, navigation, handshake, status, malformed output, timeout, file-stream failure, non-root behavior, and archive round trip have been checked.
