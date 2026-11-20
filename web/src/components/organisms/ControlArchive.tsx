import {
  Button,
  Checkbox,
  Stack,
  Tabs,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import {
  type Json,
  object,
  settingsKeys,
  validText,
} from "../../features/config/preview";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Message, Translate } from "../../i18n/messages";
import { demoApps, demoSlots } from "../../transport/demoArchive";
import type { Provider } from "../../transport/mock";
import {
  DialogActions,
  DialogChoiceGroup,
  M3eDialog,
} from "../molecules/M3eDialog";
import { SegmentedSection } from "../molecules/SegmentedSection";
import { SettingsRow } from "../molecules/SettingsList";
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

export function BasicArchive({
  state,
  workflow,
  provider,
  t,
}: {
  state: State;
  workflow: boolean;
  provider?: Provider;
  t: Translate;
}) {
  const [dialog, setDialog] = useState<
    (typeof settingsKeys)[number] | "apps" | "stopUid" | "uname" | "cmdline"
  >();
  const [query, setQuery] = useState("");
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [sourceTab, setSourceTab] = useState<string | null>("manual");
  const [releaseInput, setReleaseInput] = useState("");
  const [versionInput, setVersionInput] = useState("");
  const [cmdlineInput, setCmdlineInput] = useState("");
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
  const editUname = () => {
    setReleaseInput(typeof uname?.release === "string" ? uname.release : "");
    setVersionInput(typeof uname?.version === "string" ? uname.version : "");
    setDialog("uname");
  };
  const updateBootDraft = (field: "uname" | "cmdline", after: Json) =>
    state.edit({ section: "root", key: field, before: value?.[field], after });
  const close = () => {
    setDialog(undefined);
    setQuery("");
    setSourceTab("manual");
  };
  const disabled = !state.canEdit || !value;
  const key =
    dialog && dialog in switchLabels
      ? (dialog as keyof typeof switchLabels)
      : undefined;
  const title = key
    ? switchLabels[key]
    : dialog === "stopUid"
      ? "controlStopManaging"
      : dialog === "apps"
        ? "controlAppList"
        : dialog === "uname"
          ? "controlUname"
          : "controlCmdline";
  const filtered = (
    workflow ? [...new Set([...demoApps, ...(names ?? [])])] : names
  )?.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  const validUname = validText(releaseInput, 65) && validText(versionInput, 65);
  const validCmdline =
    cmdlineInput === "" || validText(cmdlineInput, 8192, true);
  return (
    <section className={styles.category} aria-label={t("controlBasic")}>
      <p className={styles.notice}>{t("controlArchiveOnly")}</p>
      {archive?.schema === "1" && (
        <p className={styles.notice}>{t("controlNeedsUpgrade")}</p>
      )}
      <SegmentedSection title={t("controlBasic")}>
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
      </SegmentedSection>
      <SegmentedSection title={t("controlUidSection")}>
        <SettingsRow
          title={t("controlProtectedApps")}
          detail={[
            !workflow &&
              (provider?.capabilities.priorityUidFilter === "unavailable"
                ? t("controlUidUnavailable")
                : provider?.capabilities.priorityUidFilter !== "available"
                  ? t("controlUidUnknown")
                  : t("controlNoAppSource")),
            names
              ? names.length
                ? t("controlUidCount", { count: names.length })
                : t("controlUidEmpty")
              : t("controlUnmanaged"),
          ]
            .filter(Boolean)
            .join("\n")}
          action={() => {
            setSelectedApps(names ?? []);
            setDialog("apps");
          }}
        />
        {names && (
          <SettingsRow
            title={t("controlStopManaging")}
            detail={t("controlUidStopDraftHint")}
            action={() => setDialog("stopUid")}
            disabled={disabled}
          />
        )}
        <SettingsRow title={t("controlUidHint")} />
      </SegmentedSection>
      <SegmentedSection title={t("controlUname")}>
        <SettingsRow
          title={t("controlUname")}
          detail={
            uname ? `${uname.release}\n${uname.version}` : t("controlUnmanaged")
          }
          action={editUname}
        />
        <SettingsRow
          title={t("controlResetUname")}
          detail={t("controlResetUnameHint")}
          action={() =>
            updateBootDraft("uname", {
              ...uname,
              release: "default",
              version: "default",
            })
          }
          disabled={disabled}
        />
      </SegmentedSection>
      <SegmentedSection title={t("controlCmdline")}>
        <SettingsRow
          title={t("controlCmdline")}
          detail={
            cmdline === undefined
              ? t("controlUnmanaged")
              : cmdline || t("controlCmdlineReset")
          }
          action={() => {
            setCmdlineInput(cmdline ?? "");
            setDialog("cmdline");
          }}
        />
        <SettingsRow
          title={t("controlResetCmdline")}
          detail={t("controlResetCmdlineHint")}
          action={() => updateBootDraft("cmdline", "")}
          disabled={disabled}
        />
      </SegmentedSection>
      <M3eDialog opened={dialog !== undefined} onClose={close} title={t(title)}>
        <Stack>
          {key ? (
            <DialogChoiceGroup
              value={triValue(settings[key])}
              disabled={disabled}
              options={Object.entries(tri).map(([value, label]) => ({
                value,
                label: t(label),
              }))}
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
            />
          ) : dialog === "stopUid" ? (
            <p>{t("controlUidStopDraftHint")}</p>
          ) : dialog === "apps" ? (
            <>
              <TextInput
                data-autofocus
                label={t("controlSearchApps")}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
              <p>{t(workflow ? "workflowNotice" : "controlNoAppSource")}</p>
              {filtered?.map((name) => (
                <Checkbox
                  key={name}
                  label={name}
                  checked={selectedApps.includes(name)}
                  disabled={!workflow || disabled}
                  onChange={(event) =>
                    setSelectedApps(
                      event.currentTarget.checked
                        ? [...selectedApps, name]
                        : selectedApps.filter((item) => item !== name),
                    )
                  }
                />
              ))}
              {names?.length === 0 && <p>{t("controlUidEmpty")}</p>}
              {(workflow || Boolean(names?.length)) && !filtered?.length && (
                <p>{t("controlUidNoMatches")}</p>
              )}
            </>
          ) : (
            <>
              <p>{t("controlBootArbitration")}</p>
              <Tabs value={sourceTab} onChange={setSourceTab}>
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
                          readOnly={disabled}
                          value={releaseInput}
                          onChange={(event) =>
                            setReleaseInput(event.currentTarget.value)
                          }
                        />
                        <TextInput
                          label={t("controlUnameVersion")}
                          readOnly={disabled}
                          value={versionInput}
                          onChange={(event) =>
                            setVersionInput(event.currentTarget.value)
                          }
                        />
                      </>
                    ) : (
                      <Textarea
                        label={t("controlCmdline")}
                        readOnly={disabled}
                        value={cmdlineInput}
                        onChange={(event) =>
                          setCmdlineInput(event.currentTarget.value)
                        }
                        minRows={4}
                      />
                    )}
                    {!disabled &&
                      !(dialog === "uname" ? validUname : validCmdline) && (
                        <output>
                          {t(
                            dialog === "uname"
                              ? "controlUnameInputHint"
                              : "controlCmdlineInputHint",
                          )}
                        </output>
                      )}
                  </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="source" pt="sm">
                  {workflow ? (
                    demoSlots.map((slot) => (
                      <div key={slot.label}>
                        <SettingsRow
                          title={t("workflowSlot", { slot: slot.label })}
                          detail={
                            dialog === "uname" ? slot.release : slot.cmdline
                          }
                          disabled={disabled}
                          action={() => {
                            if (dialog === "uname") {
                              setReleaseInput(slot.release);
                              setVersionInput(slot.version);
                            } else setCmdlineInput(slot.cmdline);
                            setSourceTab("manual");
                          }}
                        />
                        {dialog === "cmdline" && (
                          <SettingsRow
                            title={t("workflowBootconfig", {
                              slot: slot.label,
                            })}
                            detail={slot.bootconfig}
                            disabled={disabled}
                            action={() => {
                              setCmdlineInput(slot.bootconfig);
                              setSourceTab("manual");
                            }}
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    <p>{t("controlNoBootFacts")}</p>
                  )}
                </Tabs.Panel>
              </Tabs>
            </>
          )}
          <DialogActions>
            <Button variant="subtle" onClick={close}>
              {t("close")}
            </Button>
            {(dialog === "uname" ||
              dialog === "cmdline" ||
              dialog === "stopUid" ||
              (workflow && dialog === "apps")) && (
              <Button
                variant="subtle"
                disabled={
                  disabled ||
                  (dialog === "uname"
                    ? !validUname
                    : dialog === "cmdline"
                      ? !validCmdline
                      : dialog === "stopUid" && !names)
                }
                onClick={() => {
                  const changed =
                    dialog === "stopUid"
                      ? state.edit({
                          section: "settings",
                          key: "priorityUidFilter",
                          before: names,
                        })
                      : dialog === "apps"
                        ? state.edit({
                            section: "settings",
                            key: "priorityUidFilter",
                            before: names,
                            after: [...selectedApps].sort(),
                          })
                        : updateBootDraft(
                            dialog,
                            dialog === "uname"
                              ? {
                                  ...uname,
                                  release: releaseInput,
                                  version: versionInput,
                                }
                              : cmdlineInput,
                          );
                  if (changed) close();
                }}
              >
                {t(
                  dialog === "stopUid"
                    ? "controlStopManaging"
                    : "controlUpdateDraft",
                )}
              </Button>
            )}
          </DialogActions>
        </Stack>
      </M3eDialog>
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
    <section className={styles.category} aria-label={t("extensions")}>
      <p className={styles.notice}>{t("controlArchiveOnly")}</p>
      {!lkm && <p className={styles.notice}>{t("controlNeedsLkm")}</p>}
      {archive?.schema === "1" && (
        <p className={styles.notice}>{t("controlNeedsUpgrade")}</p>
      )}
      {Object.entries(extensionGroups).map(([key, { title, hint }]) => {
        const groupKey = key as keyof typeof extensionGroups;
        const entries = Array.isArray(settings[key])
          ? (settings[key] as string[])
          : [];
        return (
          <SegmentedSection key={key} title={t(title)}>
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
                endAction={
                  !disabled && (
                    <Button
                      variant="subtle"
                      color="danger"
                      aria-label={t("ruleRemoveNamed", { path: entry })}
                      onClick={() => {
                        setInvalid(false);
                        setDialog({
                          key: groupKey,
                          entries,
                          before: settings[key],
                          index,
                          removing: true,
                        });
                      }}
                    >
                      {t("ruleRemoveEntry")}
                    </Button>
                  )
                }
              />
            ))}
            {entries.length === 0 &&
              archive?.schema === "2" &&
              !state.loading &&
              !state.error && (
                <SettingsRow icon="status" title={t("controlNoEntries")} />
              )}
          </SegmentedSection>
        );
      })}
      <M3eDialog
        opened={Boolean(dialog)}
        onClose={close}
        title={
          entry
            ? t(dialog?.removing ? "controlRemoveEntry" : "controlEditEntry", {
                entry,
              })
            : group
              ? t(group.title)
              : undefined
        }
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
              <DialogActions>
                <Button variant="subtle" onClick={close}>
                  {t("ruleCancel")}
                </Button>
                {entry && !dialog.removing && (
                  <Button
                    variant="subtle"
                    color="danger"
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
                  variant="subtle"
                  disabled={disabled || (!dialog.removing && !value)}
                >
                  {t(dialog.removing ? "ruleDelete" : "ruleDraftApply")}
                </Button>
              </DialogActions>
            </Stack>
          </form>
        )}
      </M3eDialog>
    </section>
  );
}
