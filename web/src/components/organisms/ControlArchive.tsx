import { Button, Loader, Stack, Textarea, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import {
  type Json,
  object,
  settingsKeys,
  validText,
} from "../../features/config/preview";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Message, Translate } from "../../i18n/messages";
import type { PackageEntry } from "../../transport/archiveBridge";
import { demoApps, demoSlots } from "../../transport/demoArchive";
import type { Provider } from "../../transport/mock";
import { AppIcon } from "../atoms/AppIcon";
import { Icon } from "../atoms/Icon";
import {
  DialogActions,
  DialogChoiceGroup,
  DialogTabs,
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
const isUserApp = (entry: PackageEntry) => {
  const appId = entry.uid % 100000;
  return appId >= 10000 && appId <= 19999;
};
const appOrder = (left: PackageEntry, right: PackageEntry) =>
  (left.label ?? left.name).localeCompare(
    right.label ?? right.name,
    undefined,
    {
      sensitivity: "base",
    },
  );

function AppSearch({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  t: Translate;
}) {
  return (
    <search className={styles.appSearch}>
      <Icon name="search" />
      <input
        type="search"
        aria-label={t("controlSearchApps")}
        placeholder={t("controlSearchApps")}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value && (
        <button
          type="button"
          aria-label={t("controlClearSearch")}
          onClick={() => onChange("")}
        >
          <Icon name="close" />
        </button>
      )}
    </search>
  );
}

