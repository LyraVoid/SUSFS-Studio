import { describe, expect, it } from "vitest";
import { resolveRoute } from "../src/app/routes";
import { archiveLimit, previewArchive } from "../src/features/config/preview";
import { en, zh } from "../src/i18n/messages";

describe("archive preview", () => {
  it("preserves raw JSON, including exact integers", async () => {
    const text = '{"value":18446744073709551615}';
    expect(await previewArchive(new Blob([text]))).toEqual({ text });
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
  expect(resolveRoute("#/rules")).toBe("/rules/paths");
  expect(resolveRoute("#/invalid")).toBeUndefined();
});
