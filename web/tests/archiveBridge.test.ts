import { expect, it, vi } from "vitest";
import {
  type ArchiveCommandError,
  createArchiveBridge,
} from "../src/transport/archiveBridge";

const token = "0123456789abcdef0123456789abcdef";
const uploadPath = `/data/adb/susfs-studio/.staging/${token}.input`;
const revision = "a".repeat(64);

function response(requestId: string, data: unknown, ok = true) {
  return JSON.stringify({
    protocol: 1,
    requestId,
    ok,
    ...(ok ? { data } : { error: data }),
  });
}

it("uses native-created staging paths and fixed save tokens", async () => {
  const host: Record<string, unknown> = {};
  const output = new Map<string, Uint8Array>();
  const exec = vi.fn((command: string, options: string, callback: string) => {
    expect(options).toBe("{}");
    expect(command).toMatch(
      /^\/system\/bin\/timeout (5|15) \/data\/adb\/modules\/susfs_studio\/bin\/studioctl (stage|save|read)( [0-9a-f]{32})?$/,
    );
    const data = command.endsWith(" stage")
      ? { token, uploadPath, baseline: null, revision: null }
      : command.includes(" save ")
        ? { revision, savedAt: "1760000000000", bytes: 3 }
        : {
            kind: "saved",
            text: "abc",
            revision,
            receipt: { revision, savedAt: "1760000000000", bytes: 3 },
            receiptStatus: "available",
          };
    const requestId = command.includes(" stage")
      ? "stage"
      : command.includes(" save ")
        ? "save"
        : "read";
    (host[callback] as (code: number, stdout: string) => void)(
      0,
      response(requestId, data),
    );
  });
  const bridge = createArchiveBridge(host as unknown as Window, {
    exec,
    io: () => {
      let opened = "";
      return {
        version: () => 1,
        FileOutputStream: () => ({
          open(path, append) {
            expect(path).toBe(uploadPath);
            expect(append).toBe(false);
            opened = path;
            return "stream";
          },
          write(id, base64) {
            expect(id).toBe("stream");
            output.set(
              opened,
              Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
            );
            return true;
          },
          close(id) {
            expect(id).toBe("stream");
            return true;
          },
        }),
      };
    },
  });
  expect(bridge.writable).toBe(true);
  const prepared = await bridge.prepare?.();
  if (!prepared) throw new Error("missing prepare");
  await bridge.write?.(prepared.uploadPath, new Uint8Array([0, 1, 255]));
  expect(output.get(uploadPath)).toEqual(new Uint8Array([0, 1, 255]));
  await expect(bridge.save?.(prepared.token)).resolves.toEqual({
    revision,
    savedAt: "1760000000000",
    bytes: 3,
  });
  await expect(bridge.save?.(prepared.token)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  await expect(bridge.read()).resolves.toMatchObject({
    kind: "saved",
    text: "abc",
    receiptStatus: "available",
  });
  expect(Object.keys(host)).toEqual([]);
});

it("keeps export available but disables writes without ksu.io", async () => {
  const host: Record<string, unknown> = {};
  const bridge = createArchiveBridge(host as unknown as Window, {
    exec(command, _options, callback) {
      (host[callback] as (code: number, stdout: string) => void)(
        0,
        response("read", { kind: "empty", receiptStatus: "missing" }),
      );
      expect(command).toContain(" studioctl read");
    },
  });
  expect(bridge.writable).toBe(false);
  expect(bridge.prepare).toBeUndefined();
  await expect(bridge.read()).resolves.toEqual({
    kind: "empty",
    receiptStatus: "missing",
  });
});

it("preserves stable native error codes", async () => {
  const host: Record<string, unknown> = {};
  const exec = vi.fn((_command: string, _options: string, callback: string) => {
    (host[callback] as (code: number, stdout: string) => void)(
      0,
      response("stage", { code: "BUSY", retryable: true }, false),
    );
  });
  const bridge = createArchiveBridge(host as unknown as Window, {
    exec,
    io: () => ({
      version: () => 1,
      FileOutputStream: () => ({
        open: () => "",
        write: () => false,
        close: () => false,
      }),
    }),
  });
  await expect(bridge.prepare?.()).rejects.toEqual(
    expect.objectContaining<Partial<ArchiveCommandError>>({
      code: "BUSY",
      retryable: true,
    }),
  );
});

it("treats an invalid save receipt as unknown and consumes the token", async () => {
  const host: Record<string, unknown> = {};
  const bridge = createArchiveBridge(host as unknown as Window, {
    exec(command, _options, callback) {
      (host[callback] as (code: number, stdout: string) => void)(
        0,
        command.endsWith(" stage")
          ? response("stage", { token, uploadPath })
          : response("save", {}),
      );
    },
    io: () => ({
      version: () => 1,
      FileOutputStream: () => ({
        open: () => "stream",
        write: () => true,
        close: () => true,
      }),
    }),
  });
  await bridge.prepare?.();
  await expect(bridge.save?.(token)).rejects.toMatchObject({
    code: "RESULT_UNKNOWN",
  });
  await expect(bridge.save?.(token)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
});

it("uses only a staged token for restore", async () => {
  const host: Record<string, unknown> = {};
  const commands: string[] = [];
  const bridge = createArchiveBridge(host as unknown as Window, {
    exec(command, _options, callback) {
      commands.push(command);
      const stage = command.endsWith(" stage");
      (host[callback] as (code: number, stdout: string) => void)(
        0,
        response(
          stage ? "stage" : "restore",
          stage ? { token, uploadPath } : { revision, savedAt: "1", bytes: 3 },
        ),
      );
    },
    io: () => ({
      version: () => 1,
      FileOutputStream: () => ({
        open: () => "stream",
        write: () => true,
        close: () => true,
      }),
    }),
  });
  await expect(bridge.restore?.(token)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  await bridge.prepare?.();
  await expect(bridge.restore?.(token)).resolves.toMatchObject({ revision });
  expect(commands[1]).toMatch(new RegExp(` restore ${token}$`));
  await expect(bridge.restore?.(token)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
});

it("streams archive bytes in bounded chunks", async () => {
  const host: Record<string, unknown> = {};
  const chunks: string[] = [];
  const bridge = createArchiveBridge(host as unknown as Window, {
    exec(command, _options, callback) {
      const data = command.endsWith(" stage")
        ? { token, uploadPath }
        : { revision, savedAt: "1760000000000", bytes: 70 * 1024 };
      (host[callback] as (code: number, stdout: string) => void)(
        0,
        response(command.endsWith(" stage") ? "stage" : "save", data),
      );
    },
    io: () => ({
      version: () => 1,
      FileOutputStream: () => ({
        open: () => "stream",
        write: (_id, chunk) => {
          chunks.push(chunk);
          return true;
        },
        close: () => true,
      }),
    }),
  });
  const prepared = await bridge.prepare?.();
  if (!prepared) throw new Error("missing prepare");
  await bridge.write?.(prepared.uploadPath, new Uint8Array(70 * 1024));
  expect(chunks).toHaveLength(3);
  expect(chunks.map((chunk) => atob(chunk).length)).toEqual([
    32 * 1024,
    32 * 1024,
    6 * 1024,
  ]);
});
