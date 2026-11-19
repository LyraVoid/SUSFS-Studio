import { expect, it, vi } from "vitest";
import fixtures from "../../contracts/diagnostic-v1.json";
import { diagnosticSource, readHostStatus } from "../src/transport/host";

it("treats an invalid injected bridge as an unavailable host", () => {
  expect(diagnosticSource({ studioDiagnostics: undefined } as Window)).toEqual({
    kind: "unavailable",
  });
  expect(diagnosticSource({ ksu: {} } as Window)).toEqual({
    kind: "unavailable",
  });
  expect(diagnosticSource({} as Window)).toEqual({ kind: "demo" });
});

it("reads status after a valid handshake", async () => {
  const hello = vi.fn(() => JSON.stringify(fixtures.hello));
  const status = vi.fn(() => JSON.stringify(fixtures.active));
  await expect(readHostStatus({ hello, status })).resolves.toEqual(
    fixtures.active.data,
  );
  expect(hello).toHaveBeenCalledBefore(status);
});

it("skips status on protocol mismatch", async () => {
  const status = vi.fn();
  const hello = () => JSON.stringify({ ...fixtures.hello, protocol: 2 });
  await expect(readHostStatus({ hello, status })).resolves.toEqual({
    kind: "unknownProtocol",
  });
  expect(status).not.toHaveBeenCalled();
});

it("reports a stalled host as failed", async () => {
  vi.useFakeTimers();
  try {
    const result = readHostStatus({
      hello: () => JSON.stringify(fixtures.hello),
      status: () => new Promise(() => {}),
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual({ kind: "failed" });
  } finally {
    vi.useRealTimers();
  }
});
