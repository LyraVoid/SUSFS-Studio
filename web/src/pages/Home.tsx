import { ActivationCard } from "../components/organisms/ActivationCard";
import { DeviceFactsGroup } from "../components/organisms/DeviceFactsGroup";
import { ProviderSummary } from "../components/organisms/ProviderSummary";
import type { Translate } from "../i18n/messages";
import type { Status } from "../transport/mock";
import styles from "./Home.module.css";

export function Home({
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
  return (
    <>
      <header className={styles.header}>
        <h1>{t("app")}</h1>
        <span>{t("demo")}</span>
      </header>
      <div className={styles.dashboard}>
        <div className={styles.overview}>
          <ActivationCard status={status} t={t} />
          <ProviderSummary
            status={status}
            stale={stale}
            refresh={refresh}
            t={t}
          />
        </div>
        <DeviceFactsGroup device={status.device} t={t} />
      </div>
    </>
  );
}
