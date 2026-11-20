import { type CommandBridge, execCommand } from "./commandBridge";

const executable = "/data/adb/modules/susfs_studio/bin/studioctl";
const stagePrefix = "/data/adb/susfs-studio/.staging/";
const tokenPattern = /^[0-9a-f]{32}$/;

export class ArchiveCommandError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
  }
}

export type ArchiveReceipt = {
  revision: string;
  savedAt: string;
  bytes: number;
};

export type PreparedArchive = {
  token: string;
  uploadPath: string;
  baseline?: string;
  revision?: string;
};

export type SavedArchive = {
  kind: "empty" | "saved";
  text?: string;
  revision?: string;
  receipt?: ArchiveReceipt;
  receiptStatus: "available" | "missing";
};

export type ArchiveBackup = {
  id: string;
  modifiedAt: number;
  bytes: number;
  revision?: string;
  valid: boolean;
};

export type ArchiveBridge = {
  writable: boolean;
  read(): Promise<SavedArchive>;
  prepare?: () => Promise<PreparedArchive>;
  write?: (path: string, bytes: Uint8Array) => Promise<void>;
  save?: (token: string) => Promise<ArchiveReceipt>;
  import?: (token: string) => Promise<ArchiveReceipt>;
  restore?: (token: string) => Promise<ArchiveReceipt>;
  backups(): Promise<ArchiveBackup[]>;
  backup(id: string): Promise<SavedArchive>;
};

type KsuStream = {
  open(path: string, append: boolean): string;
  write(id: string, base64: string): boolean;
  close(id: string): boolean;
};

type KsuIo = {
  version(): number;
  FileOutputStream(): KsuStream;
};

type KsuHost = CommandBridge & { io?: () => KsuIo };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(text: string, requestId: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ArchiveCommandError("BAD_RESPONSE");
  }
  if (
    !record(value) ||
    value.requestId !== requestId ||
    !Number.isInteger(value.protocol)
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  if (value.protocol !== 1)
    throw new ArchiveCommandError("UNSUPPORTED_PROTOCOL");
  if (value.ok !== true) {
    const error = record(value.error) ? value.error : {};
    throw new ArchiveCommandError(
      typeof error.code === "string" ? error.code : "IO_ERROR",
      error.retryable === true,
    );
  }
  return value.data;
}

function revision(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
    ? value
    : undefined;
}

function receipt(value: unknown): ArchiveReceipt | undefined {
  if (!record(value)) return undefined;
  const digest = revision(value.revision);
  if (
    !digest ||
    typeof value.savedAt !== "string" ||
    !/^\d+$/.test(value.savedAt) ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) < 0 ||
    (value.bytes as number) > 128 * 1024
  )
    return undefined;
  return {
    revision: digest,
    savedAt: value.savedAt,
    bytes: value.bytes as number,
  };
}

function saved(value: unknown): SavedArchive {
  if (!record(value) || (value.kind !== "empty" && value.kind !== "saved"))
    throw new ArchiveCommandError("BAD_RESPONSE");
  if (value.kind === "empty")
    return { kind: "empty", receiptStatus: "missing" };
  const digest = revision(value.revision);
  if (
    typeof value.text !== "string" ||
    new TextEncoder().encode(value.text).length > 128 * 1024 ||
    !digest
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  return {
    kind: "saved",
    text: value.text,
    revision: digest,
    receipt: receipt(value.receipt),
    receiptStatus:
      value.receiptStatus === "available" ? "available" : "missing",
  };
}

function backups(value: unknown): ArchiveBackup[] {
  if (!Array.isArray(value) || value.length > 32)
    throw new ArchiveCommandError("BAD_RESPONSE");
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !tokenPattern.test(item.id) ||
      ids.has(item.id) ||
      typeof item.modifiedAt !== "number" ||
      !Number.isSafeInteger(item.modifiedAt) ||
      Math.abs(item.modifiedAt) > 8.64e12 ||
      typeof item.bytes !== "number" ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      typeof item.valid !== "boolean"
    )
      throw new ArchiveCommandError("BAD_RESPONSE");
    const digest = revision(item.revision);
    if (item.valid && (!digest || item.bytes > 128 * 1024))
      throw new ArchiveCommandError("BAD_RESPONSE");
    ids.add(item.id);
    return {
      id: item.id,
      modifiedAt: item.modifiedAt,
      bytes: item.bytes,
      revision: digest,
      valid: item.valid,
    };
  });
}

