import { describe, expect, it } from "vitest";
import { operationState } from "../src/features/status/operationQualification";
import type { Control, Status } from "../src/transport/mock";

const control: Control = {
  archiveImport: true,
  providerWrite: false,
  effectVerification: false,
  adapter: "confirmed",
};
const active = (
  capability: "available" | "unavailable" | "unknown",
  next = control,
) =>
  ({
    kind: "active",
    control: next,
    provider: {
      implementation: "lkm",
      kernelType: "GKI",
      version: "v2.3.0",
      variant: "GKI-LKM",
      audited: true,
      capabilities: { paths: capability },
    },
  }) satisfies Status;

describe("operation qualification", () => {
  it("keeps host, adapter and provider failures distinct", () => {
    expect(operationState({ kind: "loading" }, "paths", "ksu")).toBe("loading");
    expect(operationState({ kind: "failed" }, "paths", "incompatible")).toBe(
      "hostIncompatible",
    );
    expect(operationState({ kind: "failed" }, "paths", "ksu")).toBe(
      "diagnosticsFailed",
    );
    expect(operationState({ kind: "missing" }, "paths", "ksu")).toBe(
      "providerMissing",
    );
    expect(operationState({ kind: "unknownProtocol" }, "paths", "ksu")).toBe(
      "protocolUnknown",
    );
  });

  it("keeps unreported and explicitly unsupported capabilities separate", () => {
    expect(operationState(active("unknown"), "paths", "ksu")).toBe(
      "capabilityUnreported",
    );
    expect(operationState(active("unavailable"), "paths", "ksu")).toBe(
      "capabilityUnavailable",
    );
  });

  it("does not turn a capability marker into write authorization", () => {
    expect(
      operationState(
        {
          ...active("available"),
          provider: {
            ...active("available").provider,
            implementation: "unknown",
          },
        },
        "paths",
        "ksu",
      ),
    ).toBe("identityUnknown");
    expect(operationState(active("available"), "paths", "ksu")).toBe(
      "writeNotAuthorized",
    );
    expect(
      operationState(
        active("available", {
          ...control,
          providerWrite: true,
        }),
        "paths",
        "ksu",
      ),
    ).toBe("writeEligibleUnverified");
    expect(
      operationState(
        active("available", {
          ...control,
          providerWrite: true,
          effectVerification: true,
        }),
        "paths",
        "ksu",
      ),
    ).toBe("writeEligible");
  });

  it("fails closed for stale evidence and an unconfirmed adapter", () => {
    expect(operationState(active("available"), "paths", "ksu", true)).toBe(
      "stale",
    );
    expect(
      operationState(
        active("available", { ...control, adapter: "unknown" }),
        "paths",
        "ksu",
      ),
    ).toBe("adapterUnconfirmed");
  });
});
