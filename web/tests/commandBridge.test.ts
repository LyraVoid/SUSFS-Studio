import { expect, it, vi } from "vitest";
import { commandBridge } from "../src/transport/commandBridge";

it("uses fixed read-only commands and removes callback names", async () => {
  const host: Record<string, unknown> = {};
  const exec = vi.fn((command: string, options: string, callback: string) => {
    expect(options).toBe("{}");
    expect(command).toMatch(
      /^\/system\/bin\/timeout 3 \/data\/adb\/modules\/susfs_studio\/bin\/studioctl (hello|status)$/,
    );
    (host[callback] as (code: number, output: string) => void)(0, command);
  });
  const bridge = commandBridge(host as unknown as Window, { exec });
  await expect(bridge.hello()).resolves.toContain(" hello");
  await expect(bridge.status()).resolves.toContain(" status");
  expect(Object.keys(host)).toEqual([]);
});

it("rejects failed, thrown, and timed-out calls", async () => {
  const host: Record<string, unknown> = {};
  await expect(
    commandBridge(host as unknown as Window, {
      exec: (_command, _options, callback) => {
        (host[callback] as (code: number, output: string) => void)(1, "");
      },
    }).status(),
  ).rejects.toThrow();
  await expect(
    commandBridge(host as unknown as Window, {
      exec: () => {
        throw new Error();
      },
    }).hello(),
  ).rejects.toThrow();
  vi.useFakeTimers();
  try {
    const request = commandBridge(host as unknown as Window, {
      exec() {},
    }).status();
    const assertion = expect(request).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(4500);
    await assertion;
    expect(
      Object.values(host).every((value) => typeof value === "function"),
    ).toBe(true);
    (Object.values(host)[0] as () => void)();
    expect(Object.keys(host)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
