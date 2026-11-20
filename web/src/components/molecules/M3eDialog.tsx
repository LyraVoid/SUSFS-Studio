import { Modal } from "@mantine/core";
import { type ReactNode, useId } from "react";
import styles from "./M3eDialog.module.css";

export function M3eDialog({
  opened,
  onClose,
  title,
  children,
  closeOnClickOutside = true,
  closeOnEscape = true,
}: {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      withCloseButton={false}
      closeOnClickOutside={closeOnClickOutside}
      closeOnEscape={closeOnEscape}
      transitionProps={{ transition: "pop", duration: 160 }}
      classNames={{
        root: styles.root,
        content: styles.dialog,
        header: styles.header,
        body: styles.body,
        overlay: styles.overlay,
      }}
    >
      <div className={styles.content} data-testid="m3e-dialog">
        {children}
      </div>
    </Modal>
  );
}

export function DialogActions({
  children,
  justify = "end",
}: {
  children: ReactNode;
  justify?: "end" | "space-between";
}) {
  return (
    <div
      className={styles.actions}
      data-justify={justify}
      data-testid="dialog-actions"
    >
      {children}
    </div>
  );
}

export function DialogChoiceGroup({
  value,
  options,
  disabled = false,
  onChange,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <div className={styles.choices} role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={styles.choice}
          data-selected={value === option.value}
          data-testid="dialog-choice"
        >
          <span>{option.label}</span>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.radio} aria-hidden="true" />
        </label>
      ))}
    </div>
  );
}
