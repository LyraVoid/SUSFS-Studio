import {
  Button,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
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
import type { Message, Translate } from "../../i18n/messages";

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
  t,
}: {
  group: RuleGroup;
  rule?: Rule;
  staticMode?: boolean;
  onEdit: (edit: RuleEdit) => boolean;
  onClose: () => void;
  readOnly: boolean;
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
  const redirect = group === "redirects";
  const validDestination =
    path(fields.destination) && fields.destination !== fields.path;
  const valid =
    path(fields.path) &&
    (!redirect || validDestination) &&
    (!isStatic ||
      (staticFields.some((key) => field(key) !== "") &&
        staticFields.every(
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
            <NativeSelect
              label={t("ruleUid")}
              size="md"
              value={field("uidScheme")}
              disabled={readOnly}
              onChange={(event) =>
                change("uidScheme", event.currentTarget.value)
              }
              data={["0", "1", "2", "3", "4"].map((value) => ({
                value,
                label: t("ruleUidValue", { value }),
              }))}
            />
          </>
        )}
        {group === "kstats" && (
          <NativeSelect
            label={t("ruleMode")}
            size="md"
            value={field("mode")}
            disabled={readOnly}
            onChange={(event) => change("mode", event.currentTarget.value)}
            data={Object.entries(modeLabels).map(([value, key]) => ({
              value,
              label: t(key),
            }))}
          />
        )}
        {isStatic && (
          <>
            <p>{t("ruleStaticHint")}</p>
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              {staticFields.map((key) => (
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
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t(readOnly ? "close" : "ruleCancel")}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={!valid}>
              {t("ruleDraftApply")}
            </Button>
          )}
        </Group>
      </Stack>
    </form>
  );
}
