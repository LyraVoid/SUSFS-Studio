import type { Message, Translate } from "../../i18n/messages";
import type { Capability, Status } from "../../transport/mock";
import styles from "./Panels.module.css";

export const capabilityLabels = {
  paths: "paths",
  map: "map",
  kstat: "kstat",
  redirect: "redirect",
  extensions: "extensions",
} satisfies Record<Capability, Message>;

export function Capabilities({
  status,
  demo,
  fields,
  stale,
  t,
}: {
  status: Status;
  demo: boolean;
  fields: Capability[];
  stale?: boolean;
  t: Translate;
}) {
  return (
    <dl className={styles.facts}>
      {fields.map((field) => {
        const value =
          stale || status.kind === "loading"
            ? "loading"
            : status.kind === "active"
              ? (status.provider.capabilities[field] ?? "unknown")
              : "unknown";
        return (
          <div key={field}>
            <dt>{t(capabilityLabels[field])}</dt>
            <dd data-availability={value}>
              {t(
                !demo && (value === "available" || value === "unavailable")
                  ? value === "available"
                    ? "reportedAvailable"
                    : "notReported"
                  : value,
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