function prepared(value: unknown): PreparedArchive {
  if (!record(value)) throw new ArchiveCommandError("BAD_RESPONSE");
  if (
    typeof value.token !== "string" ||
    !tokenPattern.test(value.token) ||
    value.uploadPath !== `${stagePrefix}${value.token}.input` ||
    (value.baseline != null && typeof value.baseline !== "string") ||
    (value.revision != null && revision(value.revision) === undefined)
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  return {
    token: value.token,
    uploadPath: value.uploadPath,
    baseline: (value.baseline as string | null | undefined) ?? undefined,
    revision: (value.revision as string | null | undefined) ?? undefined,
  };
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function createArchiveBridge(
  host: Window,
  bridge: KsuHost,
): ArchiveBridge {
  let io: KsuIo | undefined;
  try {
    const candidate = bridge.io?.();
    if (candidate?.version() === 1) io = candidate;
  } catch {
    io = undefined;
  }
  const stagePaths = new Map<string, string>();
  const call = async (
    requestId:
      | "stage"
      | "save"
      | "import"
      | "restore"
      | "read"
      | "backups"
      | "backup",
    command: string,
    timeout: number,
  ) => {
    try {
      return response(
        await execCommand(host, bridge, command, timeout, 512 * 1024),
        requestId,
      );
    } catch (error) {
      if (error instanceof ArchiveCommandError) throw error;
      throw new ArchiveCommandError(
        requestId === "save" ||
          requestId === "restore" ||
          requestId === "import"
          ? "RESULT_UNKNOWN"
          : "TIMEOUT",
      );
    }
  };
  const writeStage = async (path: string, bytes: Uint8Array) => {
    if (!io || !Array.from(stagePaths.values()).includes(path))
      throw new ArchiveCommandError("STAGE_UNAVAILABLE");
    let output: KsuStream;
    let id: string;
    try {
      output = io.FileOutputStream();
      id = output.open(path, false);
    } catch {
      throw new ArchiveCommandError("STAGE_OPEN_FAILED", true);
    }
    if (!id) throw new ArchiveCommandError("STAGE_OPEN_FAILED", true);
    let failure: unknown;
    try {
      for (let offset = 0; offset < bytes.length; offset += 32 * 1024)
        if (
          !output.write(id, base64(bytes.subarray(offset, offset + 32 * 1024)))
        )
          throw new ArchiveCommandError("STAGE_WRITE_FAILED", true);
    } catch (error) {
      failure = error;
    }
    const closed = output.close(id);
    if (failure) throw failure;
    if (!closed) throw new ArchiveCommandError("STAGE_CLOSE_FAILED", true);
  };
  return {
    writable: Boolean(io),
    read: async () =>
      saved(
        await call("read", `/system/bin/timeout 5 ${executable} read`, 6500),
      ),
    backups: async () =>
      backups(
        await call(
          "backups",
          `/system/bin/timeout 5 ${executable} backups`,
          6500,
        ),
      ),
    backup: async (id) => {
      if (!tokenPattern.test(id)) throw new ArchiveCommandError("BAD_REQUEST");
      return saved(
        await call(
          "backup",
          `/system/bin/timeout 5 ${executable} backup ${id}`,
          6500,
        ),
      );
    },
    prepare: io
      ? async () => {
          stagePaths.clear();
          const value = prepared(
            await call(
              "stage",
              `/system/bin/timeout 5 ${executable} stage`,
              6500,
            ),
          );
          stagePaths.set(value.token, value.uploadPath);
          return value;
        }
      : undefined,
    write: io ? writeStage : undefined,
    ...Object.fromEntries(
      (["save", "import", "restore"] as const).map((action) => [
        action,
        io
          ? async (token: string) => {
              if (!tokenPattern.test(token) || !stagePaths.has(token))
                throw new ArchiveCommandError("BAD_REQUEST");
              stagePaths.delete(token);
              try {
                const data = await call(
                  action,
                  `/system/bin/timeout 15 ${executable} ${action} ${token}`,
                  17000,
                );
                const value = receipt(data);
                if (!value) throw new ArchiveCommandError("BAD_RESPONSE");
                return value;
              } catch (error) {
                if (
                  error instanceof ArchiveCommandError &&
                  !["BAD_RESPONSE", "UNSUPPORTED_PROTOCOL"].includes(error.code)
                )
                  throw error;
                throw new ArchiveCommandError("RESULT_UNKNOWN");
              }
            }
          : undefined,
      ]),
    ),
  };
}
