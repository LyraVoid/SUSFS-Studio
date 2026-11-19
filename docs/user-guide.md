# SUSFS Studio User Guide

Follow the [browser preview instructions](../README.md#browser-preview) to open SUSFS Studio. **Demo data** identifies simulated results. **Host diagnostics** identifies a session using a host bridge. Demo scenarios are available in the standalone browser preview.

## Read the diagnostic overview

1. Open **Home** to see the interface state, model, Android version, and kernel version.
2. Select **Status** to see the implementation, kernel type, and capability information. The preview reports no device receipts.
3. Select **Refresh diagnostics** to repeat the current query. The previous result remains visible while the refresh is pending and is identified as such.

| Home state | Meaning |
| --- | --- |
| Active | The current diagnostic result reports a confirmed interface response. The SUSFS version is shown below the label. |
| Reading | A query is pending. The Reading demo scenario intentionally stays in this state. |
| Not detected | The diagnostic result reports no SUSFS interface. |
| Unknown protocol | The response protocol could not be confirmed. |
| Connection failed | The diagnostic result could not be read. |

If a detected host provides neither a dedicated diagnostic bridge nor a compatible command API, the status card explains that the host diagnostic interface is unavailable. The page does not substitute demo data in that case.

An active result displays a badge when the implementation is known. **Built-In** means the implementation is compiled into the kernel. **LKM** means it is provided as a loadable kernel module. **GKI** describes the kernel type and appears separately in diagnostic details.

Use **Settings → Demo scenario** to switch between simulated outcomes. The default is GKI-LKM with SUSFS 2.3. The built-in sample uses SUSFS 2.4. Rules and Extensions show capability labels derived from the selected sample. An unconfirmed capability is displayed separately from an unavailable capability.

## Preview a configuration archive

1. Open **Settings → Offline preview**.
2. Select a UTF-8 JSON file up to 128 KiB. The top-level JSON value must be an object.
3. Review the original JSON text, declared numeric schema, and structural validation result. Structural validation does not confirm device compatibility.
4. Optionally select a second archive. The dialog lists added, removed, and changed JSON Pointer paths. Arrays are compared by position and numeric formatting differences count as changes. Both original texts remain unchanged. Clear the selection or close the dialog to discard the preview.

Previewing validates file size, encoding, JSON syntax, and the [Studio version-1 envelope and selected fields](archive-format.md). It does not validate whether rules are complete or applicable, normalize data, or persist archive contents. Unknown fields and exact numeric tokens remain in the original text. Device save, export, and restore controls require host integration. Automatic collection is also disabled in the preview.

## Change appearance

Use **Settings → Theme** and **Settings → Language** to choose light or dark mode and English or Simplified Chinese. The browser stores these preferences locally. Changing the demo scenario does not persist across page reloads.
