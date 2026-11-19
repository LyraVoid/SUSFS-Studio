# SUSFS Studio User Guide

Follow the [browser preview instructions](../README.md#browser-preview) to open SUSFS Studio. The **Demo data** label identifies simulated results throughout the interface. These results do not establish compatibility with a device, kernel, or Android host.

## Read the diagnostic overview

1. Open **Home** to see the interface state, model, Android version, and kernel version.
2. Select **Status** to see the implementation, kernel type, and capability information. The preview reports no device receipts.
3. Select **Refresh diagnostics** to repeat the current query. The previous result remains visible while the refresh is pending and is identified as such.

| Home state | Meaning |
| --- | --- |
| Active | The current sample reports a confirmed interface response. The SUSFS version is shown below the label. |
| Reading | A query is pending. The Reading demo scenario intentionally stays in this state. |
| Not detected | The diagnostic result reports no SUSFS interface. |
| Unknown protocol | The response protocol could not be confirmed. |
| Connection failed | The diagnostic result could not be read. |

An active result displays a badge when the implementation is known. **Built-In** means the implementation is compiled into the kernel. **LKM** means it is provided as a loadable kernel module. **GKI** describes the kernel type and appears separately in diagnostic details.

Use **Settings → Demo scenario** to switch between simulated outcomes. The default is GKI-LKM with SUSFS 2.3. The built-in sample uses SUSFS 2.4. Rules and Extensions show capability labels derived from the selected sample. An unconfirmed capability is displayed separately from an unavailable capability.

## Preview a configuration archive

1. Open **Settings → Offline preview**.
2. Select a UTF-8 JSON file up to 128 KiB. The top-level JSON value must be an object.
3. Review the original JSON text in the dialog. Clear the selection or close the dialog to discard the preview.

Previewing validates the file size, encoding, and JSON structure. It does not validate a configuration schema or persist archive contents. Device save, export, and restore controls require host integration. Automatic collection is also disabled in the preview.

## Change appearance

Use **Settings → Theme** and **Settings → Language** to choose light or dark mode and English or Simplified Chinese. The browser stores these preferences locally. Changing the demo scenario does not persist across page reloads.
