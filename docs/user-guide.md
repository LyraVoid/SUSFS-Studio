# SUSFS Studio User Guide

Follow the [browser preview instructions](../README.md#browser-preview) to open SUSFS Studio. **Demo data** identifies simulated results. **Host diagnostics** identifies a session using a host bridge. Demo scenarios are available in the standalone browser preview.

## Read the diagnostic overview

1. Open **Home** to see the interface activation state, diagnostic summary, and device facts.
2. Select **Status** to see the implementation, kernel type, and capability information.
3. Select **Refresh diagnostics** to repeat the current query. The previous result remains visible while the refresh is pending and is identified as such.

Open **Rules** for the complete SUSFS surface. Its six tabs are **Overview**, **Basic settings**, **Path hiding**, **File disguise**, **Redirect**, and **Extensions**. The global **Refresh** action rereads diagnostics and the private archive.

| Home state | Meaning |
| --- | --- |
| Active | The current diagnostic result reports a confirmed interface response. The SUSFS version is shown below the label. |
| Reading | A query is pending. The Reading demo scenario intentionally stays in this state. |
| Not detected | The diagnostic result reports no SUSFS interface. |
| Unknown protocol | The response protocol could not be confirmed. |
| Connection failed | The diagnostic result could not be read. |

If a detected host provides neither a dedicated diagnostic bridge nor a compatible command API, the status card explains that the host diagnostic interface is unavailable. The page does not substitute demo data in that case.

An active result displays a badge when the implementation is known. **Built-In** means the implementation is compiled into the kernel. **LKM** means it is provided as a loadable kernel module. **GKI** describes the kernel type and appears separately in diagnostic details.

Use **Settings → Demo scenario** to switch between simulated outcomes. The default is GKI-LKM with SUSFS 2.3. The built-in sample uses SUSFS 2.4. Rules shows capability labels derived from the selected sample. An unconfirmed capability is displayed separately from an unavailable capability.

**Full workflow (simulation)** adds a separate in-memory archive, fictional applications and boot slots, and simulated application reports. Review and save the sample draft before choosing an application outcome. Simulated acceptance and simulated effect verification are separate actions. Reloading clears the case. It does not read from or write to the device and is not available in a host session.

The **Rules → Overview** capability list includes priority UID filtering, hide-mounts, logging, AVC spoofing, uname, cmdline, paths, Map, dynamic and static kstat, full clone, redirect, hidden modules, and mount prefixes. `Support not reported` means the current interface did not report that field; it is not evidence of support. Static field names and redirect UID schemes are shown only when the provider reports them. Archive fields remain a separate editable set and are not device support evidence.

## Preview a configuration archive

1. Open **Rules → Overview → Offline preview**.
2. Select a UTF-8 JSON file up to 128 KiB. The top-level JSON value must be an object.
3. Review the source file, declared numeric schema, rule count, unknown-field warning, original JSON text, and structural validation result.
4. Compare the selection with the archive already saved on the device. Optionally select a second archive for a separate comparison. The dialog lists added, removed, and changed JSON Pointer paths. Arrays are compared by position and numeric formatting differences count as changes. Both original texts remain unchanged.

Previewing validates file size, encoding, JSON syntax, [Studio schema 1 or 2](archive-format.md), duplicate keys, path boundaries, redirect constraints, and exact static kstat strings. It does not apply rules or prove device compatibility. Unknown fields and exact numeric tokens remain in the original text.

In archive preview, **Preview upgrade to Schema 2** prepares a candidate from a compatible saved version-1 archive. Review the difference before confirming the save. **SUSFS configuration exchange** converts supported configurations independently of the current provider. Review the original, mapped archive, and device diff before confirming an import. Configuration export refuses values that cannot be represented in the exchange format.

## Save and export a device archive

Open **Rules → Path hiding**, **File disguise**, or **Redirect** to edit the saved archive without selecting a file. File disguise separates Map and kstat rules. Select a path to view or edit it, or use the add action. **Update draft** and **Remove rule** affect only the session draft. **Cancel** closes the form without applying its changes; return to **Overview** to review, discard, or save the draft. The draft follows you between rule and extension tabs but is not kept across a WebUI reload. Redirect choices describe archive values; the provider's reported UID schemes appear separately.

**Rules → Basic settings** edits the Schema 2 tri-state settings and manual uname and command-line values. A reset records its intent in the draft, not on the running device. Boot-slot presets require verified device facts. Priority UID distinguishes an empty managed list from an unmanaged value and can remove the filter from the draft after confirmation, but cannot select apps without a verified application source. **Rules → Extensions** edits module names and mount prefixes only with a confirmed live LKM result. **Rules → Overview** holds the archived automatic-apply preference and keeps archive save, device application and effect verification separate; application is disabled without verified write authorization.

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

In standalone browser mode, preview works locally. Device save and export require a host. If a host has command execution but no verified file stream, save remains disabled with the reason shown in Rules → Overview. Automatic collection is also disabled.

## Change appearance

In **Settings → Material 3 colors**, choose light or dark mode, one of seven seed colors, the 2021 or 2025 color specification, one of nine palette styles, and standard, medium, or high contrast. Scroll the seed color row horizontally if needed. A seed sets the starting color; the palette style determines how Material derives the rest. Changes take effect immediately across Home, Rules, Settings, and dialogs. The specification row shows the year in use without changing the saved preference. **Restore default colors** resets only the color preferences to dark, Slate, 2025 Tonal Spot, and standard contrast. The WebUI does not read wallpaper or host theme colors.

Use **Settings → Language** to choose English or Simplified Chinese. Color and language preferences are stored locally in the browser, not in device archives. The demo scenario does not persist across page reloads.
