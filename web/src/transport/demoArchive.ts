import {
  type ArchiveBridge,
  ArchiveCommandError,
  type PreparedArchive,
  type SavedArchive,
} from "./archiveBridge";

export const demoApps = [
  { name: "org.example.reader", uid: 10101, label: "Reader" },
  { name: "org.example.notes", uid: 10102, label: "Notes" },
  { name: "org.example.gallery", uid: 10103, label: "Gallery" },
];
export const demoSlots = [
  {
    label: "A",
    release: "6.6.0-demo-a",
    version: "Demo A",
    cmdline: "example.slot=a",
    bootconfig: "example.bootconfig=a",
  },
  {
    label: "B",
    release: "6.6.0-demo-b",
    version: "Demo B",
    cmdline: "example.slot=b",
    bootconfig: "example.bootconfig=b",
  },
];

export function createDemoArchive(): ArchiveBridge {
  let current: SavedArchive = {
    kind: "empty",
    receiptStatus: "missing",
  };
  const stages = new Map<string, { revision?: string; bytes?: Uint8Array }>();
  const backups = new Map<string, SavedArchive>();
  const commit = async (token: string, restore = false) => {
    const stage = stages.get(token);
    stages.delete(token);
    if (!stage?.bytes) throw new ArchiveCommandError("DRAFT_MISSING");
    const revision = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new Uint8Array(stage.bytes)),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (stage.revision !== current.revision)
      throw new ArchiveCommandError("REVISION_CONFLICT");
    if (restore && current.revision) backups.set(current.revision, current);
    const receipt = {
      revision,
      savedAt: new Date().toISOString(),
      bytes: stage.bytes.length,
    };
    current = {
      kind: "saved",
      text: new TextDecoder().decode(stage.bytes),
      revision,
      receipt,
      receiptStatus: "available",
    };
    return receipt;
  };
  return {
    writable: true,
    read: async () => current,
    prepare: async (): Promise<PreparedArchive> => {
      const token = crypto.randomUUID().replaceAll("-", "");
      stages.set(token, { revision: current.revision });
      return {
        token,
        uploadPath: token,
        baseline: current.text,
        revision: current.revision,
      };
    },
    write: async (token, bytes) => {
      const stage = stages.get(token);
      if (!stage) throw new ArchiveCommandError("DRAFT_MISSING");
      stage.bytes = bytes;
    },
    save: commit,
    import: commit,
    restore: (token) => commit(token, true),
    backups: async () =>
      [...backups].map(([id, saved]) => ({
        id,
        revision: id,
        modifiedAt: Date.parse(saved.receipt?.savedAt ?? "") || 0,
        bytes: new TextEncoder().encode(saved.text).length,
        valid: true,
      })),
    backup: async (id) => {
      const saved = backups.get(id);
      if (!saved) throw new ArchiveCommandError("DRAFT_MISSING");
      return saved;
    },
  };
}