function AppChoice({
  entry,
  checked,
  disabled,
  missing,
  onChange,
  t,
}: {
  entry: PackageEntry;
  checked: boolean;
  disabled: boolean;
  missing?: boolean;
  onChange: (checked: boolean) => void;
  t: Translate;
}) {
  return (
    <label
      className={styles.appChoice}
      data-selected={checked}
      data-missing={missing}
    >
      <AppIcon name={entry.name} label={entry.label} icon={entry.icon} />
      <span className={styles.appCopy}>
        <span className={styles.appLabel}>{entry.label ?? entry.name}</span>
        <span className={styles.appMeta}>
          {entry.name}
          {!missing && ` · UID ${entry.uid}`}
        </span>
        {missing && (
          <span className={styles.appWarning}>{t("controlAppMissing")}</span>
        )}
      </span>
      <span className={styles.appCheck} aria-hidden="true">
        {checked && <Icon name="check" />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={entry.name}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function BootSlotSource({
  dialog,
  disabled,
  facts,
  onSelect,
  t,
}: {
  dialog: "uname" | "cmdline";
  disabled: boolean;
  facts: Provider["bootFacts"];
  onSelect: (value: Json) => void;
  t: Translate;
}) {
  if (!facts) return <p>{t("controlNoBootFacts")}</p>;
  return (
    <>
      <p>{t("controlBootSourceHint")}</p>
      {facts.slots.map((slot) => {
        const slotName = slot.id.toUpperCase();
        const title = t(
          slot.current ? "controlBootCurrent" : "controlBootInactive",
          {
            slot: slotName,
          },
        );
        const missingReason =
          slot.status === "empty-image"
            ? t("controlBootEmptyImage")
            : slot.status === "invalid-image"
              ? t("controlBootInvalidImage")
              : t("controlBootNoValues");
        if (dialog === "uname") {
          if (!slot.release || !slot.version) {
            return (
              <SettingsRow
                key={slot.id}
                title={title}
                detail={missingReason}
                dataAvailability="unavailable"
              />
            );
          }
          const release = slot.release.value;
          const version = slot.version.value;
          const confidence = t(
            slot.release.confidence === "current-runtime"
              ? "controlCurrentRuntime"
              : "controlBootImage",
          );
          return (
            <SettingsRow
              key={slot.id}
              title={title}
              detail={`${release}\n${version}\n${t("controlBootUseHint")}\n${slot.release.source} · ${confidence}`}
              disabled={disabled}
              action={() => onSelect({ release, version })}
            />
          );
        }
        const values = [
          ...slot.cmdline.map((value) => ({ value, kind: "cmdline" as const })),
          ...slot.bootconfig.map((value) => ({
            value,
            kind: "bootconfig" as const,
          })),
        ];
        if (values.length === 0) {
          return (
            <SettingsRow
              key={slot.id}
              title={title}
              detail={missingReason}
              dataAvailability="unavailable"
            />
          );
        }
        return [
          <SettingsRow
            key={`${slot.id}:heading`}
            title={title}
            detail={t("controlBootUseHint")}
          />,
          ...values.map(({ value, kind }, index) => (
            <SettingsRow
              key={`${slot.id}:${kind}:${index}`}
              title={t(
                kind === "cmdline"
                  ? "controlUseCmdlineSource"
                  : "controlUseBootconfigSource",
              )}
              detail={`${value.value}\n${value.source} · ${t(
                value.confidence === "current-runtime"
                  ? "controlCurrentRuntime"
                  : "controlBootImage",
              )}`}
              disabled={disabled}
              action={() => onSelect(value.value)}
            />
          )),
        ];
      })}
    </>
  );
}

export function BasicArchive({
  state,
  workflow,
  provider,
  appsSource,
  t,
}: {
  state: State;
  workflow: boolean;
  provider?: Provider;
  appsSource?: () => Promise<PackageEntry[]>;
  t: Translate;
}) {
  const [dialog, setDialog] = useState<
    (typeof settingsKeys)[number] | "apps" | "stopUid" | "uname" | "cmdline"
  >();
  const [query, setQuery] = useState("");
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [availableApps, setAvailableApps] = useState<PackageEntry[]>();
  const [appsError, setAppsError] = useState(false);
  const [sourceTab, setSourceTab] = useState<"manual" | "source">("manual");
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
        ? "controlProtectedApps"
        : dialog === "uname"
          ? "controlUname"
          : "controlCmdline";
  const appSource = workflow ? demoApps : availableApps;
  const installedNames = new Set(appSource?.map((entry) => entry.name));
  const needle = query.trim().toLocaleLowerCase();
  const matches = (entry: PackageEntry) =>
    !needle ||
    (entry.label ?? "").toLocaleLowerCase().includes(needle) ||
    entry.name.toLocaleLowerCase().includes(needle);
  const visibleApps = appSource?.filter(matches).sort(appOrder);
  const missingApps: PackageEntry[] =
    appSource && !workflow
      ? (names ?? [])
          .filter((name) => !installedNames.has(name))
          .map((name) => ({ name, uid: 0 }))
          .filter(matches)
          .sort(appOrder)
      : appSource
        ? []
        : (names ?? []).map((name) => ({ name, uid: 0 })).filter(matches);
  useEffect(() => {
    if (
      workflow ||
      provider?.capabilities.priorityUidFilter !== "available" ||
      availableApps !== undefined ||
      !appsSource
    )
      return;
    let current = true;
    setAppsError(false);
    void appsSource().then(
      (packages) => {
        if (current)
          setAvailableApps(packages.filter(isUserApp).sort(appOrder));
      },
      () => {
        if (current) setAppsError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [
    appsSource,
    availableApps,
    provider?.capabilities.priorityUidFilter,
    workflow,
  ]);
  const appSourceDetail = workflow
    ? t("workflowNotice")
    : provider?.capabilities.priorityUidFilter === "unavailable"
      ? t("controlUidUnavailable")
      : provider?.capabilities.priorityUidFilter !== "available"
        ? t("controlUidUnknown")
        : appsError
          ? t("controlNoAppSource")
          : availableApps
            ? t("controlAppsReported", { count: availableApps.length })
            : t("controlAppsLoading");
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
            appSourceDetail,
            names
              ? names.length
                ? t("controlUidCount", { count: names.length })
                : t("controlUidEmpty")
              : t("controlUnmanaged"),
          ]
            .filter(Boolean)
            .join("\n")}
          disabled={
            !workflow &&
            provider?.capabilities.priorityUidFilter !== "available"
          }
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
              <AppSearch value={query} onChange={setQuery} t={t} />
              <div className={styles.appPickerIntro}>
                <strong>
                  {t("controlSelectedApps", { count: selectedApps.length })}
                </strong>
                <span>{t("controlAppSharedUid")}</span>
                <span>
                  {t(
                    workflow
                      ? "workflowNotice"
                      : availableApps
                        ? "controlTrustedApps"
                        : appsError
                          ? "controlNoAppSource"
                          : "controlAppsLoading",
                  )}
                </span>
              </div>
              {appsError && (
                <p role="alert" className={styles.appError}>
                  {t("controlAppLoadError")}
                </p>
              )}
              <fieldset
                className={styles.appList}
                aria-label={t("controlProtectedApps")}
                aria-busy={!workflow && !availableApps && !appsError}
              >
                {!workflow && !availableApps && !appsError ? (
                  <output className={styles.appState}>
                    <Loader size="small" />
                    <span>{t("controlAppsLoading")}</span>
                  </output>
                ) : visibleApps?.length || missingApps.length ? (
                  <>
                    {missingApps.map((entry) => (
                      <AppChoice
                        key={`missing:${entry.name}`}
                        entry={entry}
                        checked={selectedApps.includes(entry.name)}
                        disabled={disabled || (!workflow && !availableApps)}
                        missing
                        onChange={(checked) =>
                          setSelectedApps(
                            checked
                              ? [...selectedApps, entry.name]
                              : selectedApps.filter(
                                  (item) => item !== entry.name,
                                ),
                          )
                        }
                        t={t}
                      />
                    ))}
                    {visibleApps?.map((entry) => (
                      <AppChoice
                        key={entry.name}
                        entry={entry}
                        checked={selectedApps.includes(entry.name)}
                        disabled={disabled || (!workflow && !availableApps)}
                        onChange={(checked) =>
                          setSelectedApps(
                            checked
                              ? [...selectedApps, entry.name]
                              : selectedApps.filter(
                                  (item) => item !== entry.name,
                                ),
                          )
                        }
                        t={t}
                      />
                    ))}
                  </>
                ) : (
                  <div className={styles.appState}>
                    <strong>{t("controlUidNoMatches")}</strong>
                    <span>{t("controlUidNoMatchesHint")}</span>
                  </div>
                )}
              </fieldset>
            </>
          ) : (
            <>
              <p>
                {t(
                  workflow || !provider?.bootFacts
                    ? "controlBootArbitration"
                    : "controlBootFactsReady",
                )}
              </p>
              <DialogTabs
                value={sourceTab}
                onChange={(value) =>
                  setSourceTab(value === "source" ? "source" : "manual")
                }
                tabs={[
                  { value: "manual", label: t("controlManual") },
                  { value: "source", label: t("controlBootSlots") },
                ]}
              />
              {sourceTab === "manual" ? (
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
              ) : workflow ? (
                demoSlots.map((slot) => (
                  <div key={slot.label}>
                    <SettingsRow
                      title={t("workflowSlot", { slot: slot.label })}
                      detail={dialog === "uname" ? slot.release : slot.cmdline}
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
                <BootSlotSource
                  dialog={dialog === "uname" ? "uname" : "cmdline"}
                  disabled={disabled}
                  facts={provider?.bootFacts}
                  t={t}
                  onSelect={(value) => {
                    if (dialog === "uname" && object(value)) {
                      setReleaseInput(String(value.release ?? ""));
                      setVersionInput(String(value.version ?? ""));
                    } else if (typeof value === "string") {
                      setCmdlineInput(value);
                    }
                    setSourceTab("manual");
                  }}
                />
              )}
            </>
          )}
          <DialogActions>
            <Button variant="subtle" onClick={close}>
              {t("close")}
            </Button>
            {(dialog === "apps" ||
              dialog === "uname" ||
              dialog === "cmdline" ||
              dialog === "stopUid") && (
              <Button
                variant="subtle"
                disabled={
                  disabled ||
                  (dialog === "apps" &&
                    !workflow &&
                    (!availableApps || appsError)) ||
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
  if (!lkm) {
    return (
      <section className={styles.category} aria-label={t("extensions")}>
        <SegmentedSection title={t("extensions")}>
          <SettingsRow
            icon="notice"
            title={t("controlExtensionsUnavailable")}
            detail={t("controlNeedsLkm")}
            dataAvailability="unavailable"
          />
        </SegmentedSection>
      </section>
    );
  }
  return (
    <section className={styles.category} aria-label={t("extensions")}>
      <p className={styles.notice}>{t("controlArchiveOnly")}</p>
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
