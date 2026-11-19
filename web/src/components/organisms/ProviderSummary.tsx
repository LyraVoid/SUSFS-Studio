import { Button, Modal, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { Translate } from "../../i18n/messages";
import type { Status } from "../../transport/mock";
import { FactRow } from "../molecules/FactRow";
import { Capabilities } from "./Capabilities";
import styles from "./Panels.module.css";

export function ProviderSummary({
  status,
  stale,
  refresh,
  t,
}: {
  status: Status;
  stale: boolean;
  refresh: () => void;
  t: Translate;
}) {
  const [opened, { open, close }] = useDisclosure();
  const provider = status.kind === "active" ? status.provider : undefined;
  return (
    <>
      <FactRow
        icon="status"
        label={t("status")}
        detail={t(stale ? "refreshing" : `${status.kind}Detail`)}
        onClick={open}
      />
      <Modal
        opened={opened}
        onClose={close}
        title={t("diagnostic")}
        closeButtonProps={{ "aria-label": t("close") }}
      >
        <Stack>
          <p>
            {t("demo")} · {t(stale ? "refreshing" : `${status.kind}Detail`)}
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>{t("family")}</dt>
              <dd>{t(provider?.kernelType === "GKI" ? "gki" : "unknown")}</dd>
            </div>
            <div>
              <dt>{t("mode")}</dt>
              <dd>
                {t(
                  provider?.implementation === "lkm"
                    ? "lkmDetail"
                    : provider?.implementation === "builtin"
                      ? "builtinDetail"
                      : "unknown",
                )}
              </dd>
            </div>
            <div>
              <dt>{t("version")}</dt>
              <dd>{provider?.version ?? t("absent")}</dd>
            </div>
            <div>
              <dt>{t("owner")}</dt>
              <dd>{t("observedUnknown")}</dd>
            </div>
            <div>
              <dt>{t("receipts")}</dt>
              <dd>{t("noReceipts")}</dd>
            </div>
          </dl>
          <h2>{t("compatibility")}</h2>
          <p className={styles.muted}>{t("fixtureOnly")}</p>
          <Capabilities
            status={status}
            fields={["paths", "map", "kstat", "redirect", "extensions"]}
            t={t}
          />
          <Button variant="default" size="md" onClick={refresh}>
            {t("refresh")}
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
