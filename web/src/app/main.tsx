import "@mantine/core/styles.css";
import "../theme/tokens.css";
import { MantineProvider } from "@mantine/core";
import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import type { WorkflowReport } from "../components/organisms/RulesOverview";
import { useRuleArchive } from "../features/config/useRuleArchive";
import { useStatus } from "../features/status/useStatus";
import { type Locale, translator } from "../i18n/messages";
import { Shell } from "../layouts/Shell";
import { CapabilityPage } from "../pages/CapabilityPage";
import { Home } from "../pages/Home";
import { Settings } from "../pages/Settings";
import {
  defaultColorScheme,
  readColorProfile,
  saveColorProfile,
} from "../theme/colorProfile";
import { colorSchemeManager, createThemeColors, theme } from "../theme/theme";
import { createDemoArchive } from "../transport/demoArchive";
import { diagnosticSource, hostChannel } from "../transport/host";
import type { Scenario } from "../transport/mock";
import { resolveRoute } from "./routes";

function subscribe(update: () => void) {
  window.addEventListener("hashchange", update);
  return () => window.removeEventListener("hashchange", update);
}

function getLocale(): Locale {
  try {
    return localStorage.getItem("studio-locale") === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

function App() {
  const [profile, setProfile] = useState(readColorProfile);
  const { resolver, effectiveSpec } = useMemo(
    () => createThemeColors(profile),
    [profile],
  );
  useEffect(() => saveColorProfile(profile), [profile]);
  const [source] = useState(() => diagnosticSource(window));
  const demo = source.kind === "demo";
  const channel = hostChannel(source);
  const [locale, setLocale] = useState(getLocale);
  const [selection, setSelection] = useState<{ scenario: Scenario }>({
    scenario: "lkm23",
  });
  const [request, setRequest] = useState(0);
  const route = resolveRoute(
    useSyncExternalStore(subscribe, () => window.location.hash),
  );
  const { status, stale } = useStatus(selection, request, source);
  const bridge = source.kind === "host" ? source.archive : undefined;
  const workflow = demo && selection.scenario === "workflow";
  const [sampleArchive] = useState(createDemoArchive);
  const [report, setReport] = useState<WorkflowReport>();
  const activeArchive = workflow ? sampleArchive : bridge;
  const onRules = route?.startsWith("/rules/") === true;
  const deviceRules = useRuleArchive(bridge, onRules && !demo);
  const sampleRules = useRuleArchive(sampleArchive, onRules && workflow);
  const rules = workflow ? sampleRules : deviceRules;
  const t = translator(locale);
  useEffect(() => {
    const host = window.ksu as
      | { enableEdgeToEdge?: (enabled?: boolean) => void }
      | undefined;
    try {
      host?.enableEdgeToEdge?.(true);
    } catch {
      // A host may expose an older bridge without viewport support.
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem("studio-locale", locale);
    } catch {
      return;
    }
  }, [locale]);
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={resolver}
      defaultColorScheme={defaultColorScheme}
      colorSchemeManager={colorSchemeManager}
    >
      <Shell route={route} t={t}>
        {route === "/" ? (
          <Home
            status={status}
            demo={demo}
            channel={channel}
            stale={stale}
            refresh={() => setRequest((id) => id + 1)}
            t={t}
          />
        ) : route === "/settings" ? (
          <Settings
            profile={profile}
            effectiveSpec={effectiveSpec}
            setProfile={setProfile}
            demo={demo}
            scenario={selection.scenario}
            setScenario={(scenario) =>
              setSelection((previous) =>
                previous.scenario === scenario ? previous : { scenario },
              )
            }
            locale={locale}
            setLocale={setLocale}
            t={t}
          />
        ) : route ? (
          <CapabilityPage
            key={route}
            route={route}
            status={status}
            demo={demo}
            workflow={workflow}
            report={report}
            setReport={setReport}
            stale={stale}
            channel={channel}
            archive={rules}
            bridge={activeArchive}
            connected={Boolean(activeArchive)}
            refresh={() => setRequest((id) => id + 1)}
            refreshGeneration={request}
            t={t}
          />
        ) : (
          <>
            <h1>{t("unknownPage")}</h1>
            <a href="#/">{t("home")}</a>
          </>
        )}
      </Shell>
    </MantineProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing application root");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
