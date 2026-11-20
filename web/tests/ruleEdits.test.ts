import { describe, expect, it } from "vitest";
import fixture from "../../contracts/archive-v1.json";
import { inspectArchive, ruleGroups } from "../src/features/config/preview";
import {
  applyRuleEdit,
  editRule,
  readRules,
} from "../src/features/config/ruleEdits";

const original = JSON.stringify(fixture, null, 2)
  .replace(
    '"example": true',
    '"example": 18446744073709551615, "10": 1e+03, "2": "\\u0041"',
  )
  .replace(
    '"futureStatField": true',
    '"futureStatField": [ -0, 0.00, "a\\" ] } b" ]',
  );

describe("source-preserving rule edits", () => {
  for (const group of ruleGroups) {
    it(`updates, appends and removes ${group} without formatting other entries`, () => {
      const [before] = readRules(inspectArchive(original), group);
      if (!before) throw new Error("Missing fixture");
      const after = { ...before, path: "/revised" };
      const changed = applyRuleEdit(original, { group, before, after });
      expect(changed).toBe(
        original.replace(
          new RegExp(`("id": "${before.id}",\\s+"path": )"[^"]+"`),
          '$1"/revised"',
        ),
      );
      expect(applyRuleEdit(original, { group, before, after: before })).toBe(
        original,
      );
      const added = { ...before, id: `added-${group}`, path: "/added" };
      const appended = applyRuleEdit(original, { group, after: added });
      if (!appended) throw new Error("Append failed");
      expect(applyRuleEdit(appended, { group, before: added })).toBe(original);
      const removed = applyRuleEdit(appended, { group, before });
      expect(readRules(inspectArchive(removed ?? ""), group)).toHaveLength(1);
      expect(removed).toContain(
        '"example": 18446744073709551615, "10": 1e+03, "2": "\\u0041"',
      );
      expect(applyRuleEdit(original, { group, before: after })).toBeUndefined();
    });
  }

  it("preserves unknown static values while deleting several known fields", () => {
    const [before] = readRules(inspectArchive(original), "kstats");
    const after = editRule("kstats", before, {
      path: "/revised",
      mode: "static",
      inode: "18446744073709551615",
      blocks: "9223372036854775807",
    });
    const changed = applyRuleEdit(original, { group: "kstats", before, after });
    expect(changed).toContain('"futureStatField": [ -0, 0.00, "a\\" ] } b" ]');
    expect(changed).not.toContain('"atimeSeconds"');
    expect(changed).toContain('"blocks":"9223372036854775807"');
    expect(
      editRule("kstats", before, { path: "/revised", mode: "normal" }),
    ).toBeUndefined();
  });

  it("rejects malformed, unknown and duplicate inputs", () => {
    for (const input of [
      '{"schema":2}',
      '{"schema":1,',
      original.replace('"schema": 1', '"schema":1,"schema":1'),
    ]) {
      expect(
        applyRuleEdit(input, {
          group: "paths",
          after: { id: "id", path: "/path", looping: false },
        }),
      ).toBeUndefined();
    }
    expect(
      applyRuleEdit(original, {
        group: "paths",
        after: { id: "id", path: "/example", looping: false },
      }),
    ).toBeUndefined();
  });
});
