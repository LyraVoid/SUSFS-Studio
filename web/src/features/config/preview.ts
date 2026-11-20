import { LosslessNumber, parse } from "lossless-json";
import { scanArchive } from "./duplicateKeys";

export const archiveLimit = 128 * 1024;
const ruleLimit = 128;
const depthLimit = 64;
const changeLimit = 500;
const encoder = new TextEncoder();
export type Json =
  | null
  | boolean
  | string
  | LosslessNumber
  | Json[]
  | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
type FormatStatus = "valid" | "invalid" | "unknown";
type ArchiveInspection = {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly schema?: string;
  readonly keys: string[];
  readonly value: JsonObject;
  readonly ambiguous: boolean;
  readonly formatStatus: FormatStatus;
  readonly ruleCount?: number;
  readonly unknownFields: string[];
  readonly unrepresentable: boolean;
};
type ArchivePreview =
  | (ArchiveInspection & { error?: never })
  | (Partial<Record<keyof ArchiveInspection, never>> & {
      error: "archiveTooLarge" | "archiveInvalid";
    });

export const ruleGroups = ["paths", "maps", "kstats", "redirects"] as const;
const ruleKeys = {
  paths: new Set(["id", "path", "looping"]),
  maps: new Set(["id", "path"]),
  kstats: new Set(["id", "path", "mode", "static"]),
  redirects: new Set(["id", "path", "destination", "uidScheme"]),
};
const staticKinds: ReadonlyMap<string, readonly [string, bigint]> = new Map([
  ["inode", ["u64", 18446744073709551615n]],
  ["device", ["u64", 18446744073709551615n]],
  ["links", ["u64", 4294967295n]],
  ["size", ["nonnegative", 9223372036854775807n]],
  ["blocks", ["nonnegative", 9223372036854775807n]],
  ["blockSize", ["nonnegative", 9223372036854775807n]],
  ["atimeSeconds", ["signed", 9223372036854775807n]],
  ["mtimeSeconds", ["signed", 9223372036854775807n]],
  ["ctimeSeconds", ["signed", 9223372036854775807n]],
  ["atimeNanoseconds", ["nanoseconds", 999999999n]],
  ["mtimeNanoseconds", ["nanoseconds", 999999999n]],
  ["ctimeNanoseconds", ["nanoseconds", 999999999n]],
] as const);

export function object(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof LosslessNumber)
  );
}

function number(value: unknown): value is LosslessNumber {
  return value instanceof LosslessNumber;
}

function id(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    encoder.encode(value).length <= 128 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: IDs are single-line metadata.
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

export function path(value: unknown) {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    value !== "/" &&
    encoder.encode(value).length < 256 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: SUSFS paths cannot contain shell controls.
    !/[\s\u0000-\u001f\u007f]/u.test(value) &&
    !value.includes("//") &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}

export const staticFields = Array.from(staticKinds.keys());

export function validStaticField(key: string, value: string) {
  const spec = staticKinds.get(key);
  return Boolean(spec && timedNumber(value, spec));
}

function timedNumber(value: unknown, spec: readonly [string, bigint]) {
  if (typeof value !== "string" || !/^(0|-?[1-9]\d*)$/.test(value))
    return false;
  const parsed = BigInt(value);
  if (spec[0] === "signed")
    return parsed >= -9223372036854775808n && parsed <= spec[1];
  return parsed >= 0n && parsed <= spec[1];
}

function staticKstat(value: unknown) {
  if (!object(value)) return false;
  let known = 0;
  for (const [key, field] of Object.entries(value)) {
    const spec = staticKinds.get(key);
    if (!spec) continue;
    known++;
    if (!timedNumber(field, spec)) return false;
  }
  return known > 0;
}

function validRule(
  group: (typeof ruleGroups)[number],
  value: Json,
  unknowns: Set<string>,
) {
  if (!object(value) || !id(value.id) || !path(value.path)) return false;
  for (const key of Object.keys(value))
    if (!ruleKeys[group].has(key)) unknowns.add(`${group}.${key}`);
  if (group === "paths") return typeof value.looping === "boolean";
  if (group === "maps") return true;
  if (group === "kstats") {
    if (value.mode === "normal" || value.mode === "fullClone")
      return value.static === undefined;
    return value.mode === "static" && staticKstat(value.static);
  }
  return (
    path(value.destination) &&
    value.destination !== value.path &&
    number(value.uidScheme) &&
    /^[0-4]$/.test(value.uidScheme.value)
  );
}

function inspectVersionOne(value: JsonObject): {
  status: FormatStatus;
  count?: number;
  unknown: string[];
} {
  const rules = value.rules;
  if (!object(rules)) return { status: "invalid", unknown: [] };
  const entries = ruleGroups.flatMap((group) =>
    Array.isArray(rules[group])
      ? (rules[group] as Json[]).map((entry) => ({ entry, group }))
      : [],
  );
  if (
    ruleGroups.some((group) => !Array.isArray(rules[group])) ||
    entries.length > ruleLimit
  )
    return { status: "invalid", unknown: [] };
  const ids = new Set<string>();
  const identities = new Set<string>();
  const unknown = new Set<string>();
  for (const { entry, group } of entries) {
    if (!validRule(group, entry, unknown))
      return { status: "invalid", unknown: [] };
    const rule = entry as JsonObject;
    if (ids.has(rule.id as string)) return { status: "invalid", unknown: [] };
    const identity = `${group}\0${rule.path as string}`;
    if (identities.has(identity)) return { status: "invalid", unknown: [] };
    ids.add(rule.id as string);
    identities.add(identity);
  }
  return {
    status: "valid",
    count: entries.length,
    unknown: Array.from(unknown).sort(),
  };
}

export async function previewArchive(file: Blob): Promise<ArchivePreview> {
  if (file.size > archiveLimit) return { error: "archiveTooLarge" } as const;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    )
      return { error: "archiveInvalid" } as const;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return inspectArchive(text);
  } catch {
    return { error: "archiveInvalid" } as const;
  }
}

export function inspectArchive(text: string): ArchivePreview {
  const bytes = encoder.encode(text);
  try {
    if (bytes.length > archiveLimit)
      return { error: "archiveTooLarge" } as const;
    if (text.startsWith("\uFEFF")) return { error: "archiveInvalid" } as const;
    const scan = scanArchive(text);
    if (scan.tooDeep) return { error: "archiveInvalid" } as const;
    let ambiguous = scan.duplicate;
    const value: unknown = parse(text, undefined, {
      onDuplicateKey: ({ newValue }) => {
        ambiguous = true;
        return newValue;
      },
    });
    if (!object(value)) return { error: "archiveInvalid" } as const;
    const schema =
      number(value.schema) && /^(0|[1-9]\d*)$/.test(value.schema.value)
        ? value.schema.value
        : undefined;
    const keys = Object.keys(value).sort();
    let formatStatus: FormatStatus = "unknown";
    let ruleCount: number | undefined;
    let unknownFields = keys.filter(
      (key) => !["format", "schema", "rules"].includes(key),
    );
    if (value.format === "susfs-studio" && schema === "1") {
      const inspection = inspectVersionOne(value);
      formatStatus = inspection.status;
      ruleCount = inspection.count;
      unknownFields = unknownFields.concat(inspection.unknown).sort();
    }
    if (ambiguous) {
      formatStatus = "invalid";
      ruleCount = undefined;
    }
    return {
      text,
      bytes,
      schema,
      keys,
      value,
      ambiguous,
      unrepresentable: scan.unrepresentable,
      formatStatus,
      ruleCount,
      unknownFields: Array.from(new Set(unknownFields)),
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
