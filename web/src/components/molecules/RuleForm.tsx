import { Button, SimpleGrid, Stack, Switch, TextInput } from "@mantine/core";
import { useState } from "react";
import {
  object,
  path,
  staticFields,
  validStaticField,
} from "../../features/config/preview";
import {
  editRule,
  type Rule,
  type RuleEdit,
  type RuleGroup,
} from "../../features/config/ruleEdits";
import {
  type Message,
  redirectSchemeLabels,
  type Translate,
} from "../../i18n/messages";
import type { Provider } from "../../transport/mock";
import { DialogActions, DialogChoiceGroup } from "./M3eDialog";

export const modeLabels = {
  normal: "ruleNormal",
  fullClone: "ruleClone",
  static: "ruleStatic",
} as const;

export function RuleForm({
  group,
  rule,
  staticMode,
  onEdit,
  onClose,
  readOnly,
  provider,
  t,
}: {
  group: RuleGroup;
  rule?: Rule;
  staticMode?: boolean;
  onEdit: (edit: RuleEdit) => boolean;
  onClose: () => void;
  readOnly: boolean;
  provider?: Provider;
  t: Translate;
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => ({
    path: rule?.path ?? "",
    looping: String(rule?.looping ?? false),
    mode: String(rule?.mode ?? (staticMode ? "static" : "normal")),
    destination: String(rule?.destination ?? ""),
    uidScheme: String(rule?.uidScheme ?? "0"),
    ...Object.fromEntries(
      staticFields.map((key) => [
        key,
        object(rule?.static) ? String(rule.static[key] ?? "") : "",
      ]),
    ),
  }));
  const [error, setError] = useState(false);
  const field = (name: string) => fields[name] ?? "";
  const change = (name: string, value: string) => {
    setFields({ ...fields, [name]: value });
    setError(false);
  };
  const isStatic = group === "kstats" && fields.mode === "static";
  const schemes = provider?.redirectUidSchemes;
  const reportedFields = provider?.staticKstatFields;
  const editableStaticFields =
    reportedFields === undefined
      ? staticFields
      : staticFields.filter((key) => reportedFields.includes(key));
  const redirect = group === "redirects";
  const validDestination =
    path(fields.destination) && fields.destination !== fields.path;
  const valid =
    path(fields.path) &&
    (!redirect || validDestination) &&
    (!isStatic ||
      (editableStaticFields.some((key) => field(key) !== "") &&
        editableStaticFields.every(
          (key) => !field(key) || validStaticField(key, field(key)),
        )));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || readOnly) return;
        const after = editRule(group, rule, fields);
        if (after && onEdit({ group, before: rule, after })) onClose();
        else setError(true);
      }}
    >
      <Stack>
        <TextInput
          data-autofocus
          label={t("rulePath")}
          size="md"
          value={field("path")}
          readOnly={readOnly}
          onChange={(event) => change("path", event.currentTarget.value)}
          error={
            field("path") && !path(fields.path)
              ? t("rulePathInvalid")
              : undefined
          }
        />
        {group === "paths" && (
          <Switch
            label={t("ruleLooping")}
            checked={fields.looping === "true"}
            disabled={readOnly}
            onChange={(event) =>
              change("looping", String(event.currentTarget.checked))
            }
          />
        )}
        {redirect && (
          <>
            <TextInput
              label={t("ruleDestination")}
              size="md"
              value={field("destination")}
              readOnly={readOnly}
              onChange={(event) =>
                change("destination", event.currentTarget.value)
              }
              error={
                field("destination") && !validDestination
                  ? t("rulePathInvalid")
                  : undefined
              }
            />
            <DialogChoiceGroup
              label={t("ruleUid")}
              value={field("uidScheme")}
              disabled={readOnly}
              onChange={(value) => change("uidScheme", value)}
              options={redirectSchemeLabels.map((label, value) => ({
                value: String(value),
                label: `${value} · ${t(label)}`,
              }))}
            />
            <p>{t("controlArchiveSchemes")}</p>
            <p>
              {schemes
                ? t("controlReportedSchemes", {
                    values: schemes.join(", ") || t("archiveNoKeys"),
                  })
                : t("controlUnreportedSchemes")}
            </p>
          </>
        )}
        {group === "kstats" && !isStatic && (
          <Switch
            label={t("ruleClone")}
            checked={field("mode") === "fullClone"}
            disabled={readOnly}
            onChange={(event) =>
              change(
                "mode",
                event.currentTarget.checked ? "fullClone" : "normal",
              )
            }
          />
        )}
        {isStatic && (
          <>
            <p>
              {t("ruleStaticHint")} {t("controlArchiveFields")}
            </p>
            <p>
              {reportedFields
                ? t("controlReportedFields", {
                    values: reportedFields.join(", ") || t("archiveNoKeys"),
                  })
                : t("controlUnreportedFields")}
            </p>
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              {editableStaticFields.map((key) => (
                <TextInput
                  key={key}
                  label={t(key as Message)}
                  size="md"
                  value={field(key)}
                  readOnly={readOnly}
                  onChange={(event) => change(key, event.currentTarget.value)}
                  error={
                    field(key) && !validStaticField(key, field(key))
                      ? t("ruleStaticInvalid")
                      : undefined
                  }
                />
              ))}
            </SimpleGrid>
          </>
        )}
        {error && <p role="alert">{t("ruleEditInvalid")}</p>}
        <DialogActions>
          <Button variant="subtle" onClick={onClose}>
            {t(readOnly ? "close" : "ruleCancel")}
          </Button>
          {!readOnly && (
            <Button type="submit" variant="subtle" disabled={!valid}>
              {t("ruleDraftApply")}
            </Button>
          )}
        </DialogActions>
      </Stack>
    </form>
  );
}
