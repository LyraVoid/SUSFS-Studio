import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ArchiveCommandError } from "../src/transport/archiveBridge";
import {
  parseOperationPlan,
  parseOperationReport,
} from "../src/transport/operations";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../contracts/operation-v2.json", import.meta.url),
    "utf8",
  ),
);

describe("operation protocol v2", () => {
  it("accepts the shared plan and receipt fixture", () => {
    expect(parseOperationPlan(fixture.plan)).toMatchObject({
      id: "0123456789abcdef0123456789abcdef",
      status: "ready",
      effectStatus: "unverified",
      candidateRevision:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(parseOperationReport(fixture.report)).toMatchObject({
      planId: "0123456789abcdef0123456789abcdef",
      status: "applied",
      effectStatus: "verified",
      applied: ["fedcba9876543210fedcba9876543210"],
    });
  });

  it("fails closed on stale versions, malformed IDs and mismatched item IDs", () => {
    expect(() =>
      parseOperationPlan({ ...fixture.plan, planVersion: 1 }),
    ).toThrow(ArchiveCommandError);
    expect(() =>
      parseOperationPlan({ ...fixture.plan, id: "../../archive" }),
    ).toThrow(ArchiveCommandError);
    expect(() =>
      parseOperationReport({
        ...fixture.report,
        applied: ["ffffffffffffffffffffffffffffffff"],
      }),
    ).toThrow(ArchiveCommandError);
    expect(() =>
      parseOperationReport({
        ...fixture.report,
        failed: { ffffffffffffffffffffffffffffffff: "missing" },
      }),
    ).toThrow(ArchiveCommandError);
  });
});
