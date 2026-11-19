export const archiveLimit = 128 * 1024;

export async function previewArchive(file: Blob) {
  if (file.size > archiveLimit) return { error: "archiveTooLarge" } as const;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      const schema =
        typeof object.schema === "number" &&
        Number.isSafeInteger(object.schema) &&
        object.schema >= 0
          ? String(object.schema)
          : undefined;
      return { text, schema, keys: Object.keys(object).sort() } as const;
    }
  } catch {
    return { error: "archiveInvalid" } as const;
  }
  return { error: "archiveInvalid" } as const;
}

export function compareArchiveKeys(base: string[], candidate: string[]) {
  const previous = new Set(base);
  const next = new Set(candidate);
  return {
    added: candidate.filter((key) => !previous.has(key)),
    removed: base.filter((key) => !next.has(key)),
  };
}
