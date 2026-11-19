import { FileInput, Modal, Stack } from "@mantine/core";
import { useRef, useState } from "react";
import { previewArchive } from "../../features/config/preview";
import type { Translate } from "../../i18n/messages";
import { Icon } from "../atoms/Icon";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
import styles from "./Panels.module.css";

export function ArchivePanel({ t }: { t: Translate }) {
  const [opened, setOpened] = useState(false);
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof previewArchive>>>();
  const request = useRef(0);
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
          setResult(undefined);
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
              setResult(undefined);
              if (!file) return;
              const preview = await previewArchive(file);
              if (id === request.current) setResult(preview);
            }}
          />
          {result?.error && <p role="alert">{t(result.error)}</p>}
          {result?.text !== undefined && (
            <pre className={styles.preview}>{result.text}</pre>
          )}
        </Stack>
      </Modal>
    </>
  );
}
