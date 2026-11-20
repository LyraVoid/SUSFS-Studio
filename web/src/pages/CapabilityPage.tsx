import type { RuleRoute } from "../app/routes";
import { Capabilities } from "../components/organisms/Capabilities";
import styles from "../components/organisms/Panels.module.css";
import type { Message, Translate } from "../i18n/messages";
import type { Capability, Status } from "../transport/mock";
import pageStyles from "./CapabilityPage.module.css";
import page from "./PageHeader.module.css";

const rules: Record<RuleRoute, { label: Message; fields: Capability[] }> = {
  "/rules/paths": { label: "paths", fields: ["paths"] },
  "/rules/disguise": { label: "disguise", fields: ["map", "kstat"] },
  "/rules/redirect": { label: "redirect", fields: ["redirect"] },
};

export function CapabilityPage({
  route,
  status,
  demo,
  t,
}: {
  route: RuleRoute | "/extensions";
  status: Status;
  demo: boolean;
  t: Translate;
}) {
  const rule = route === "/extensions" ? undefined : rules[route];
  return (
    <>
      <header className={page.header}>
        <h1>{t(rule?.label ?? "extensions")}</h1>
        <p className={styles.muted}>{t(demo ? "demo" : "hostDiagnostics")}</p>
      </header>
      {rule && (
        <nav className={pageStyles.subnav} aria-label={t("ruleNavigation")}>
          {Object.entries(rules).map(([path, item]) => (
            <a
              key={path}
              href={`#${path}`}
              aria-current={route === path ? "page" : undefined}
            >
              {t(item.label)}
            </a>
          ))}
        </nav>
      )}
      <section className={styles.panel}>
        <h2>{t("compatibility")}</h2>
        <Capabilities
          status={status}
          demo={demo}
          fields={rule?.fields ?? ["extensions"]}
          t={t}
        />
        <p className={styles.muted}>
          {t(demo ? "fixtureOnly" : "hostCapabilities")}
        </p>
        {route === "/rules/disguise" && (
          <p className={styles.muted}>{t("stage")}</p>
        )}
      </section>
      <section className={styles.panel}>
        <h2>
          {t(rule ? (demo ? "rulesEmpty" : "rulesUnobserved") : "diagnostics")}
        </h2>
        {rule && demo && <p>{t("ruleCount", { count: 0 })}</p>}
        <p className={styles.muted}>{t(rule ? "ruleNote" : "extensionNote")}</p>
        {rule && <p>{t("ruleReadOnly")}</p>}
      </section>
    </>
  );
}
