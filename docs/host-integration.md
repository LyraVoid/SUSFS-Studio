# Android Host Integration

This document records the current integration boundary for an Android host. It separates verified behavior from requirements that are not yet satisfied. The diagnostic bridge must not be enabled merely because a host exposes a general-purpose root command interface.

## Required WebUI contract

The WebUI accepts only `window.studioDiagnostics` with two argument-free methods:

- `hello()` returns a JSON string or a promise resolving to one fixed protocol-1 envelope.
- `status()` returns a JSON string or a promise resolving to one fixed protocol-1 status envelope.

The WebUI performs the handshake before the status query and applies a five-second deadline. It validates the request ID, protocol number, success flag, response size, provider fields, and capability values. A general-purpose command bridge is not an implementation of this contract.

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
| `WebViewHelper.kt:129-166` | `shouldInterceptRequest` handles assets, but no `shouldOverrideUrlLoading` implementation was found in this WebView client. | Top-level navigation restriction is not evidenced. Do not inject a privileged diagnostic bridge. |
| `WebViewHelper.kt:217-224` | Objects named `ksu` and `ksu_download` are injected. | The existing interface is broader than the diagnostic contract. It must not be reused as a shortcut. |
| `WebViewInterface.kt:53-60` | `exec` accepts a command string. | Passing a fixed command through this method would still rely on a general-purpose root interface. |
| `WebViewInterface.kt:78-103` | The callback form accepts command text, options, and a callback name. | It cannot be used as the fixed, argument-free diagnostic bridge without a host-side wrapper. |
| `WebViewInterface.kt:105-175` | `spawn` accepts a command, JSON arguments, options, and callback name. | It is explicitly outside the WebUI bridge contract. |
| `WebViewInterface.kt:205-224` | `moduleInfo()` exposes host module metadata. | It is not a SUSFS diagnostic response and cannot prove provider status. |

The device used for the smoke check reported host package version `v3.3.1-50-g64833c00`, version code `32730`, Android 17, WebView `157.0.8103.50`, and kernel `6.6.118-android15-8-g9bc34d5b0c79-abogki537459655-4k`. These facts identify the test environment; they do not establish that every host version has the same behavior.

## Decision

The current implementation remains in explicit failure mode when a general host bridge is present without `studioDiagnostics`. The standalone browser remains in demo mode only when no host interface is present. This prevents a host page from silently presenting simulated provider data and prevents arbitrary root command execution.

Integration can proceed after the host supplies a dedicated bridge or after a separately reviewed host change satisfies the safeguards above. The first real-host acceptance run must cover local load, direct unknown-path navigation, external navigation, frame insertion, handshake success, status success, malformed output, timeout, and ordinary non-root access.
