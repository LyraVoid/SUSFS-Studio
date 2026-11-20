import { describe, expect, it } from "vitest";
import envelopeCases from "../../contracts/archive-envelope-cases.json";
import archiveFixture from "../../contracts/archive-v1.json";
import { resolveRoute } from "../src/app/routes";
import {
  archiveLimit,
  compareArchives,
  previewArchive,
} from "../src/features/config/preview";
import { en, zh } from "../src/i18n/messages";

describe("archive preview", () => {
  it.each(envelopeCases)("matches shared envelope case $name", async ({
    text,
    expected,
  }) => {
    expect(await previewArchive(new Blob([text]))).toMatchObject({
      formatStatus: expected,
    });
  });
  it("preserves raw JSON, including exact integers", async () => {
    const text = '{"value":18446744073709551615}';
    expect(await previewArchive(new Blob([text]))).toMatchObject({
      text,
      schema: undefined,
      keys: ["value"],
      formatStatus: "unknown",
    });
  });
  it("identifies schema labels without claiming support or rewriting unknown fields", async () => {
    const text = '{"schema":2,"unknown":{"n":18446744073709551615}}';
    expect(await previewArchive(new Blob([text]))).toMatchObject({
      text,
      schema: "2",
      keys: ["schema", "unknown"],
      formatStatus: "unknown",
    });
    expect(await previewArchive(new Blob(['{"schema":"2"}']))).toMatchObject({
      text: '{"schema":"2"}',
      schema: undefined,
      keys: ["schema"],
    });
  });
  it("compares nested values without losing integer precision", async () => {
    const a = await previewArchive(
      new Blob(['{"rules":[{"n":18446744073709551615}],"a/b":true}']),
    );
    const b = await previewArchive(
      new Blob(['{"rules":[{"n":18446744073709551614}],"a/b":false}']),
    );
    if (!a.value || !b.value) throw new Error("invalid fixture");
    expect(compareArchives(a.value, b.value)).toEqual({
      changes: [
        { path: "/a~1b", kind: "changed" },
        { path: "/rules/0/n", kind: "changed" },
      ],
      truncated: false,
    });
  });
  it("validates the versioned envelope and rejects duplicate rule IDs", async () => {
    const valid = await previewArchive(
      new Blob([JSON.stringify(archiveFixture)]),
    );
    expect(valid).toMatchObject({
      formatStatus: "valid",
      ruleCount: 4,
      schema: "1",
    });
    const rules = {
      paths: [{ id: "x", path: "/data/a", looping: false }],
      maps: [{ id: "x", path: "/data/b" }],
      kstats: [],
      redirects: [],
    };
    expect(
      await previewArchive(
        new Blob([
          JSON.stringify({ format: "susfs-studio", schema: 1, rules }),
        ]),
      ),
    ).toMatchObject({ formatStatus: "invalid" });
    expect(
      await previewArchive(
        new Blob([
          JSON.stringify({ format: "susfs-studio", schema: 3, rules }),
        ]),
      ),
    ).toMatchObject({ formatStatus: "unknown" });
  });
  it("separates format validity from field completeness and device applicability", async () => {
    const text = JSON.stringify({
      format: "susfs-studio",
      schema: 1,
      rules: {
        paths: [{ id: "x", path: "/data/a", looping: "sometimes" }],
        maps: [],
        kstats: [],
        redirects: [],
      },
    });
    expect(await previewArchive(new Blob([text]))).toMatchObject({
      formatStatus: "invalid",
    });
    for (const path of [
      "/",
      "/data/../a",
      "/data//a",
      "/data/a b",
      `/data/${"界".repeat(84)}`,
    ]) {
      expect(
        await previewArchive(
          new Blob([
            JSON.stringify({
              format: "susfs-studio",
              schema: 1,
              rules: {
                paths: [],
                maps: [{ id: "x", path }],
                kstats: [],
                redirects: [],
              },
            }),
          ]),
        ),
      ).toMatchObject({ formatStatus: "invalid" });
    }
  });
  it("validates exact static kstat values, duplicate identities and redirect schemes", async () => {
    for (const rule of [
      {
        id: "x",
        path: "/data/a",
        mode: "static",
        static: { inode: "18446744073709551616" },
      },
      {
        id: "x",
        path: "/data/a",
        mode: "normal",
        static: { inode: "1" },
      },
      { id: "x", path: "/data/a", mode: "unknown" },
    ]) {
      expect(
        await previewArchive(
          new Blob([
            JSON.stringify({
              format: "susfs-studio",
              schema: 1,
              rules: {
                paths: [],
                maps: [],
                kstats: [rule],
                redirects: [],
              },
            }),
          ]),
        ),
      ).toMatchObject({ formatStatus: "invalid" });
    }
    const duplicate = await previewArchive(
      new Blob([
        JSON.stringify({
          format: "susfs-studio",
          schema: 1,
          rules: {
            paths: [
              { id: "a", path: "/data/a", looping: false },
              { id: "b", path: "/data/a", looping: true },
            ],
            maps: [],
            kstats: [],
            redirects: [],
          },
        }),
      ]),
    );
    expect(duplicate).toMatchObject({ formatStatus: "invalid" });
  });
  it("retains unknown fields while requiring the v1 rule fields", async () => {
    const preview = await previewArchive(
      new Blob([
        JSON.stringify({
          format: "susfs-studio",
          schema: 1,
          future: "kept",
          rules: {
            paths: [
              {
                id: "a",
                path: "/data/a",
                looping: false,
                futureRule: "kept",
              },
            ],
            maps: [],
            kstats: [],
            redirects: [],
          },
        }),
      ]),
    );
    expect(preview).toMatchObject({
      formatStatus: "valid",
      unknownFields: ["future", "paths.futureRule"],
    });
  });
  it("reports bounded comparisons without losing original archives", async () => {
    const base = await previewArchive(new Blob(["{}"]));
    const changed = await previewArchive(
      new Blob([
        JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 501 }, (_, i) => [`k${i}`, i]),
          ),
        ),
      ]),
    );
    if (!base.value || !changed.value) throw new Error("invalid fixture");
    expect(compareArchives(base.value, changed.value)).toMatchObject({
      truncated: true,
    });
    expect(compareArchives(base.value, changed.value).changes).toHaveLength(
      500,
    );
  });
  it("treats numeric marker-like unknown objects as normal JSON objects", async () => {
    const base = await previewArchive(
      new Blob(['{"isLosslessNumber":true,"value":"5","extra":1}']),
    );
    const candidate = await previewArchive(
      new Blob(['{"isLosslessNumber":true,"value":"5","extra":2}']),
    );
    if (!base.value || !candidate.value) throw new Error("invalid fixture");
    expect(compareArchives(base.value, candidate.value)).toEqual({
      changes: [{ kind: "changed", path: "/extra" }],
      truncated: false,
    });
  });
  it("preserves ambiguous duplicate keys and warns without validating the structure", async () => {
    const text =
      '{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]},"x":1,"x":2}';
    expect(await previewArchive(new Blob([text]))).toMatchObject({
      text,
      ambiguous: true,
      formatStatus: "invalid",
    });
  });
  it("detects identical and escaped duplicate keys without confusing nested objects", async () => {
    for (const text of [
      '{"schema":1,"schema":1}',
      '{"a":1,"\\u0061":1}',
      '{"x":{"a":1,"a":1}}',
    ]) {
      expect(await previewArchive(new Blob([text]))).toMatchObject({
        text,
        ambiguous: true,
      });
    }
    expect(
      await previewArchive(
        new Blob(['{"x":{"a":1},"y":{"a":1},"text":"{\\"x\\":1}"}']),
      ),
    ).toMatchObject({ ambiguous: false });
  });
  it("rejects malformed, non-object, invalid UTF-8 and oversized inputs", async () => {
    for (const invalid of ["{", "[]", "null", new Uint8Array([255])]) {
      expect(await previewArchive(new Blob([invalid]))).toEqual({
        error: "archiveInvalid",
      });
    }
    expect(
      await previewArchive(new Blob([new Uint8Array(archiveLimit + 1)])),
    ).toEqual({ error: "archiveTooLarge" });
  });
  it("uses the same nesting and large-number boundaries as native", async () => {
    const nested = (count: number) =>
      `{"extra":${"[".repeat(count)}0${"]".repeat(count)}}`;
    expect(await previewArchive(new Blob([nested(63)]))).toMatchObject({
      formatStatus: "unknown",
    });
    expect(await previewArchive(new Blob([nested(64)]))).toEqual({
      error: "archiveInvalid",
    });
    const huge =
      '{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]},"future":1e1000}';
    expect(await previewArchive(new Blob([huge]))).toMatchObject({
      formatStatus: "valid",
      text: huge,
    });
    expect(
      await previewArchive(new Blob(['{"$serde_json::private::Number":"1"}'])),
    ).toMatchObject({ formatStatus: "unknown" });
  });
});

it("keeps language keys and placeholder sets aligned", () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
    expect(en[key].trim()).not.toBe("");
    expect(slots(en[key])).toEqual(slots(zh[key]));
  }
});

it("resolves the rules landing page and rejects unknown routes", () => {
  expect(resolveRoute("")).toBe("/");
  expect(resolveRoute("#/rules")).toBe("/rules/overview");
  expect(resolveRoute("#/extensions")).toBe("/rules/extensions");
  expect(resolveRoute("#/invalid")).toBeUndefined();
});
