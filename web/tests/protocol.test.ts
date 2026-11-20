import { describe, expect, it } from "vitest";
import fixtures from "../../contracts/diagnostic-v1.json";
import { parseStatusResponse } from "../src/transport/protocol";

describe("status response boundary", () => {
  it.each([
    fixtures.active,
    fixtures.missing,
    fixtures.unknownProtocol,
    fixtures.failed,
  ])("decodes shared status fixture %#", (fixture) => {
    expect(parseStatusResponse(JSON.stringify(fixture), "status")).toEqual(
      fixture.data,
    );
  });
  const valid = {
    protocol: 1,
    requestId: "r1",
    ok: true,
    data: {
      kind: "active",
      provider: {
        implementation: "unknown",
        kernelType: "unknown",
        version: "2.3.0",
        capabilities: {},
      },
    },
  };
  it("accepts a confirmed response without guessing implementation", () => {
    expect(parseStatusResponse(JSON.stringify(valid), "r1")).toEqual(
      valid.data,
    );
  });
  it("keeps reported metadata separate from inferred capabilities", () => {
    const data = {
      ...valid.data,
      provider: {
        ...valid.data.provider,
        variant: "GKI-LKM",
        audited: false,
        features: ["SUSFS_LKM_MODULES", "CONFIG_KSU_SUSFS_SUS_PATH"],
        capabilities: { paths: "available" },
        staticKstatFields: ["size", "ctime_sec"],
        redirectUidSchemes: [0, 1, 2],
      },
    };
    expect(
      parseStatusResponse(JSON.stringify({ ...valid, data }), "r1"),
    ).toEqual(data);
  });
  it("keeps adapter and operation authorization explicit", () => {
    const data = {
      ...valid.data,
      control: {
        archiveImport: true,
        providerWrite: false,
        effectVerification: false,
        adapter: "confirmed",
      },
    };
    expect(
      parseStatusResponse(JSON.stringify({ ...valid, data }), "r1"),
    ).toEqual(data);
  });
  it.each([
    { variant: "" },
    { audited: "false" },
    { features: ["SUSFS_LKM_MODULES", "SUSFS_LKM_MODULES"] },
    { features: ["CONFIG_KSU_SUSFS_SUS_PATH\n"] },
    { staticKstatFields: ["size", "size"] },
    { redirectUidSchemes: [-1] },
  ])("rejects malformed provider metadata %#", (metadata) => {
    const data = {
      ...valid.data,
      provider: { ...valid.data.provider, ...metadata },
    };
    expect(
      parseStatusResponse(JSON.stringify({ ...valid, data }), "r1"),
    ).toEqual({ kind: "failed" });
  });
  it.each([
    { slots: [] },
    { parser: "unknown-parser" },
    {
      slots: [
        {
          ...fixtures.active.data.provider.bootFacts.slots[0],
          id: "../a",
        },
      ],
    },
    {
      slots: [
        {
          ...fixtures.active.data.provider.bootFacts.slots[0],
          release: {
            value: "x".repeat(65),
            source: "/proc/sys/kernel/osrelease",
            confidence: "current-runtime",
          },
        },
      ],
    },
  ])("rejects malformed boot facts %#", (metadata) => {
    const data = {
      ...valid.data,
      provider: {
        ...valid.data.provider,
        bootFacts: {
          ...fixtures.active.data.provider.bootFacts,
          ...metadata,
        },
      },
    };
    expect(
      parseStatusResponse(JSON.stringify({ ...valid, data }), "r1"),
    ).toEqual({ kind: "failed" });
  });
  it("preserves valid optional device facts without changing a failed status", () => {
    const response = {
      ...fixtures.failed,
      data: {
        kind: "failed",
        device: { model: "Demo phone", system: "\n", kernel: 42 },
      },
    };
    expect(parseStatusResponse(JSON.stringify(response), "status")).toEqual({
      kind: "failed",
      device: { model: "Demo phone" },
    });
  });
  it("rejects malformed or contradictory control facts", () => {
    for (const control of [
      null,
      true,
      {
        archiveImport: true,
        providerWrite: false,
        effectVerification: false,
        adapter: "trusted-by-name",
      },
    ]) {
      expect(
        parseStatusResponse(
          JSON.stringify({
            ...valid,
            data: { kind: "missing", control },
          }),
          "r1",
        ),
      ).toEqual({ kind: "failed" });
    }
  });
  it("fails closed for a legacy control advertisement", () => {
    expect(
      parseStatusResponse(
        JSON.stringify({
          ...valid,
          data: { kind: "missing", control: { archiveImport: true } },
        }),
        "r1",
      ),
    ).toEqual({
      kind: "missing",
      control: {
        archiveImport: true,
        providerWrite: false,
        effectVerification: false,
        adapter: "unknown",
      },
    });
  });
  it("retains validated device facts when provider data is malformed", () => {
    const device = { model: "Demo phone", kernel: "6.6.118-demo" };
    for (const provider of [
      null,
      { ...valid.data.provider, version: "" },
      { ...valid.data.provider, capabilities: { paths: true } },
    ]) {
      const data = { kind: "active", device, provider };
      expect(
        parseStatusResponse(JSON.stringify({ ...valid, data }), "r1"),
      ).toEqual({ kind: "failed", device });
    }
  });
  it("does not trust device facts from an unrelated or unsupported response", () => {
    const response = {
      ...valid,
      data: { ...valid.data, device: { model: "Demo phone" } },
    };
    expect(parseStatusResponse(JSON.stringify(response), "other")).toEqual({
      kind: "failed",
    });
    expect(
      parseStatusResponse(JSON.stringify({ ...response, protocol: 2 }), "r1"),
    ).toEqual({ kind: "unknownProtocol" });
  });
  it("separates unknown protocol from invalid or unrelated replies", () => {
    expect(
      parseStatusResponse(JSON.stringify({ ...valid, protocol: 2 }), "r1"),
    ).toEqual({ kind: "unknownProtocol" });
    expect(parseStatusResponse(JSON.stringify(valid), "r2")).toEqual({
      kind: "failed",
    });
    expect(parseStatusResponse("{", "r1")).toEqual({ kind: "failed" });
    expect(parseStatusResponse(" ".repeat(512 * 1024 + 1), "r1")).toEqual({
      kind: "failed",
    });
    expect(parseStatusResponse("界".repeat(180000), "r1")).toEqual({
      kind: "failed",
    });
    expect(
      parseStatusResponse(
        JSON.stringify({
          ...valid,
          data: {
            ...valid.data,
            provider: { ...valid.data.provider, capabilities: { paths: true } },
          },
        }),
        "r1",
      ),
    ).toEqual({ kind: "failed" });
  });
  it.each([
    " ",
    "v2.3.0\n",
    "\u0000",
  ])("rejects an invalid provider version %j", (version) => {
    expect(
      parseStatusResponse(
        JSON.stringify({
          ...valid,
          data: {
            ...valid.data,
            provider: { ...valid.data.provider, version },
          },
        }),
        "r1",
      ),
    ).toEqual({ kind: "failed" });
  });
});
