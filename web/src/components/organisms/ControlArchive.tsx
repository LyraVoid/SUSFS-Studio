import { Button, Group, NativeSelect, Stack, TextInput } from "@mantine/core";
import { useState } from "react";
import { object, settingsKeys } from "../../features/config/preview";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Message, Translate } from "../../i18n/messages";
import styles from "./Panels.module.css";

type State = ReturnType<typeof useRuleArchive>;

const switchLabels = {
  hideMounts: "controlHideMounts",
  logging: "controlLogging",
  avcSpoof: "controlAvcSpoof",
} satisfies Record<(typeof settingsKeys)[number], Message>;

export function BasicArchive({ state, t }: { state: State; t: Translate }) {
  const archive =
    state.current?.formatStatus === "valid" ? state.current : undefined;
  const value = archive?.value;
  const settings =
    archive?.schema === "2" && object(value?.settings) ? value.settings : {};
  const uname =
    archive?.schema === "2" && object(value?.uname) ? value.uname : {};
  const disabled = !state.canEdit || archive?.schema !== "2";
  const tri = [
    { value: "unset", label: t("controlUnmanaged") },
    { value: "true", label: t("controlOn") },
    { value: "false", label: t("controlOff") },
  ];
  return (
    <section className={styles.panel} aria-label={t("controlBasic")}>
      <p>{t("controlArchiveOnly")}</p>
      {archive?.schema === "1" && <p>{t("controlNeedsUpgrade")}</p>}
      <Stack>
        <NativeSelect
          label={t("controlAutomatic")}
          data={tri}
          disabled={disabled}
          value={value?.automatic == null ? "unset" : String(value.automatic)}
          onChange={(event) => {
            const selected = event.currentTarget.value;
            state.edit({
              section: "root",
              key: "automatic",
              before: value?.automatic,
              after: selected === "unset" ? undefined : selected === "true",
            });
          }}
        />
        {settingsKeys.map((key) => (
          <NativeSelect
            key={key}
            label={t(switchLabels[key])}
            data={tri}
            disabled={disabled}
            value={settings[key] == null ? "unset" : String(settings[key])}
            onChange={(event) => {
              const selected = event.currentTarget.value;
              state.edit({
                section: "settings",
                key,
                before: settings[key],
                after: selected === "unset" ? null : selected === "true",
              });
            }}
          />
        ))}
        <TextInput
          label={t("controlUid")}
          disabled
          description={t("controlNoAppSource")}
          value={
            Array.isArray(settings.priorityUidFilter)
              ? settings.priorityUidFilter.join(", ")
              : ""
          }
        />
        <TextInput
          label={t("controlUnameRelease")}
          disabled
          description={t("controlNoBootFacts")}
          value={typeof uname.release === "string" ? uname.release : ""}
        />
        <TextInput
          label={t("controlUnameVersion")}
          disabled
          description={t("controlNoBootFacts")}
          value={typeof uname.version === "string" ? uname.version : ""}
        />
        <TextInput
          label={t("controlCmdline")}
          disabled
          description={t("controlNoBootFacts")}
          value={
            archive?.schema === "2" && typeof value?.cmdline === "string"
              ? value.cmdline
              : ""
          }
        />
      </Stack>
    </section>
  );
}

export function LkmArchive({ state, t }: { state: State; t: Translate }) {
  const [values, setValues] = useState({
    hiddenModules: "",
    mountPrefixes: "",
  });
  const [invalid, setInvalid] = useState<string>();
  const archive =
    state.current?.formatStatus === "valid" ? state.current : undefined;
  const lkm =
    archive?.schema === "2" && object(archive.value.lkm)
      ? archive.value.lkm
      : {};
  const disabled = !state.canEdit || archive?.schema !== "2";
  return (
    <section className={styles.panel} aria-label={t("extensions")}>
      <p>{t("controlArchiveOnly")}</p>
      {archive?.schema === "1" && <p>{t("controlNeedsUpgrade")}</p>}
      <Stack>
        {(["hiddenModules", "mountPrefixes"] as const).map((key) => {
          const label = t(
            key === "hiddenModules" ? "controlModules" : "controlPrefixes",
          );
          const previous = lkm[key];
          const entries = Array.isArray(previous) ? (previous as string[]) : [];
          return (
            <form
              key={key}
              onSubmit={(event) => {
                event.preventDefault();
                if (disabled) return;
                if (
                  !state.edit({
                    section: "lkm",
                    key,
                    before: previous,
                    after: [...entries, values[key]],
                  })
                ) {
                  setInvalid(key);
                  return;
                }
                setValues({ ...values, [key]: "" });
                setInvalid(undefined);
              }}
            >
              <Stack gap="xs">
                <TextInput
                  label={label}
                  disabled={disabled}
                  value={values[key]}
                  error={invalid === key ? t("controlInvalidEntry") : undefined}
                  onChange={(event) => {
                    setValues({ ...values, [key]: event.currentTarget.value });
                    setInvalid(undefined);
                  }}
                />
                <Button type="submit" disabled={disabled || !values[key]}>
                  {t("controlAddEntry", { label })}
                </Button>
                {entries.map((entry) => (
                  <Group
                    key={entry}
                    justify="space-between"
                    className={styles.change}
                  >
                    <code>{entry}</code>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        state.edit({
                          section: "lkm",
                          key,
                          before: previous,
                          after: entries.filter((item) => item !== entry),
                        })
                      }
                    >
                      {t("controlRemoveEntry", { entry })}
                    </Button>
                  </Group>
                ))}
              </Stack>
            </form>
          );
        })}
      </Stack>
    </section>
  );
}
