import styles from "./ExpressiveSwitch.module.css";
import { Icon } from "./Icon";

export function ExpressiveSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className={styles.root} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb}>
          <Icon name={checked ? "check" : "close"} />
        </span>
      </span>
    </label>
  );
}
