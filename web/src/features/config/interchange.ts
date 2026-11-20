import { LosslessNumber, parse, stringify } from "lossless-json";
import { scanArchive } from "./duplicateKeys";
import {
  archiveLimit,
  inspectArchive,
  type Json,
  type JsonObject,
  object,
  ruleGroups,
  validStaticField,
} from "./preview";

const settingsNames = {
  hideMounts: "hide_mounts",
  logging: "logging",
  avcSpoof: "avc_spoof",
  priorityUidFilter: "priority_uid_filter",
} as const;
const lkmNames = {
  hiddenModules: "hidden_modules",
  mountPrefixes: "mount_prefixes",
};
const staticNames = {
  inode: "ino",
  device: "dev",
  links: "nlink",
  size: "size",
  blocks: "blocks",
  blockSize: "blksize",
  atimeSeconds: "atime_sec",
  atimeNanoseconds: "atime_nsec",
  mtimeSeconds: "mtime_sec",
  mtimeNanoseconds: "mtime_nsec",
  ctimeSeconds: "ctime_sec",
  ctimeNanoseconds: "ctime_nsec",
};

function requireShape(value: unknown, keys: readonly string[]): JsonObject {
  if (!object(value) || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error("Unsupported fields");
  return value;
}

function rename(
  value: unknown,
  names: Record<string, string>,
  importing: boolean,
): JsonObject {
  const pairs = Object.entries(names).map(([studio, external]) =>
    importing ? ([external, studio] as const) : ([studio, external] as const),
  );
  const source = requireShape(
    value,
    pairs.map(([from]) => from),
  );
  return Object.fromEntries(
    pairs.flatMap(([from, to]) =>
      Object.hasOwn(source, from) ? [[to, source[from] as Json]] : [],
    ),
  );
}

function uid(value: Json | undefined) {
  if (
    !(value instanceof LosslessNumber) ||
    !["0", "1", "2"].includes(value.value)
  )
    throw new Error("Unsupported redirect scope");
  return value;
}

function staticValues(value: unknown, importing: boolean) {
  if (importing) {
    const fields = rename(value, staticNames, true);
    return Object.fromEntries(
      Object.entries(fields).flatMap(([key, item]) => {
        if (item === null) return [];
        if (
          !(item instanceof LosslessNumber) ||
          !validStaticField(key, item.value)
        )
          throw new Error("Invalid static field");
        return [[key, item.value]];
      }),
    );
  }
  return Object.fromEntries(
    Object.entries(rename(value, staticNames, false)).map(([key, item]) => {
      if (typeof item !== "string") throw new Error("Invalid static field");
      return [key, new LosslessNumber(item)];
    }),
  );
}

export function importConfig(text: string) {
  try {
    if (new TextEncoder().encode(text).length > archiveLimit) return;
    const scan = scanArchive(text);
    if (scan.duplicate || scan.tooDeep || scan.unrepresentable) return;
    const root = requireShape(parse(text), [
      "schema",
      "automatic",
      "settings",
      "rules",
      "lkm",
    ]);
    const { schema, automatic } = root;
    if (
      !(schema instanceof LosslessNumber) ||
      !["1", "2"].includes(schema.value) ||
      typeof automatic !== "boolean" ||
      !Array.isArray(root.rules)
    )
      return;
    const allSettings = requireShape(root.settings, [
      ...Object.values(settingsNames),
      "uname",
      "cmdline",
    ]);
    const { uname, cmdline, priority_uid_filter, ...switches } = allSettings;
    if (uname != null) requireShape(uname, ["release", "version"]);
    const settings = rename(switches, settingsNames, true);
    if (priority_uid_filter != null)
      settings.priorityUidFilter = priority_uid_filter;
    const lkm = rename(root.lkm, lkmNames, true);
    if (!Array.isArray(lkm.hiddenModules) || !Array.isArray(lkm.mountPrefixes))
      return;
    const rules: Record<(typeof ruleGroups)[number], JsonObject[]> = {
      paths: [],
      maps: [],
      kstats: [],
      redirects: [],
    };
    for (const [index, value] of root.rules.entries()) {
      if (!object(value) || typeof value.path !== "string") return;
      const base = { id: `import-${index + 1}`, path: value.path };
      const keys = ["kind", "path"];
      switch (value.kind) {
        case "path":
          requireShape(value, [...keys, "looping"]);
          rules.paths.push({ ...base, looping: value.looping as Json });
          break;
        case "map":
          requireShape(value, keys);
          rules.maps.push(base);
          break;
        case "kstat":
          requireShape(value, [...keys, "full_clone"]);
          if (typeof value.full_clone !== "boolean") return;
          rules.kstats.push({
            ...base,
            mode: value.full_clone ? "fullClone" : "normal",
          });
          break;
        case "static_kstat":
          requireShape(value, [...keys, "fields"]);
          if (schema.value !== "2") return;
          rules.kstats.push({
            ...base,
            mode: "static",
            static: staticValues(value.fields, true),
          });
          break;
        case "redirect":
          requireShape(value, [...keys, "destination", "uid_scheme"]);
          rules.redirects.push({
            ...base,
            destination: value.destination as Json,
            uidScheme: uid(value.uid_scheme),
          });
          break;
        default:
          return;
      }
    }
    const result = stringify(
      {
        format: "susfs-studio",
        schema: 2,
        automatic,
        settings,
        uname: uname ?? null,
        cmdline: cmdline ?? null,
        lkm,
        rules,
      },
      undefined,
      2,
    );
    if (result && inspectArchive(result).formatStatus === "valid")
      return result;
  } catch {
    return;
  }
}

export function exportConfig(text: string) {
  try {
    const archive = inspectArchive(text);
    if (archive.formatStatus !== "valid" || archive.unrepresentable) return;
    const root = requireShape(archive.value, [
      "format",
      "schema",
      "rules",
      ...(archive.schema === "2"
        ? ["settings", "uname", "cmdline", "lkm", "automatic"]
        : []),
    ]);
    if (root.uname != null) requireShape(root.uname, ["release", "version"]);
    const settings = rename(root.settings ?? {}, settingsNames, false);
    const lkm = rename(root.lkm ?? {}, lkmNames, false);
    const groups = requireShape(root.rules, ruleGroups);
    const rules = ruleGroups.flatMap((group) =>
      (groups[group] as JsonObject[]).map((value): JsonObject => {
        const keys = ["id", "path"];
        const path = value.path as string;
        switch (group) {
          case "paths":
            requireShape(value, [...keys, "looping"]);
            return { kind: "path", path, looping: value.looping as Json };
          case "maps":
            requireShape(value, keys);
            return { kind: "map", path };
          case "kstats":
            requireShape(value, [...keys, "mode", "static"]);
            return value.mode === "static"
              ? {
                  kind: "static_kstat",
                  path,
                  fields: staticValues(value.static, false),
                }
              : { kind: "kstat", path, full_clone: value.mode === "fullClone" };
          case "redirects":
            requireShape(value, [...keys, "destination", "uidScheme"]);
            return {
              kind: "redirect",
              path,
              destination: value.destination as Json,
              uid_scheme: uid(value.uidScheme),
            };
          default:
            throw new Error("Unsupported rule group");
        }
      }),
    );
    const result = stringify(
      {
        schema: 2,
        automatic: root.automatic ?? false,
        settings: {
          hide_mounts: null,
          logging: null,
          avc_spoof: null,
          ...settings,
          uname: root.uname ?? null,
          cmdline: root.cmdline ?? null,
        },
        rules,
        lkm: { hidden_modules: [], mount_prefixes: [], ...lkm },
      },
      undefined,
      2,
    );
    if (result && new TextEncoder().encode(result).length <= archiveLimit)
      return result;
  } catch {
    return;
  }
}
