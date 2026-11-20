import { Button, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { Translate } from "../../i18n/messages";
import { capabilityKeys, type Status } from "../../transport/mock";
import { FactRow } from "../molecules/FactRow";
import { DialogActions, M3eDialog } from "../molecules/M3eDialog";
import { SettingsList } from "../molecules/SettingsList";
import { Capabilities } from "./Capabilities";
import styles from "./Panels.module.css";

export function ProviderSummary({
  status,
  demo,
  bridgeUnavailable,
  stale,
  refresh,
  t,
}: {
  status: Status;
  demo: boolean;
  bridgeUnavailable: boolean;
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
        detail={t(
          bridgeUnavailable
            ? "bridgeUnavailable"
            : stale
              ? "refreshing"
              : `${status.kind}Detail`,
        )}
        onClick={open}
      />
      <M3eDialog opened={opened} onClose={close} title={t("diagnostic")}>
        <Stack>
          <p>
            {t(demo ? "demo" : "hostDiagnostics")} ·{" "}
            {t(
              bridgeUnavailable
                ? "bridgeUnavailable"
                : stale
                  ? "refreshing"
                  : `${status.kind}Detail`,
            )}
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
          </dl>
          <h2>{t("compatibility")}</h2>
          <p className={styles.muted}>
            {t(demo ? "fixtureOnly" : "hostCapabilities")}
          </p>
          <SettingsList label={t("compatibility")}>
            <Capabilities
              status={status}
              demo={demo}
              stale={stale}
              fields={capabilityKeys}
              t={t}
            />
          </SettingsList>
          <DialogActions>
            <Button variant="subtle" onClick={refresh}>
              {t("refresh")}
            </Button>
          </DialogActions>
        </Stack>
      </M3eDialog>
    </>
  );
}
