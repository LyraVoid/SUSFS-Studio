# Android Host Integration

This document records the integration boundary for Android hosts. It separates verified behavior from host-dependent security properties.

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

The current host implementation was inspected at the pinned working tree used for the device check:

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

Inspection of the installed `v3.3.1` APK also found `io`, `FileOutputStream`, `open`, `write`, and `close` entry points. The file API accepts arbitrary paths and remains a general-purpose privileged interface. Studio's token-bound path limits its own calls; it does not restrict other JavaScript in the same WebView.

The device used for the smoke check reported host package version `v3.3.1-50-g64833c00`, version code `32730`, Android 17, WebView `157.0.8103.50`, and kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`. These facts identify the test environment; they do not establish that every host version has the same behavior.

On this device, the development module installed successfully and the executable retained mode `0755` after reboot. The module WebUI opened through that host. A read-only query showed `v2.3.0`, GKI-LKM, model, Android/API, and kernel. Refresh returned the same confirmed status. The LKM was loaded separately before this query. No other host version or provider combination is covered by this observation.

On 2026-11-20, the updated debug module was deployed to the same PKX110 device. A harmless 830-byte Studio fixture was selected through the manager file picker, previewed against an empty device archive, explicitly confirmed, written through `ksu.io()`, and saved with revision `46fd15c02ad4c4c0c958a45f6350d601951348e0788f3aaedc96ec818c23ccd9`. The UI showed the matching receipt. Refreshing returned the saved archive with no differences, and exporting from the device produced a byte-identical file. The native and exported files and the original fixture had the same SHA-256 digest. Provider status before and after the flow remained `v2.3.0`, GKI-LKM, with all four reported capabilities available. The test archive, receipt, staging state, and both downloaded test files were removed after copying the evidence to `.local/`.

This evidence covers one host build and one provider combination. It does not establish behavior for other managers, WebView versions, provider variants, concurrent UI instances, process termination at every transaction point, or hosts without the file API.

### Compatibility evidence matrix

| Environment | Evidence | Status |
| --- | --- | --- |
| PKX110, Android 17 API 37, host `v3.3.1-50-g64833c00` (32730), WebView `157.0.8103.50`, kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`, GKI-LKM provider `v2.3.0` | Host load and archive save/export as described above; read-only status reconfirmed on 2026-11-20. | Verified only for the stated operations; navigation isolation and restore remain unverified. |
| Other host versions and managers | No device evidence. | Unverified. |
| Built-in GKI provider or SUSFS 2.4 | No device evidence. | Unverified. |

The bundled CSP restricts connections and frames; the static browser test confirms frame blocking. The smoke host rejects external and unknown top-level navigation, but that behavior is not evidence for the installed manager. The installed manager's general-purpose root command and file bridges are not constrained by Studio's fixed calls. External-link navigation, unknown local paths, frame bridge exposure, and file selection must be separately tested on each actual host; no general isolation claim follows from the smoke host.

## Decision

When a compatible command bridge is present, the module uses it for fixed queries and Studio archive storage. A malformed or unavailable bridge reports failure instead of simulated status. The standalone browser remains in demo mode when no host interface is present. If command execution exists but the verified file stream does not, device save remains disabled and names the missing capability.

The command and file bridges remain general-purpose privileged host interfaces. Fixed calls and token paths in this module do not restrict what other JavaScript in the WebView can invoke. Embedded frames and external connections are restricted by the bundled page's CSP, but top-level navigation and interface exposure remain host-dependent. Treat every host version as unverified until local load, navigation, handshake, status, malformed output, timeout, file-stream failure, non-root behavior, and archive round trip have been checked.
