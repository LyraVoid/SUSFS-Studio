import { Icon, type IconName } from "../atoms/Icon";
import styles from "./FactRow.module.css";

export function FactRow({
  icon,
  label,
  detail,
  onClick,
  interactive = false,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const iconSlot = (
    <span className={styles.icon}>
      <Icon name={icon} />
    </span>
  );
  if (onClick || interactive)
    return (
      <button
        type="button"
        className={`${styles.row} ${styles.action} ${interactive ? styles.connected : styles.standalone}`}
        onClick={onClick}
      >
        {iconSlot}
        <span>
          <span className={styles.label}>{label}</span>
          <span className={styles.detail}>{detail}</span>
        </span>
      </button>
    );
  return (
    <div className={`${styles.row} ${styles.fact}`}>
      <dt className={styles.label}>
        {iconSlot}
        {label}
      </dt>
      <dd className={styles.detail}>{detail}</dd>
    </div>
  );
}
