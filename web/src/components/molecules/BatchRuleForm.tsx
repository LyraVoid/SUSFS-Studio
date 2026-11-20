import { Button, NativeSelect, Stack, Switch, Textarea } from "@mantine/core";
import { useState } from "react";
import { path } from "../../features/config/preview";
import {
  editRule,
  type RuleEdit,
  type RuleGroup,
} from "../../features/config/ruleEdits";
import { redirectSchemeLabels, type Translate } from "../../i18n/messages";
import type { Provider } from "../../transport/mock";
import { DialogActions } from "./M3eDialog";

export function BatchRuleForm({
  group,
  onEdit,
  onClose,
  provider,
  t,
}: {
  group: RuleGroup;
  onEdit: (edits: RuleEdit[]) => boolean;
  onClose: () => void;
  provider?: Provider;
  t: Translate;
}) {
  const [text, setText] = useState("");
  const [looping, setLooping] = useState(false);
  const [uid, setUid] = useState("0");
  const [rejected, setRejected] = useState(false);
  const schemes = provider?.redirectUidSchemes;
  const redirect = group === "redirects";
  const seen = new Set<string>();
  let invalid = 0;
  const rows = text.split(/\r?\n/).flatMap((raw, index) => {
    const line = raw.trim();
    if (!line) return [];
    const parts = redirect ? line.split(/\s+->\s+/) : [line];
    const [source = "", destination = ""] = parts;
    if (
      !path(source) ||
      seen.has(source) ||
      (redirect &&
        (parts.length !== 2 || !path(destination) || destination === source))
    )
      invalid ||= index + 1;
    seen.add(source);
    return [
      { path: source, destination, uidScheme: uid, looping: String(looping) },
    ];
  });
  const valid = rows.length > 0 && rows.length <= 128 && !invalid;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        const edits = rows.map((row) => ({
          group,
          after: editRule(group, undefined, row),
        }));
        if (onEdit(edits)) onClose();
        else setRejected(true);
      }}
    >
      <Stack>
        <Textarea
          data-autofocus
          label={t("ruleBatchInput")}
          description={t(redirect ? "ruleBatchRedirects" : "ruleBatchPaths")}
          minRows={5}
          maxLength={65536}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setRejected(false);
          }}
          error={
            invalid
              ? t("ruleBatchInvalid", { line: invalid })
              : rows.length > 128
                ? t("ruleBatchLimit")
                : undefined
          }
        />
        {group === "paths" && (
          <Switch
            label={t("ruleLooping")}
            checked={looping}
            onChange={(event) => setLooping(event.currentTarget.checked)}
          />
        )}
        {redirect && (
          <>
            <NativeSelect
              label={t("ruleUid")}
              description={t("controlArchiveSchemes")}
              value={uid}
              onChange={(event) => setUid(event.currentTarget.value)}
              data={redirectSchemeLabels.map((label, value) => ({
                value: String(value),
                label: `${value} · ${t(label)}`,
              }))}
            />
            <p>
              {schemes
                ? t("controlReportedSchemes", {
                    values: schemes.join(", ") || t("archiveNoKeys"),
                  })
                : t("controlUnreportedSchemes")}
            </p>
          </>
        )}
        {valid && <p>{t("ruleBatchCount", { count: rows.length })}</p>}
        {rejected && <p role="alert">{t("ruleEditInvalid")}</p>}
        <DialogActions>
          <Button variant="subtle" onClick={onClose}>
            {t("ruleCancel")}
          </Button>
          <Button type="submit" variant="subtle" disabled={!valid}>
            {t("ruleDraftApply")}
          </Button>
        </DialogActions>
      </Stack>
    </form>
  );
}
