import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Message } from "../../i18n/messages";
import {
  type ArchiveBridge,
  ArchiveCommandError,
  type SavedArchive,
} from "../../transport/archiveBridge";
import {
  archiveErrorMessage,
  hasArchiveWriter,
  writeArchive,
} from "./archiveSave";
import { inspectArchive } from "./preview";
import {
  applyRuleEdit,
  emptyArchive,
  type RuleEdit,
  type SettingsEdit,
} from "./ruleEdits";

type Draft = { text: string; edits: (RuleEdit | SettingsEdit)[] };

export function useRuleArchive(
  archive: ArchiveBridge | undefined,
  active: boolean,
) {
  const [saved, setSaved] = useState<SavedArchive>();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState<Message>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [rebaseBlocked, setRebaseBlocked] = useState(false);
  const [verified, setVerified] = useState(false);
  const request = useRef(0);
  const busy = useRef(false);
  const base = saved ? inspectArchive(saved.text ?? emptyArchive) : undefined;
  const current = draft ? inspectArchive(draft.text) : base;

  const writable = hasArchiveWriter(archive);
  const canEdit =
    writable &&
    base?.formatStatus === "valid" &&
    !base.unrepresentable &&
    current?.formatStatus === "valid" &&
    !needsRefresh &&
    !rebaseBlocked &&
    !loading &&
    !saving;
  const edit = (change: RuleEdit | SettingsEdit | RuleEdit[]) => {
    if (!canEdit || !current) return false;
    const edits = Array.isArray(change) ? change : [change];
    let text = current.text;
    for (const entry of edits) {
      const next = applyRuleEdit(text, entry);
      if (next === undefined) return false;
      text = next;
    }
    if (text !== current?.text) {
      setDraft({ text, edits: [...(draft?.edits ?? []), ...edits] });
      setVerified(false);
      setError(undefined);
    }
    return true;
  };

  const refresh = async () => {
    if (!archive || busy.current) return;
    const id = ++request.current;
    setLoading(true);
    setError(undefined);
    setVerified(false);
    try {
      const next = await archive.read();
      if (id !== request.current) return;
      setSaved(next);
      setNeedsRefresh(false);
      let text = next.text ?? emptyArchive;
      if (
        !draft ||
        (text === draft.text &&
          next.kind === "saved" &&
          next.receiptStatus === "available" &&
          next.receipt &&
          next.receipt.revision === next.revision &&
          next.receipt.bytes === new TextEncoder().encode(text).length)
      ) {
        setDraft(undefined);
        setRebaseBlocked(false);
        return;
      }
      if (text === draft.text) {
        setRebaseBlocked(true);
        setError("archiveReceiptMissing");
        return;
      }
      for (const change of draft.edits) {
        const updated = applyRuleEdit(text, change);
        if (updated === undefined) {
          setRebaseBlocked(true);
          setError("ruleRebaseBlocked");
          return;
        }
        text = updated;
      }
      setDraft({ ...draft, text });
      setRebaseBlocked(false);
    } catch (error) {
      if (id !== request.current) return;
      setNeedsRefresh(true);
      setError(archiveErrorMessage(error));
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  const enter = useEffectEvent(() => {
    if (!draft) void refresh();
  });
  useEffect(() => {
    if (active) enter();
  }, [active]);

  const save = async (reviewed: Draft, baseline: SavedArchive) => {
    if (
      !archive ||
      busy.current ||
      !canEdit ||
      reviewed !== draft ||
      baseline !== saved ||
      current?.formatStatus !== "valid"
    )
      return false;
    busy.current = true;
    request.current++;
    setSaving(true);
    setVerified(false);
    setError(undefined);
    let committed = false;
    try {
      const receipt = await writeArchive(archive, baseline, current.bytes);
      committed = true;
      const next = await archive.read();
      if (
        next.kind !== "saved" ||
        next.text !== reviewed.text ||
        next.revision !== receipt.revision ||
        next.receiptStatus !== "available" ||
        next.receipt?.revision !== receipt.revision ||
        next.receipt?.savedAt !== receipt.savedAt ||
        next.receipt.bytes !== receipt.bytes ||
        receipt.bytes !== current.bytes.length
      )
        throw new ArchiveCommandError("RESULT_UNKNOWN");
      setSaved(next);
      setDraft(undefined);
      setVerified(true);
      return true;
    } catch (error) {
      setNeedsRefresh(true);
      setError(committed ? "archiveResultUnknown" : archiveErrorMessage(error));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return {
    saved,
    base,
    current,
    draft,
    error,
    loading,
    saving,
    verified,
    writable,
    canEdit,
    edit,
    refresh,
    save,
    discard: () => {
      setDraft(undefined);
      setRebaseBlocked(false);
      if (!needsRefresh) setError(undefined);
    },
  };
}
