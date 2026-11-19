export const archiveLimit = 128 * 1024;

export async function previewArchive(file: Blob) {
  if (file.size > archiveLimit) return { error: "archiveTooLarge" } as const;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return { text } as const;
  } catch {
    return { error: "archiveInvalid" } as const;
  }
  return { error: "archiveInvalid" } as const;
}
