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
  if (!status.control || status.control.adapter !== "confirmed")
    return "adapterUnconfirmed";
  if (!status.control.providerWrite) return "writeNotAuthorized";
  return status.control.effectVerification
    ? "writeEligible"
    : "writeEligibleUnverified";
}
