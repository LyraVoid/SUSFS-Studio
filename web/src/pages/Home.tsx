import { ActivationCard } from "../components/organisms/ActivationCard";
import { DeviceFactsGroup } from "../components/organisms/DeviceFactsGroup";
import { ProviderSummary } from "../components/organisms/ProviderSummary";
import type { Translate } from "../i18n/messages";
import type { Status } from "../transport/mock";
import styles from "./Home.module.css";

export function Home({
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
  return (
    <>
      <FlexiblePageHeader
        title={t("app")}
        aside={t(demo ? "demo" : "hostDiagnostics")}
      />
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
    </>
  );
}

import { FlexiblePageHeader } from "../components/molecules/FlexiblePageHeader";
