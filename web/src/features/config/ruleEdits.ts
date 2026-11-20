import { LosslessNumber, stringify } from "lossless-json";
import {
  inspectArchive,
  type Json,
  type JsonObject,
  object,
  type ruleGroups,
  staticFields,
} from "./preview";

export type RuleGroup = (typeof ruleGroups)[number];
export type Rule = JsonObject & { id: string; path: string };
export type RuleEdit = {
  group: RuleGroup;
  before?: Rule;
  after?: Rule;
};

export const emptyArchive =
  '{"format":"susfs-studio","schema":1,"rules":{"paths":[],"maps":[],"kstats":[],"redirects":[]}}';

export function readRules(
  archive: ReturnType<typeof inspectArchive>,
  group: RuleGroup,
) {
  if (archive.formatStatus !== "valid" || !object(archive.value.rules))
    return [];
  return archive.value.rules[group] as Rule[];
}

type Span = {
  start: number;
  end: number;
  keyStart?: number;
  fields?: Map<string, Span>;
  items?: Span[];
};

function locate(text: string) {
  const token = /\s*("(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:]+)/y;
  let start = 0;
  let part = "";
  const next = () => {
    const match = token.exec(text);
    part = match?.[1] ?? "";
    start = token.lastIndex - part.length;
  };
  const is = (value: string) => part === value;
  const read = (): Span => {
    const span: Span = { start, end: token.lastIndex };
    if (is("{")) {
      const fields = new Map<string, Span>();
      next();
      while (!is("}")) {
        const key = JSON.parse(part) as string;
        const keyStart = start;
        next();
        next();
        fields.set(key, { ...read(), keyStart });
        if (is(",")) next();
      }
      span.fields = fields;
      span.end = token.lastIndex;
    } else if (is("[")) {
      const items: Span[] = [];
      next();
      while (!is("]")) {
        if (!part) throw new Error("Missing array token");
        items.push(read());
        if (is(",")) next();
      }
      span.items = items;
      span.end = token.lastIndex;
    }
    next();
    return span;
  };
  next();
  return read();
}

type Patch = [start: number, end: number, value: string];

function remove(entries: Span[], index: number): Patch {
  const current = entries[index];
  if (!current) throw new Error("Missing entry");
  return entries[index + 1]
    ? [current.start, entries[index + 1]?.start ?? current.end, ""]
    : [entries[index - 1]?.end ?? current.start, current.end, ""];
}

function update(
  span: Span,
  before: JsonObject,
  after: JsonObject,
  patches: Patch[],
) {
  const keys = span.fields;
  if (!keys) throw new Error("Missing fields");
  if (
    keys.size !== Object.keys(before).length ||
    [...keys.keys()].some((key) => !Object.hasOwn(before, key))
  )
    throw new Error("Unrepresentable fields");
  const removed = [...keys.keys()].filter((key) => !Object.hasOwn(after, key));
  const added = Object.keys(after).filter((key) => !keys.has(key));
  if (removed.length > 0) {
    // Remove runs together so adjacent deletions never overlap at a comma.
    const entries = [...keys.entries()];
    for (let index = 0; index < entries.length; index++) {
      const first = entries[index];
      if (!first || !removed.includes(first[0])) continue;
      const begin = index;
      while (removed.includes(entries[index + 1]?.[0] ?? "")) index++;
      const last = entries[index]?.[1] ?? first[1];
      const next = entries[index + 1]?.[1];
      const keyStart = first[1].keyStart ?? first[1].start;
      patches.push(
        next
          ? [keyStart, next.keyStart ?? next.start, ""]
          : [entries[begin - 1]?.[1].end ?? keyStart, last.end, ""],
      );
    }
  }
  if (added.length)
    patches.push([
      span.end - 1,
      span.end - 1,
      `${keys.size > removed.length ? "," : ""}${added.map((key) => `${JSON.stringify(key)}:${stringify(after[key])}`).join(",")}`,
    ]);
  for (const [key, field] of keys) {
    if (!Object.hasOwn(after, key)) continue;
    const left = before[key];
    const right = after[key];
    if (stringify(left) === stringify(right)) continue;
    if (object(left) && object(right)) update(field, left, right, patches);
    else patches.push([field.start, field.end, stringify(right) ?? ""]);
  }
}

export function applyRuleEdit(
  text: string,
  { group, before, after }: RuleEdit,
) {
  const parsed = inspectArchive(text);
  if (parsed.formatStatus !== "valid" || parsed.unrepresentable) return;
  const rules = readRules(parsed, group);
  const index = before ? rules.findIndex((rule) => rule.id === before.id) : -1;
  if (before && (index < 0 || stringify(before) !== stringify(rules[index])))
    return;
  let array: Span | undefined;
  try {
    array = locate(text).fields?.get("rules")?.fields?.get(group);
  } catch {
    return;
  }
  if (!array?.items) return;
  const patches: Patch[] = [];
  const entry = array.items[index];
  if (before && entry) {
    if (after) {
      try {
        if (
          entry.fields?.get("static")?.fields &&
          after.static === undefined &&
          [...(entry.fields.get("static")?.fields?.keys() ?? [])].some(
            (key) => !staticFields.includes(key),
          )
        )
          return;
        update(entry, before, after, patches);
      } catch {
        return;
      }
    } else patches.push(remove(array.items, index));
  } else if (after) {
    if (rules.some((rule) => rule.id === after.id)) return;
    const position = array.items.at(-1)?.end ?? array.start + 1;
    patches.push([
      position,
      position,
      `${rules.length ? "," : ""}${stringify(after)}`,
    ]);
  }
  let result = text;
  for (const [start, end, value] of patches.sort((a, b) => b[0] - a[0]))
    result = result.slice(0, start) + value + result.slice(end);
  return inspectArchive(result).formatStatus === "valid" ? result : undefined;
}

export function editRule(
  group: RuleGroup,
  before: Rule | undefined,
  fields: Record<string, string>,
): Rule | undefined {
  const rule: Rule = {
    ...before,
    id: before?.id ?? crypto.randomUUID(),
    path: fields.path ?? "",
  };
  if (group === "paths") rule.looping = fields.looping === "true";
  if (group === "redirects") {
    rule.destination = fields.destination ?? "";
    rule.uidScheme = new LosslessNumber(fields.uidScheme ?? "0");
  }
  if (group === "kstats") {
    rule.mode = fields.mode ?? "normal";
    if (
      object(rule.static) &&
      rule.mode !== "static" &&
      Object.keys(rule.static).some((key) => !staticFields.includes(key))
    )
      return;
    if (rule.mode === "static") {
      const values = object(rule.static) ? { ...rule.static } : {};
      for (const key of staticFields) {
        if (fields[key]) values[key] = fields[key] as Json;
        else delete values[key];
      }
      rule.static = values;
    } else delete rule.static;
  }
  return rule;
}
