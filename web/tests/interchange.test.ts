import { describe, expect, it } from "vitest";
import { exportConfig, importConfig } from "../src/features/config/interchange";
import { inspectArchive } from "../src/features/config/preview";
import {
  applyRuleEdit,
  upgradeArchive,
} from "../src/features/config/ruleEdits";

const external =
  '{"schema":2,"automatic":false,"settings":{"hide_mounts":null,"logging":false,"avc_spoof":true,"priority_uid_filter":[]},"rules":[{"kind":"static_kstat","path":"/test/static","fields":{"ino":18446744073709551615,"atime_sec":-9223372036854775808}},{"kind":"redirect","path":"/test/source","destination":"/test/dest","uid_scheme":2}],"lkm":{"hidden_modules":[],"mount_prefixes":[]}}';

describe("configuration interchange", () => {
  it("round trips exact stat values, tri-state settings and an explicitly empty filter", () => {
    const studio = importConfig(external);
    expect(studio).toBeDefined();
    expect(studio).toContain('"inode": "18446744073709551615"');
    const output = exportConfig(studio ?? "");
    expect(output).toContain('"ino": 18446744073709551615');
    expect(output).toContain('"atime_sec": -9223372036854775808');
    expect(importConfig(output ?? "")).toEqual(studio);
  });

  it.each([
    external.replace('"uid_scheme":2', '"uid_scheme":3'),
    external.replace('"ino":', '"unrecognized":'),
    external.replace('"schema":2', '"schema":1'),
    external.replace('"logging":false', '"logging":true,"logging":false'),
    external.replace('"static_kstat"', '"other"'),
  ])("rejects unrepresentable input", (text) => {
    expect(importConfig(text)).toBeUndefined();
  });

  it("refuses Studio fields that would be lost on export", () => {
    const studio = importConfig(external) ?? "";
    expect(
      exportConfig(studio.replace('"uidScheme": 2', '"uidScheme": 4')),
    ).toBeUndefined();
    expect(
      exportConfig(studio.replace('"inode":', '"extra": 1e1000, "inode":')),
    ).toBeUndefined();
  });

  it("changes only the schema token, then edits settings without rewriting unknown data", () => {
    const old =
      '{ "format":"susfs-studio", "s\\u0063hema" : 1, "rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]},"future":1e1000 }';
    const next = upgradeArchive(old);
    expect(next).toBe(old.replace(" : 1,", " : 2,"));
    expect(
      upgradeArchive(old.replace('"future"', '"automatic"')),
    ).toBeUndefined();
    const edit = { section: "settings", key: "logging", after: false } as const;
    const updated = applyRuleEdit(next ?? "", edit);
    expect(updated).toContain('"future":1e1000');
    expect(inspectArchive(updated ?? "")).toMatchObject({
      value: { settings: { logging: false } },
    });
    expect(applyRuleEdit(updated ?? "", edit)).toBeUndefined();
    expect(
      applyRuleEdit(updated ?? "", {
        section: "lkm",
        key: "hiddenModules",
        after: ["x", "x"],
      }),
    ).toBeUndefined();
  });
});
