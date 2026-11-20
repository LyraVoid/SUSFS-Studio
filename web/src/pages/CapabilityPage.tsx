import { Button } from "@mantine/core";
import { useRef } from "react";
import type { RuleRoute } from "../app/routes";
import { syncAppBar } from "../components/molecules/FlexiblePageHeader";
import {
  BasicArchive,
  LkmArchive,
} from "../components/organisms/ControlArchive";
import { RuleArchive } from "../components/organisms/RuleArchive";
import {
  RulesOverview,
  RulesOverviewLead,
} from "../components/organisms/RulesOverview";
import type { RuleGroup } from "../features/config/ruleEdits";
import type { useRuleArchive } from "../features/config/useRuleArchive";
import type { Message, Translate } from "../i18n/messages";
import type { ArchiveBridge } from "../transport/archiveBridge";
import type { Status } from "../transport/mock";
import pageStyles from "./CapabilityPage.module.css";

const tabs: readonly [RuleRoute, Message][] = [
  ["/rules/overview", "overview"],
  ["/rules/basic", "controlBasic"],
  ["/rules/paths", "paths"],
  ["/rules/disguise", "disguise"],
  ["/rules/redirect", "redirect"],
  ["/rules/extensions", "extensions"],
];

const groups: Partial<Record<RuleRoute, RuleGroup[]>> = {
  "/rules/paths": ["paths"],
  "/rules/disguise": ["maps", "kstats"],
  "/rules/redirect": ["redirects"],
};

export function CapabilityPage({
  route,
  status,
  demo,
  stale,
  archive,
  bridge,
  connected,
  refresh,
  t,
}: {
  route: RuleRoute;
  status: Status;
  demo: boolean;
  stale: boolean;
  archive: ReturnType<typeof useRuleArchive>;
  bridge?: ArchiveBridge;
  connected: boolean;
  refresh: () => void;
  t: Translate;
}) {
  const overview = route === "/rules/overview";
  const lkm =
    !demo &&
    !stale &&
    status.kind === "active" &&
    status.provider.implementation === "lkm";
  const provider =
    !stale && status.kind === "active" ? status.provider : undefined;
  const chrome = useRef<HTMLDivElement>(null);
  return (
    <div className={pageStyles.rulesPage} data-testid="rules-page">
      <div
        className={pageStyles.rulesChrome}
        ref={chrome}
        data-testid="rules-chrome"
      >
        <header className={pageStyles.rulesHeader} data-testid="rules-header">
          <div className={pageStyles.rulesToolbar} data-testid="rules-toolbar">
            <Button
              variant="subtle"
              className={pageStyles.refresh}
              onClick={() => {
                refresh();
                if (connected) void archive.refresh();
              }}
            >
              {t("rulesRefresh")}
            </Button>
          </div>
          <div className={pageStyles.title}>
            <h1>{t("susfsTitle")}</h1>
            {demo && <span>{t("demo")}</span>}
          </div>
        </header>
        <nav
          className={pageStyles.subnav}
          aria-label={t("ruleNavigation")}
          data-testid="rules-tabs"
        >
          {tabs.map(([path, label]) => (
            <a
              key={path}
              href={`#${path}`}
              aria-current={route === path ? "page" : undefined}
            >
              {t(label)}
            </a>
          ))}
        </nav>
      </div>
      <div
        className={pageStyles.rulesContent}
        data-testid="rules-content"
        onScroll={(event) => {
          if (chrome.current)
            syncAppBar(chrome.current, event.currentTarget.scrollTop);
        }}
      >
        <RuleArchive
          key={route}
          mode={overview ? "overview" : "rules"}
          groups={groups[route] ?? []}
          state={archive}
          demo={demo}
          connected={connected}
          provider={provider}
          leading={
            overview && (
              <RulesOverviewLead status={status} stale={stale} t={t} />
            )
          }
          t={t}
        >
          {overview && (
            <RulesOverview
              status={status}
              demo={demo}
              stale={stale}
              archive={archive}
              bridge={bridge}
              t={t}
            />
          )}
          {route === "/rules/basic" && <BasicArchive state={archive} t={t} />}
          {route === "/rules/extensions" && (
            <LkmArchive state={archive} lkm={lkm} t={t} />
          )}
        </RuleArchive>
      </div>
    </div>
  );
}
