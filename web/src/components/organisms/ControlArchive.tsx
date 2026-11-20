import {
  Button,
  Checkbox,
  Group,
  Modal,
  NativeSelect,
  Radio,
  Stack,
  Tabs,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { type Json, object, settingsKeys } from "../../features/config/preview";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Message, Translate } from "../../i18n/messages";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
import styles from "./Panels.module.css";

type State = ReturnType<typeof useRuleArchive>;

const switchLabels = {
  hideMounts: "controlHideMounts",
  logging: "controlLogging",
  avcSpoof: "controlAvcSpoof",
} satisfies Record<(typeof settingsKeys)[number], Message>;
const tri = {
  unset: "controlUnmanaged",
  true: "controlOn",
  false: "controlOff",
} as const;
const triValue = (value: unknown) =>
  value === true ? "true" : value === false ? "false" : "unset";
const modalStyles = { content: styles.dialog, header: styles.dialogHeader };

export function BasicArchive({ state, t }: { state: State; t: Translate }) {
  const [dialog, setDialog] = useState<
    (typeof settingsKeys)[number] | "apps" | "uname" | "cmdline"
  >();
  const [query, setQuery] = useState("");
  const archive =
    state.current?.formatStatus === "valid" ? state.current : undefined;
  const value = archive?.schema === "2" ? archive.value : undefined;
  const settings = object(value?.settings) ? value.settings : {};
  const uname = object(value?.uname) ? value.uname : undefined;
  const cmdline =
    typeof value?.cmdline === "string" ? value.cmdline : undefined;
  const names = Array.isArray(settings.priorityUidFilter)
    ? (settings.priorityUidFilter as string[])
    : undefined;
  const close = () => {
    setDialog(undefined);
    setQuery("");
  };
  const disabled = !state.canEdit || !value;
  const key =
    dialog && dialog in switchLabels
      ? (dialog as keyof typeof switchLabels)
      : undefined;
  const title = key
    ? switchLabels[key]
    : dialog === "apps"
      ? "controlAppList"
      : dialog === "uname"
        ? "controlUname"
        : "controlCmdline";
  const filtered = names?.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className={styles.panel} aria-label={t("controlBasic")}>
      <p>{t("controlArchiveOnly")}</p>
      {archive?.schema === "1" && <p>{t("controlNeedsUpgrade")}</p>}
      <SettingsList label={t("controlBasic")}>
        {settingsKeys.map((key) => (
          <SettingsRow
            key={key}
            title={t(switchLabels[key])}
            detail={t("controlTriHint")}
            trailing={<span>{t(tri[triValue(settings[key])])}</span>}
            disabled={disabled}
            action={() => setDialog(key)}
          />
        ))}
      </SettingsList>
      <SettingsList label={t("controlUid")}>
        <SettingsRow
          title={t("controlUid")}
          detail={
            names
              ? names.length
                ? t("controlUidCount", { count: names.length })
                : t("controlUidEmpty")
              : t("controlUnmanaged")
          }
          action={() => setDialog("apps")}
        />
        {names && (
          <SettingsRow
            title={t("controlStopManaging")}
            detail={t("controlNoAppSource")}
            disabled
          />
        )}
        <SettingsRow title={t("controlUidHint")} />
      </SettingsList>
      <SettingsList label={t("controlUname")}>
        <SettingsRow
          title={t("controlUname")}
          detail={
            uname ? `${uname.release}\n${uname.version}` : t("controlUnmanaged")
          }
          action={() => setDialog("uname")}
        />
        <SettingsRow
          title={t("controlRestoreSystem")}
          detail={t("controlResetBlocked")}
          disabled
        />
      </SettingsList>
      <SettingsList label={t("controlCmdline")}>
        <SettingsRow
          title={t("controlCmdline")}
          detail={
            cmdline === undefined
              ? t("controlUnmanaged")
              : cmdline || t("controlCmdlineReset")
          }
          action={() => setDialog("cmdline")}
        />
        <SettingsRow
          title={t("controlRestoreSystem")}
          detail={t("controlResetBlocked")}
          disabled
        />
      </SettingsList>
      <NativeSelect
        label={t("controlAutomatic")}
        size="md"
        disabled={disabled}
        data={Object.entries(tri).map(([value, label]) => ({
          value,
          label: t(label),
        }))}
        value={triValue(value?.automatic)}
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
      <Modal
        opened={dialog !== undefined}
        onClose={close}
        title={t(title)}
        classNames={modalStyles}
        closeButtonProps={{ "aria-label": t("close") }}
      >
        <Stack>
          {key ? (
            <Radio.Group
              label={t(switchLabels[key])}
              value={triValue(settings[key])}
              onChange={(selected) => {
                if (
                  !disabled &&
                  state.edit({
                    section: "settings",
                    key,
                    before: settings[key],
                    after: selected === "unset" ? null : selected === "true",
                  })
                )
                  close();
              }}
            >
              <Stack gap="xs" mt="xs">
                {Object.entries(tri).map(([value, label]) => (
                  <Radio
                    key={value}
                    value={value}
                    label={t(label)}
                    disabled={disabled}
                  />
                ))}
              </Stack>
            </Radio.Group>
          ) : dialog === "apps" ? (
            <>
              <TextInput
                data-autofocus
                label={t("controlSearchApps")}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
              <p>{t("controlNoAppSource")}</p>
              {filtered?.map((name) => (
                <Checkbox key={name} label={name} checked disabled />
              ))}
              {names?.length === 0 && <p>{t("controlUidEmpty")}</p>}
              {Boolean(names?.length) && !filtered?.length && (
                <p>{t("controlUidNoMatches")}</p>
              )}
            </>
          ) : (
            <>
              <p>{t("controlBootArbitration")}</p>
              <Tabs defaultValue="manual">
                <Tabs.List>
                  <Tabs.Tab value="manual">{t("controlManual")}</Tabs.Tab>
                  <Tabs.Tab value="source">{t("controlBootSlots")}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="manual" pt="sm">
                  <Stack>
                    {dialog === "uname" ? (
                      <>
                        <TextInput
                          label={t("controlUnameRelease")}
                          readOnly
                          value={
                            typeof uname?.release === "string"
                              ? uname.release
                              : ""
                          }
                        />
                        <TextInput
                          label={t("controlUnameVersion")}
                          readOnly
                          value={
                            typeof uname?.version === "string"
                              ? uname.version
                              : ""
                          }
                        />
                      </>
                    ) : (
                      <Textarea
                        label={t("controlCmdline")}
                        readOnly
                        value={cmdline ?? ""}
                        minRows={4}
                      />
                    )}
                  </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="source" pt="sm">
                  <p>{t("controlNoBootFacts")}</p>
                </Tabs.Panel>
              </Tabs>
            </>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t("close")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  );
}

const extensionGroups = {
  hiddenModules: { title: "controlModules", hint: "controlModuleHint" },
  mountPrefixes: { title: "controlPrefixes", hint: "controlPrefixHint" },
} as const;

export function LkmArchive({
  state,
  lkm,
  t,
}: {
  state: State;
  lkm: boolean;
  t: Translate;
}) {
  const [dialog, setDialog] = useState<{
    key: keyof typeof extensionGroups;
    entries: string[];
    before: Json | undefined;
    index?: number;
    removing?: boolean;
  }>();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const archive =
    state.current?.formatStatus === "valid" ? state.current : undefined;
  const settings =
    archive?.schema === "2" && object(archive.value.lkm)
      ? archive.value.lkm
      : {};
  const disabled = !lkm || !state.canEdit || archive?.schema !== "2";
  const close = () => setDialog(undefined);
  const open = (
    key: keyof typeof extensionGroups,
    entries: string[],
    index?: number,
  ) => {
    setValue(index === undefined ? "" : (entries[index] ?? ""));
    setInvalid(false);
    setDialog({ key, entries, before: settings[key], index });
  };
  const commit = () => {
    if (!dialog || disabled) return;
    const { key, index, entries, removing, before } = dialog;
    const after =
      index === undefined
        ? [...entries, value]
        : removing
          ? entries.filter((_, i) => i !== index)
          : entries.map((item, i) => (i === index ? value : item));
    if (state.edit({ section: "lkm", key, before, after })) close();
    else setInvalid(true);
  };
  const group = dialog ? extensionGroups[dialog.key] : undefined;
  const entry =
    dialog?.index === undefined ? undefined : dialog.entries[dialog.index];
  return (
    <section className={styles.panel} aria-label={t("extensions")}>
      <p>{t("controlArchiveOnly")}</p>
      {!lkm && <p>{t("controlNeedsLkm")}</p>}
      {archive?.schema === "1" && <p>{t("controlNeedsUpgrade")}</p>}
      {Object.entries(extensionGroups).map(([key, { title, hint }]) => {
        const groupKey = key as keyof typeof extensionGroups;
        const entries = Array.isArray(settings[key])
          ? (settings[key] as string[])
          : [];
        return (
          <SettingsList key={key} label={t(title)}>
            <SettingsRow
              icon="add"
              title={t("controlAddEntry", { label: t(title) })}
              detail={t(hint)}
              disabled={disabled}
              action={() => open(groupKey, entries)}
            />
            {entries.map((entry, index) => (
              <SettingsRow
                key={entry}
                icon="extensions"
                title={entry}
                detail={t(title)}
                disabled={disabled}
                action={() => open(groupKey, entries, index)}
              />
            ))}
            {entries.length === 0 &&
              archive?.schema === "2" &&
              !state.loading &&
              !state.error && (
                <SettingsRow icon="status" title={t("controlNoEntries")} />
              )}
          </SettingsList>
        );
      })}
      <Modal
        opened={Boolean(dialog)}
        onClose={close}
        classNames={modalStyles}
        title={
          entry
            ? t(dialog?.removing ? "controlRemoveEntry" : "controlEditEntry", {
                entry,
              })
            : group
              ? t(group.title)
              : undefined
        }
        closeButtonProps={{ "aria-label": t("close") }}
      >
        {dialog && group && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commit();
            }}
          >
            <Stack>
              {dialog.removing ? (
                <p>{t("ruleDeleteNote", { path: entry ?? "" })}</p>
              ) : (
                <TextInput
                  data-autofocus
                  label={t(group.title)}
                  description={t(group.hint)}
                  value={value}
                  readOnly={disabled}
                  error={invalid ? t("controlInvalidEntry") : undefined}
                  onChange={(e) => {
                    setValue(e.currentTarget.value);
                    setInvalid(false);
                  }}
                />
              )}
              {dialog.removing && invalid && (
                <p role="alert">{t("ruleWaitForRefresh")}</p>
              )}
              <Group justify="flex-end">
                <Button variant="subtle" onClick={close}>
                  {t("ruleCancel")}
                </Button>
                {entry && !dialog.removing && (
                  <Button
                    variant="outline"
                    color="red"
                    disabled={disabled}
                    onClick={() => {
                      setInvalid(false);
                      setDialog({ ...dialog, removing: true });
                    }}
                  >
                    {t("ruleDelete")}
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={disabled || (!dialog.removing && !value)}
                >
                  {t(dialog.removing ? "ruleDelete" : "ruleDraftApply")}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </section>
  );
}
