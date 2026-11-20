import { Button } from "@mantine/core";
import { ActivationCard } from "../components/organisms/ActivationCard";
import { Capabilities } from "../components/organisms/Capabilities";
import { DeviceFactsGroup } from "../components/organisms/DeviceFactsGroup";
import { ProviderSummary } from "../components/organisms/ProviderSummary";
import type { inspectArchive } from "../features/config/preview";
import type { Translate } from "../i18n/messages";
import type { Status } from "../transport/mock";
import styles from "./Home.module.css";

export function Home({
  status,
  demo,
  bridgeUnavailable,
  stale,
  refresh,
  archive,
  t,
}: {
  status: Status;
  demo: boolean;
  bridgeUnavailable: boolean;
  stale: boolean;
  refresh: () => void;
  archive?: ReturnType<typeof inspectArchive>;
  t: Translate;
}) {
  return (
    <>
      <header className={styles.header}>
        <h1>{t("app")}</h1>
        <span>{t(demo ? "demo" : "hostDiagnostics")}</span>
      </header>
      <div className={styles.dashboard}>
        <div className={styles.overview}>
          <ActivationCard status={status} t={t} />
          <ProviderSummary
            status={status}
            demo={demo}
            bridgeUnavailable={bridgeUnavailable}
            stale={stale}
            refresh={refresh}
            t={t}
          />
        </div>
        <DeviceFactsGroup device={status.device} t={t} />
      </div>
      <section className={styles.capabilities}>
        <h2>{t("compatibility")}</h2>
        <Capabilities
          status={status}
          demo={demo}
          stale={stale}
          fields={["paths", "map", "kstat", "redirect", "extensions"]}
          t={t}
        />
        <p>{t(demo ? "fixtureOnly" : "hostCapabilities")}</p>
      </section>
      <section
        className={styles.capabilities}
        aria-label={t("controlOverview")}
      >
        <h2>{t("controlOverview")}</h2>
        <p>{t("controlOwnerUnknown")}</p>
        <p>{t("controlApplyBlocked")}</p>
        <Button variant="outline" disabled aria-describedby="provider-blocked">
          {t("controlApply")}
        </Button>
        <p id="provider-blocked">{t("controlNotVerified")}</p>
        <p>
          {t("controlAutomatic")}:{" "}
          {t(
            archive?.formatStatus === "valid" &&
              archive.schema === "2" &&
              typeof archive.value.automatic === "boolean"
              ? archive.value.automatic
                ? "controlOn"
                : "controlOff"
              : "controlUnmanaged",
          )}
        </p>
        <p>{t("controlNoReceipt")}</p>
      </section>
    </>
  );
}
