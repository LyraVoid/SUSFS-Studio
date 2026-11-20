import type { ReactNode } from "react";
import styles from "./SegmentedSection.module.css";
import { SettingsList } from "./SettingsList";

export function SegmentedSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 data-testid="segmented-section-title">{title}</h2>
      <SettingsList label={title}>{children}</SettingsList>
    </section>
  );
}
