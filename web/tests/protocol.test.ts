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
});
