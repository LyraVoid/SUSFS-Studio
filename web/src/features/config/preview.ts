import { LosslessNumber, parse } from "lossless-json";
import { hasDuplicateKeys } from "./duplicateKeys";

export const archiveLimit = 128 * 1024;
const depthLimit = 64;
const changeLimit = 500;
type Json =
  | null
  | boolean
  | string
  | LosslessNumber
  | Json[]
  | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function object(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof LosslessNumber)
  );
}

export async function previewArchive(file: Blob) {
  if (file.size > archiveLimit) return { error: "archiveTooLarge" } as const;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    let ambiguous = false;
    const value: unknown = parse(text, undefined, {
      onDuplicateKey: ({ newValue }) => {
        ambiguous = true;
        return newValue;
      },
    });
    ambiguous ||= hasDuplicateKeys(text);
    if (!object(value)) return { error: "archiveInvalid" } as const;
    const schema =
      value.schema instanceof LosslessNumber &&
      /^(0|[1-9]\d*)$/.test(value.schema.value)
        ? value.schema.value
        : undefined;
    const format = value.format;
    let formatStatus: "valid" | "invalid" | "unknown" = "unknown";
    let ruleCount: number | undefined;
    if (format === "susfs-studio" && schema === "1") {
      if (
        object(value.rules) &&
        ["paths", "maps", "kstats", "redirects"].every((key) =>
          Array.isArray((value.rules as JsonObject)[key]),
        )
      ) {
        const rules = value.rules as JsonObject;
        const entries = ["paths", "maps", "kstats", "redirects"].flatMap(
          (key) => rules[key] as Json[],
        );
        const valid = entries.every((entry) => {
          if (!object(entry)) return false;
          const rule = entry as JsonObject;
          if (typeof rule.id !== "string" || !rule.id.trim()) return false;
          if (
            rule.path !== undefined &&
            (typeof rule.path !== "string" ||
              !rule.path.startsWith("/") ||
              rule.path.includes("\0") ||
              new TextEncoder().encode(rule.path).length >= 256)
          )
            return false;
          if (
            rule.inode !== undefined &&
            (typeof rule.inode !== "string" ||
              !/^(0|[1-9]\d*)$/.test(rule.inode) ||
              rule.inode.length > 20 ||
              BigInt(rule.inode) > 18446744073709551615n)
          )
            return false;
          return true;
        });
        formatStatus =
          valid &&
          new Set(
            entries.map((entry) =>
              object(entry) ? (entry as JsonObject).id : undefined,
            ),
          ).size === entries.length
            ? "valid"
            : "invalid";
        if (formatStatus === "valid") ruleCount = entries.length;
      } else formatStatus = "invalid";
    }
    if (ambiguous) {
      formatStatus = "invalid";
      ruleCount = undefined;
    }
    return {
      text,
      schema,
      keys: Object.keys(value).sort(),
      value,
      ambiguous,
      formatStatus,
      ruleCount,
    } as const;
  } catch {
    return { error: "archiveInvalid" } as const;
  }
}

export type Change = { path: string; kind: "added" | "removed" | "changed" };

export function compareArchives(base: JsonObject, candidate: JsonObject) {
  const changes: Change[] = [];
  let truncated = false;
  const add = (path: string, kind: Change["kind"]) => {
    if (changes.length < changeLimit) changes.push({ path, kind });
    else truncated = true;
  };
  const visit = (left: Json, right: Json, path: string, depth: number) => {
    if (truncated) return;
    if (depth > depthLimit) {
      truncated = true;
      return;
    }
    if (left instanceof LosslessNumber || right instanceof LosslessNumber) {
      if (
        !(left instanceof LosslessNumber) ||
        !(right instanceof LosslessNumber) ||
        left.value !== right.value
      )
        add(path, "changed");
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length && !truncated; index++) {
        const location = `${path}/${index}`;
        if (index >= left.length) add(location, "added");
        else if (index >= right.length) add(location, "removed");
        else
          visit(left[index] as Json, right[index] as Json, location, depth + 1);
      }
      return;
    }
    if (object(left) && object(right)) {
      for (const key of Array.from(
        new Set([...Object.keys(left), ...Object.keys(right)]),
      ).sort()) {
        if (truncated) break;
        const location = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (!Object.hasOwn(left, key)) add(location, "added");
        else if (!Object.hasOwn(right, key)) add(location, "removed");
        else
          visit(
            (left as JsonObject)[key] as Json,
            (right as JsonObject)[key] as Json,
            location,
            depth + 1,
          );
      }
      return;
    }
    if (left !== right) add(path, "changed");
  };
  visit(base, candidate, "", 0);
  return { changes, truncated };
}
