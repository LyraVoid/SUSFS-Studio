import type { Translate } from "../../i18n/messages";
import type { Status } from "../../transport/mock";
import { FactRow } from "../molecules/FactRow";
import styles from "./DeviceFactsGroup.module.css";

export function DeviceFactsGroup({
  device,
  studioVersion,
  t,
}: {
  device: Status["device"];
  studioVersion: string;
  t: Translate;
}) {
  return (
    <section aria-labelledby="device-title">
      <h2 className={styles.title} id="device-title">
        {t("information")}
      </h2>
      <div className={styles.rows}>
        {(["model", "system", "kernel"] as const).map((field) => (
          <FactRow
            key={field}
            icon={field}
            label={t(field)}
            detail={device?.[field] ?? t("absent")}
            interactive
          />
        ))}
        <FactRow
          icon="tag"
          label={t("studioVersion")}
          detail={studioVersion}
          interactive
        />
      </div>
    </section>
  );
}
