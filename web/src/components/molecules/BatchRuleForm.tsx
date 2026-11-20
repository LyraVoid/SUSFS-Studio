import {
  Button,
  Group,
  NativeSelect,
  Stack,
  Switch,
  Textarea,
} from "@mantine/core";
import { useState } from "react";
import { path } from "../../features/config/preview";
import {
  editRule,
  type RuleEdit,
  type RuleGroup,
} from "../../features/config/ruleEdits";
import type { Translate } from "../../i18n/messages";

export function BatchRuleForm({
  group,
  onEdit,
  onClose,
  t,
}: {
  group: RuleGroup;
  onEdit: (edits: RuleEdit[]) => boolean;
  onClose: () => void;
  t: Translate;
}) {
  const [text, setText] = useState("");
  const [looping, setLooping] = useState(false);
  const [uid, setUid] = useState("0");
  const [rejected, setRejected] = useState(false);
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
          <NativeSelect
            label={t("ruleUid")}
            value={uid}
            onChange={(event) => setUid(event.currentTarget.value)}
            data={["0", "1", "2", "3", "4"].map((value) => ({
              value,
              label: t("ruleUidValue", { value }),
            }))}
          />
        )}
        {valid && <p>{t("ruleBatchCount", { count: rows.length })}</p>}
        {rejected && <p role="alert">{t("ruleEditInvalid")}</p>}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t("ruleCancel")}
          </Button>
          <Button type="submit" disabled={!valid}>
            {t("ruleDraftApply")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
