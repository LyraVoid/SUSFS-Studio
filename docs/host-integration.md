# Android Host Integration

This document records the integration boundary for Android hosts. It separates verified behavior from host-dependent security properties.

## Required WebUI contract

The WebUI supports an injected `window.studioDiagnostics` with two argument-free methods:

- `hello()` returns a JSON string or a promise resolving to one fixed protocol-1 envelope.
- `status()` returns a JSON string or a promise resolving to one fixed protocol-1 status envelope.

The WebUI also adapts a host-provided `ksu.exec` command bridge to these methods. It sends only fixed `hello` and `status` commands for `/data/adb/modules/susfs_studio/bin/studioctl`, using `/system/bin/timeout` with a three-second limit, fixed options, and generated callback identifiers. User input is never sent as a command. The WebUI performs the handshake before the status query and applies a five-second deadline. It validates the request ID, protocol number, success flag, response size, provider fields, and capability values.

## Required host safeguards

Before injecting the diagnostic bridge, a host must demonstrate all of the following:

1. The page is served from a host-controlled HTTPS origin backed only by the installed module's `webroot/`.
2. Top-level navigation is rejected unless the destination is the exact local origin and an allowed entry path. External links are opened outside the WebView.
3. Embedded frames, new windows, content access, and file access are disabled or rejected.
4. The bridge is exposed only after the page origin is checked. The exposed methods accept no command, argument, file path, environment, callback name, or user-provided string.
5. Each method maps to a fixed executable path and fixed argument vector. The process runs off the WebView UI thread, has an execution timeout, caps stdout/stderr, and returns one structured response.
6. The bridge is not exposed to untrusted or navigated frames. This must be enforced by the host; a page CSP alone cannot establish the JavaScript interface's calling origin.

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

The device used for the smoke check reported host package version `v3.3.1-50-g64833c00`, version code `32730`, Android 17, WebView `157.0.8103.50`, and kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`. These facts identify the test environment; they do not establish that every host version has the same behavior.

On this device, the development module installed successfully and the executable retained mode `0755` after reboot. The module WebUI opened through that host. A read-only query showed `v2.3.0`, GKI-LKM, model, Android/API, and kernel. Refresh returned the same confirmed status. The LKM was loaded separately before this query. No other host version or provider combination is covered by this observation.

## Decision

When a compatible command bridge is present, the module uses it for fixed read-only queries. A malformed or unavailable bridge reports failure instead of simulated status. The standalone browser remains in demo mode when no host interface is present.

The command bridge itself remains a general-purpose privileged host interface. Fixed calls in this module do not restrict what other JavaScript in the WebView can invoke. Embedded frames and external connections are restricted by the bundled page's CSP, but top-level navigation and interface exposure remain host-dependent. Treat every host version as unverified until local load, navigation, handshake, status, malformed output, timeout, and non-root behavior have been checked.
