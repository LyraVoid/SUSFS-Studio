# SUSFS Studio User Guide

Follow the [browser preview instructions](../README.md#browser-preview) to open SUSFS Studio. **Demo data** identifies simulated results. **Host diagnostics** identifies a session using a host bridge. Demo scenarios are available in the standalone browser preview.

## Read the diagnostic overview

1. Open **Home** to see the interface state, model, Android version, kernel version, and reported capabilities.
2. Select **Status** to see the implementation, kernel type, and capability information.
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
3. Review the source file, declared numeric schema, rule count, unknown-field warning, original JSON text, and structural validation result.
4. Compare the selection with the archive already saved on the device. Optionally select a second archive for a separate comparison. The dialog lists added, removed, and changed JSON Pointer paths. Arrays are compared by position and numeric formatting differences count as changes. Both original texts remain unchanged.

Previewing validates file size, encoding, JSON syntax, the complete [Studio version-1 rule structure](archive-format.md), duplicate keys, path boundaries, redirect constraints, and exact static kstat strings. It does not apply rules or prove device compatibility. Unknown fields and exact numeric tokens remain in the original text.

## Save and export a device archive

Open **Rules → Paths**, **Disguise**, or **Redirect** to edit the saved archive without selecting a file. Disguise separates Map and kstat rules. Select a path to view or edit it, or use the add action. **Update draft** and **Remove rule** affect only the session draft. **Cancel** closes the form without applying its changes; **Discard draft** removes all pending edits. The draft follows you between the three rule pages but is not kept across a WebUI reload.

Paths, Map, and Redirect also support batch entry. Enter one absolute path per line, or one `source -> destination` pair per line for redirects. A rejected line, duplicate, or archive limit rejects the whole batch without changing the draft. Choose the looping flag or UID scheme once for the batch where applicable. kstat entries are edited individually.

With a compatible file stream, select **Review and confirm save** and check the differences against the displayed revision. A successful readback and receipt verification shows **Saved, not applied**. If the device archive changed, refresh to review the draft against the newer revision. Studio only replays edits that do not conflict; if an affected entry changed, inspect both JSON texts before discarding or recreating the draft. The rule lists can be viewed without the file stream, but edits and device saves remain disabled. A standalone browser has no device rule archive.

When the host provides both the fixed command bridge and a verified version-1 file stream, **Save to device** is enabled.

1. Select and validate an archive.
2. Review the source, schema, differences from the current device archive, warnings, and expected effect.
3. Select **Review and confirm save**. The confirmation step repeats the source, schema, difference, and side-effect summary.
4. Select **Confirm save**. The result shows the new SHA-256 revision and byte count. The archive is stored only in `/data/adb/susfs-studio/`; it does not apply SUSFS rules or change device runtime state.

The selected file name is never sent to a shell. Native creates the staging file and returns a one-time token-bound path. An invalid, oversized, duplicate-key, or structurally invalid archive is refused.

If another writer changed the device archive after review, the save reports a revision conflict and keeps the browser draft. If the process times out or reports that the result is unknown, refresh the device archive before another attempt. Do not retry directly. A missing receipt after a readable archive is reported separately.

**Export from device** rereads the saved archive and downloads its original JSON text, including unknown fields and exact number tokens. To restore, choose **Restore**, select an automatic device backup or choose a previously exported JSON file, review the difference, and confirm separately. A current archive must exist. Studio preserves it in a private backup before replacing it. The automatic list contains backups from previous restores, not ordinary saves; invalid backups cannot be selected. Older device tools may not support the list, but still allow restoration from an exported file. The restored revision is the digest of the selected bytes and can match an older revision. Restore changes only Studio's private archive, not kernel runtime state.

In standalone browser mode, preview works locally. Device save and export require a host. If a host has command execution but no verified file stream, save remains disabled with the reason shown in Settings. Automatic collection is also disabled.

## Change appearance

Use **Settings → Theme** and **Settings → Language** to choose light or dark mode and English or Simplified Chinese. The browser stores these preferences locally. Changing the demo scenario does not persist across page reloads.
