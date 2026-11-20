import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { Route } from "../app/routes";
import { Icon } from "../components/atoms/Icon";
import type { Translate } from "../i18n/messages";
import styles from "./Shell.module.css";

const links = [
  ["/", "home"],
  ["/rules/overview", "rules"],
  ["/settings", "settings"],
] as const;

export function Shell({
  route,
  t,
  children,
}: {
  route: Route | undefined;
  t: Translate;
  children: ReactNode;
}) {
  const main = useRef<HTMLElement>(null);
  const positions = useRef(new Map<Route | undefined, number>());
  const visited = useRef(false);
  useLayoutEffect(() => {
    const content = main.current;
    if (!content) return;
    content.scrollTop = positions.current.get(route) ?? 0;
    if (visited.current) content.focus({ preventScroll: true });
    visited.current = true;
    const remember = () => positions.current.set(route, content.scrollTop);
    content.addEventListener("scroll", remember);
    return () => content.removeEventListener("scroll", remember);
  }, [route]);

  return (
    <div
      className={styles.shell}
      data-home={route === "/"}
      data-rules={route?.startsWith("/rules/")}
      data-testid="shell"
    >
      <button
        type="button"
        className={styles.skip}
        onClick={() => main.current?.focus()}
      >
        {t("skip")}
      </button>
      <nav className={styles.nav} aria-label={t("navigation")}>
        {links.map(([path, key]) => {
          const active =
            key === "rules" ? route?.startsWith("/rules/") : route === path;
          return (
            <a
              key={path}
              href={`#${path}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.pill}>
                <Icon name={key} filled={active} />
              </span>
              <span>{t(key)}</span>
            </a>
          );
        })}
      </nav>
      <main ref={main} tabIndex={-1} className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
