import type { ReactNode } from "react";
import styles from "./FlexiblePageHeader.module.css";

export function syncAppBar(element: HTMLElement, scrollTop: number) {
  const progress = Math.min(1, Math.max(0, scrollTop / 56));
  element.style.setProperty("--top-app-bar-height", `${120 - 56 * progress}px`);
  element.style.setProperty(
    "--top-app-bar-title-top",
    `${48 - 32 * progress}px`,
  );
  element.style.setProperty(
    "--top-app-bar-title-size",
    `${36 - 14 * progress}px`,
  );
  element.style.setProperty(
    "--top-app-bar-title-line",
    `${44 - 16 * progress}px`,
  );
}

export function FlexiblePageHeader({
  title,
  aside,
}: {
  title: string;
  aside?: ReactNode;
}) {
  return (
    <header className={styles.header} data-testid="flexible-page-header">
      <h1>{title}</h1>
      {aside && <span className={styles.aside}>{aside}</span>}
    </header>
  );
}
