import type { HostChannel } from "../../transport/host";
import type { Capability, Status } from "../../transport/mock";

export type OperationState =
  | "loading"
  | "stale"
  | "hostIncompatible"
  | "diagnosticsFailed"
  | "providerMissing"
  | "protocolUnknown"
  | "capabilityUnavailable"
  | "capabilityUnreported"
  | "identityUnknown"
  | "adapterUnconfirmed"
  | "extensionUnreported"
  | "extensionUnavailable"
  | "writeNotAuthorized"
  | "writeEligibleUnverified"
  | "writeEligible";

export function operationState(
  status: Status,
  field: Capability,
  channel: HostChannel,
  stale = false,
): OperationState {
  if (stale) return "stale";
  if (channel === "incompatible") return "hostIncompatible";
  switch (status.kind) {
    case "loading":
      return "loading";
    case "failed":
      return "diagnosticsFailed";
    case "missing":
      return "providerMissing";
    case "unknownProtocol":
      return "protocolUnknown";
  }
  const capability = status.provider.capabilities[field];
  if (capability === "unavailable") return "capabilityUnavailable";
  if (capability !== "available") return "capabilityUnreported";
  if (status.provider.implementation === "unknown") return "identityUnknown";
  const required =
    status.provider.implementation === "lkm"
      ? (
          {
            avcSpoof: "susfs_avc_spoof",
            fullClone: "susfs_kstat",
            hiddenModules: "susfs_hide_modules",
            mountPrefixes: "susfs_hide_mounts",
          } as Partial<Record<Capability, string>>
        )[field]
      : undefined;
  if (required) {
    if (!status.provider.procNodes) return "extensionUnreported";
    if (!status.provider.procNodes.includes(required))
      return "extensionUnavailable";
  }
  if (!status.control || status.control.adapter !== "confirmed")
    return "adapterUnconfirmed";
  if (!status.control.providerWrite) return "writeNotAuthorized";
  return status.control.effectVerification
    ? "writeEligible"
    : "writeEligibleUnverified";
}
