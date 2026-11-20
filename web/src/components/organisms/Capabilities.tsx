import type { Message, Translate } from "../../i18n/messages";
import type { Capability, Status } from "../../transport/mock";
import { SettingsRow } from "../molecules/SettingsList";

const capabilityLabels = {
  priorityUidFilter: "controlUid",
  hideMounts: "controlHideMounts",
  logging: "controlLogging",
  avcSpoof: "controlAvcSpoof",
  uname: "controlUname",
  cmdline: "controlCmdline",
  paths: "pathRules",
  map: "mapRules",
  kstat: "controlDynamicKstat",
  fullClone: "ruleClone",
  staticKstat: "ruleStatic",
  redirect: "redirectRules",
  hiddenModules: "controlModules",
  mountPrefixes: "controlPrefixes",
} satisfies Record<Capability, Message>;

export function Capabilities({
  status,
  demo,
  fields,
  stale,
  t,
}: {
  status: Status;
  demo: boolean;
  fields: readonly Capability[];
  stale?: boolean;
  t: Translate;
}) {
  const provider =
    !stale && status.kind === "active" ? status.provider : undefined;
  return (
    <>
      {fields.map((field) => {
        const value =
          status.kind === "loading" || stale
            ? "loading"
            : (provider?.capabilities[field] ?? "unknown");
        const detail =
          field === "staticKstat" && provider
            ? provider.staticKstatFields === undefined
              ? t("controlUnreportedFields")
              : t("controlReportedFields", {
                  values:
                    provider.staticKstatFields.join(", ") || t("archiveNoKeys"),
                })
            : field === "redirect" && provider
              ? provider.redirectUidSchemes === undefined
                ? t("controlUnreportedSchemes")
                : t("controlReportedSchemes", {
                    values:
                      provider.redirectUidSchemes.join(", ") ||
                      t("archiveNoKeys"),
                  })
              : undefined;
        return (
          <SettingsRow
            key={field}
            icon={
              value === "available"
                ? "active"
                : value === "unavailable"
                  ? "notice"
                  : "unknownProtocol"
            }
            title={t(capabilityLabels[field])}
            detail={[
              t(
                demo
                  ? value
                  : value === "available"
                    ? "reportedAvailable"
                    : value === "unavailable"
                      ? "reportedUnavailable"
                      : value,
              ),
              detail,
            ]
              .filter(Boolean)
              .join(" · ")}
            dataAvailability={value}
          />
        );
      })}
    </>
  );
}
