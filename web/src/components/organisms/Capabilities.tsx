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
  fields,
  t,
}: {
  status: Status;
  fields: Capability[];
  t: Translate;
}) {
  return (
    <dl className={styles.facts}>
      {fields.map((field) => {
        const value =
          status.kind === "active"
            ? (status.provider.capabilities[field] ?? "unknown")
            : "unknown";
        return (
          <div key={field}>
            <dt>{t(capabilityLabels[field])}</dt>
            <dd data-availability={value}>{t(value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
