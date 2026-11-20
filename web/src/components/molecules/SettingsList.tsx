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
    <section
      className={styles.group}
      aria-label={label}
      data-testid="segmented-list"
    >
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
  dataAvailability,
  role,
}: {
  icon?: IconName;
  title: string;
  id?: string;
  detail?: string;
  trailing?: ReactNode;
  action?: () => void;
  disabled?: boolean;
  dataAvailability?: "available" | "unavailable" | "unknown" | "loading";
  role?: "alert" | "status";
}) {
  const content = (
    <>
      {icon && (
        <span className={styles.icon}>
          <Icon name={icon} />
        </span>
      )}
      <span className={styles.copy}>
        <span id={id}>{title}</span>
        {detail && (
          <span className={styles.detail} data-testid="settings-row-detail">
            {detail}
          </span>
        )}
      </span>
      {trailing}
    </>
  );
  if (action || disabled)
    return (
      <button
        className={`${styles.row} ${styles.action} ${icon ? "" : styles.noIcon}`}
        type="button"
        onClick={action}
        disabled={disabled}
        aria-label={title}
        data-availability={dataAvailability}
        role={role}
        data-testid="settings-row"
      >
        {content}
      </button>
    );
  return (
    <div
      className={`${styles.row} ${icon ? "" : styles.noIcon}`}
      data-availability={dataAvailability}
      role={role}
      data-testid="settings-row"
    >
      {content}
    </div>
  );
}
