import "@mantine/core/styles.css";
import "../theme/tokens.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { useStatus } from "../features/status/useStatus";
import { type Locale, translator } from "../i18n/messages";
import { Shell } from "../layouts/Shell";
import { CapabilityPage } from "../pages/CapabilityPage";
import { Home } from "../pages/Home";
import { Settings } from "../pages/Settings";
import { colorSchemeManager, colorVariables, theme } from "../theme/theme";
import { diagnosticSource } from "../transport/host";
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
  const [source] = useState(() => diagnosticSource(window));
  const demo = source.kind === "demo";
  const [locale, setLocale] = useState(getLocale);
  const [selection, setSelection] = useState<{ scenario: Scenario }>({
    scenario: "lkm23",
  });
  const [request, setRequest] = useState(0);
  const route = resolveRoute(
    useSyncExternalStore(subscribe, () => window.location.hash),
  );
  const { status, stale } = useStatus(selection, request, source);
  const t = translator(locale);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem("studio-locale", locale);
    } catch {
      return;
    }
  }, [locale]);
  return (
    <Shell route={route} t={t}>
      {route === "/" ? (
        <Home
          status={status}
          demo={demo}
          stale={stale}
          refresh={() => setRequest((id) => id + 1)}
          t={t}
        />
      ) : route === "/settings" ? (
        <Settings
          demo={demo}
          scenario={selection.scenario}
          setScenario={(scenario) =>
            setSelection((previous) =>
              previous.scenario === scenario ? previous : { scenario },
            )
          }
          locale={locale}
          setLocale={setLocale}
          status={status}
          t={t}
        />
      ) : route ? (
        <CapabilityPage route={route} status={status} demo={demo} t={t} />
      ) : (
        <>
          <h1>{t("unknownPage")}</h1>
          <a href="#/">{t("home")}</a>
        </>
      )}
    </Shell>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing application root");
createRoot(container).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={colorVariables}
      defaultColorScheme="dark"
      colorSchemeManager={colorSchemeManager}
    >
      <App />
    </MantineProvider>
  </StrictMode>,
);
