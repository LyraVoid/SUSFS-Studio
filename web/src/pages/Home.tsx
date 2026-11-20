import { FlexiblePageHeader } from "../components/molecules/FlexiblePageHeader";
import { ActivationCard } from "../components/organisms/ActivationCard";
import { DeviceFactsGroup } from "../components/organisms/DeviceFactsGroup";
import { ProviderSummary } from "../components/organisms/ProviderSummary";
import type { Translate } from "../i18n/messages";
import type { HostChannel } from "../transport/host";
import type { Status } from "../transport/mock";
import styles from "./Home.module.css";

declare const __STUDIO_VERSION__: string;

export function Home({
  status,
  demo,
  channel,
  stale,
  refresh,
  t,
}: {
  status: Status;
  demo: boolean;
  channel: HostChannel;
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
            channel={channel}
            stale={stale}
            refresh={refresh}
            t={t}
          />
        </div>
        <DeviceFactsGroup
          device={status.device}
          studioVersion={__STUDIO_VERSION__}
          t={t}
        />
      </div>
    </>
  );
}
