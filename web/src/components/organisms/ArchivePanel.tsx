import { FileInput, Modal, Stack } from "@mantine/core";
import { useRef, useState } from "react";
import { compareArchives, previewArchive } from "../../features/config/preview";
import type { Translate } from "../../i18n/messages";
import { Icon } from "../atoms/Icon";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
import styles from "./Panels.module.css";

export function ArchivePanel({ t }: { t: Translate }) {
  const [opened, setOpened] = useState(false);
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof previewArchive>>>();
  const request = useRef(0);
  const compareRequest = useRef(0);
  const [comparison, setComparison] =
    useState<Awaited<ReturnType<typeof previewArchive>>>();
  return (
    <>
      <SettingsList label={t("archive")}>
        <SettingsRow
          icon="archive"
          title={t("preview")}
          detail={t("archiveNote")}
          action={() => setOpened(true)}
          trailing={<Icon name="chevron" />}
        />
        {(["save", "export", "restore"] as const).map((action) => (
          <SettingsRow
            key={action}
            icon={action}
            title={t(action)}
            detail={t("archivePending")}
            disabled
          />
        ))}
      </SettingsList>
      <Modal
        opened={opened}
        onClose={() => {
          request.current++;
          compareRequest.current++;
          setResult(undefined);
          setComparison(undefined);
          setOpened(false);
        }}
        title={t("preview")}
        classNames={{ content: styles.dialog, header: styles.dialogHeader }}
        closeButtonProps={{ "aria-label": t("close") }}
      >
        <Stack>
          <p>{t("previewPending")}</p>
          <FileInput
            size="md"
            classNames={{ input: styles.file }}
            label={t("archiveFile")}
            accept=".json,application/json"
            clearable
            clearButtonProps={{ "aria-label": t("clearFile") }}
            onChange={async (file) => {
              const id = ++request.current;
              compareRequest.current++;
              setComparison(undefined);
              setResult(undefined);
              if (!file) return;
              const preview = await previewArchive(file);
              if (id === request.current) setResult(preview);
            }}
          />
          {result?.error && <p role="alert">{t(result.error)}</p>}
          {result?.text !== undefined && (
            <>
              <p>
                <strong>{t("archiveSchema")}:</strong>{" "}
                {result.schema ?? t("archiveSchemaUnknown")}
              </p>
              <p className={styles.muted}>
                {t(
                  result.formatStatus === "valid"
                    ? "archiveFormatValid"
                    : result.formatStatus === "invalid"
                      ? "archiveFormatInvalid"
                      : "archiveSchemaNote",
                )}
              </p>
              {result.ambiguous && <p role="alert">{t("archiveAmbiguous")}</p>}
              {result.ruleCount !== undefined && (
                <p>{t("archiveRuleCount", { count: result.ruleCount })}</p>
              )}
              <FileInput
                size="md"
                classNames={{ input: styles.file }}
                label={t("archiveCompare")}
                accept=".json,application/json"
                clearable
                clearButtonProps={{ "aria-label": t("clearFile") }}
                onChange={async (file) => {
                  const id = ++compareRequest.current;
                  setComparison(undefined);
                  if (!file) return;
                  const preview = await previewArchive(file);
                  if (id === compareRequest.current) setComparison(preview);
                }}
              />
              {comparison?.error && <p role="alert">{t(comparison.error)}</p>}
              {comparison?.text !== undefined && (
                <>
                  <p className={styles.muted}>{t("archiveCompareNote")}</p>
                  {comparison.ambiguous && (
                    <p role="alert">{t("archiveAmbiguous")}</p>
                  )}
                  {(() => {
                    const diff = compareArchives(
                      result.value,
                      comparison.value,
                    );
                    return (
                      <>
                        {diff.changes.length === 0 && !diff.truncated && (
                          <p>{t("archiveNoChanges")}</p>
                        )}
                        {diff.changes.map((change) => (
                          <p key={`${change.kind}:${change.path}`}>
                            <strong>
                              {t(
                                change.kind === "added"
                                  ? "archiveAdded"
                                  : change.kind === "removed"
                                    ? "archiveRemoved"
                                    : "archiveChanged",
                              )}
                              :
                            </strong>{" "}
                            <code>{change.path || "/"}</code>
                          </p>
                        ))}
                        {diff.truncated && (
                          <output>{t("archiveDiffTruncated")}</output>
                        )}
                      </>
                    );
                  })()}
                  <p>
                    <strong>
                      {t("archiveCandidate")} · {t("archiveSchema")}:
                    </strong>{" "}
                    {comparison.schema ?? t("archiveSchemaUnknown")}
                  </p>
                  <pre className={styles.preview}>{comparison.text}</pre>
                </>
              )}
              <p>
                <strong>{t("archiveBaseline")}</strong>
              </p>
              <pre className={styles.preview}>{result.text}</pre>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
