import type { Translate } from "../../i18n/messages";
import type { Status } from "../../transport/mock";
import { FactRow } from "../molecules/FactRow";
import styles from "./DeviceFactsGroup.module.css";

export function DeviceFactsGroup({
  device,
  t,
}: {
  device: Status["device"];
  t: Translate;
}) {
  return (
    <section aria-labelledby="device-title">
      <h2 className={styles.title} id="device-title">
        {t("device")}
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
      </div>
    </section>
  );
}
