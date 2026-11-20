import type { Translate } from "../../i18n/messages";
import type { Status } from "../../transport/mock";
import { Icon } from "../atoms/Icon";
import styles from "./ActivationCard.module.css";

export function ActivationCard({
  status,
  t,
}: {
  status: Status;
  t: Translate;
}) {
  const provider = status.kind === "active" ? status.provider : undefined;
  const mode = provider?.implementation;
  return (
    <output className={styles.card} data-state={status.kind}>
      <span className={styles.mark}>
        <Icon name={status.kind} filled={status.kind === "active"} />
      </span>
      <span className={styles.copy}>
        <span className={styles.title}>{t(status.kind)}</span>
        <span className={styles.version}>
          {provider
            ? `${t("version")} ${provider.version}`
            : t(`${status.kind}Detail`)}
        </span>
      </span>
      {(mode === "builtin" || mode === "lkm") && (
        <span className={styles.mode}>{t(mode)}</span>
      )}
    </output>
  );
}
