import type { RuleRoute } from "../app/routes";
import { Capabilities } from "../components/organisms/Capabilities";
import {
  BasicArchive,
  LkmArchive,
} from "../components/organisms/ControlArchive";
import styles from "../components/organisms/Panels.module.css";
import { RuleArchive } from "../components/organisms/RuleArchive";
import type { RuleGroup } from "../features/config/ruleEdits";
import type { useRuleArchive } from "../features/config/useRuleArchive";
import type { Message, Translate } from "../i18n/messages";
import type { Capability, Status } from "../transport/mock";
import pageStyles from "./CapabilityPage.module.css";
import page from "./PageHeader.module.css";

const rules: Record<
  RuleRoute,
  { label: Message; fields: Capability[]; groups: RuleGroup[] }
> = {
  "/rules/basic": { label: "controlBasic", fields: [], groups: [] },
  "/rules/paths": { label: "paths", fields: ["paths"], groups: ["paths"] },
  "/rules/disguise": {
    label: "disguise",
    fields: ["map", "kstat"],
    groups: ["maps", "kstats"],
  },
  "/rules/redirect": {
    label: "redirect",
    fields: ["redirect"],
    groups: ["redirects"],
  },
};

export function CapabilityPage({
  route,
  status,
  demo,
  stale,
  archive,
  connected,
  t,
}: {
  route: RuleRoute | "/extensions";
  status: Status;
  demo: boolean;
  stale: boolean;
  archive: ReturnType<typeof useRuleArchive>;
  connected: boolean;
  t: Translate;
}) {
  const rule = route === "/extensions" ? undefined : rules[route];
  const lkm =
    route === "/extensions" &&
    !demo &&
    !stale &&
    status.kind === "active" &&
    status.provider.implementation === "lkm";
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
      {(rule || lkm) && (
        <RuleArchive
          key={route}
          groups={rule?.groups ?? []}
          state={archive}
          demo={demo}
          connected={connected}
          t={t}
        >
          {route === "/rules/basic" && <BasicArchive state={archive} t={t} />}
          {lkm && <LkmArchive state={archive} t={t} />}
        </RuleArchive>
      )}
      {route === "/extensions" && !lkm && <p>{t("controlNeedsLkm")}</p>}
      {route !== "/rules/basic" && (
        <section className={styles.panel}>
          <h2>{t("compatibility")}</h2>
          <Capabilities
            status={status}
            demo={demo}
            stale={stale}
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
      )}
      <p className={styles.muted}>
        {t(rule ? "ruleReadOnly" : "extensionNote")}
      </p>
    </>
  );
}
