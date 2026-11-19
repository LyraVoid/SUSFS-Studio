import { describe, expect, it } from "vitest";
import { parseStatusResponse } from "../src/transport/protocol";

describe("status response boundary", () => {
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
