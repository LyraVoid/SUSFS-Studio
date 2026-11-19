import type { ReactNode } from "react";
import { Icon, type IconName } from "../atoms/Icon";
import styles from "./SettingsList.module.css";

export function SettingsList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.group} aria-label={label}>
      {children}
    </section>
  );
}

export function SettingsRow({
  icon,
  title,
  id,
  detail,
  trailing,
  action,
  disabled,
}: {
  icon: IconName;
  title: string;
  id?: string;
  detail?: string;
  trailing?: ReactNode;
  action?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className={styles.icon}>
        <Icon name={icon} />
      </span>
      <span className={styles.copy}>
        <span id={id}>{title}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
      {trailing}
    </>
  );
  if (action || disabled)
    return (
      <button
        className={`${styles.row} ${styles.action}`}
        type="button"
        onClick={action}
        disabled={disabled}
        aria-label={title}
      >
        {content}
      </button>
    );
  return <div className={styles.row}>{content}</div>;
}
