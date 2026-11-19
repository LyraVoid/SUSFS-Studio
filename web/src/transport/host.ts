import type { Status } from "./mock";
import { parseStatusResponse } from "./protocol";

export interface DiagnosticBridge {
  hello(): string | Promise<string>;
  status(): string | Promise<string>;
}

declare global {
  interface Window {
    studioDiagnostics?: DiagnosticBridge;
    ksu?: unknown;
  }
}

export type DiagnosticSource =
  | { kind: "demo" }
  | { kind: "host"; bridge: DiagnosticBridge }
  | { kind: "unavailable" };

export function diagnosticSource(host: Window): DiagnosticSource {
  if ("studioDiagnostics" in host) {
    const bridge = host.studioDiagnostics;
    return bridge &&
      typeof bridge.hello === "function" &&
      typeof bridge.status === "function"
      ? { kind: "host", bridge }
      : { kind: "unavailable" };
  }
  return "ksu" in host ? { kind: "unavailable" } : { kind: "demo" };
}

export async function readHostStatus(
  bridge: DiagnosticBridge,
): Promise<Status> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Diagnostic timeout")), 5000);
    });
    const hello = await Promise.race([
      deadline,
      Promise.resolve().then(() => bridge.hello()),
    ]);
    if (typeof hello !== "string" || hello.length > 1024)
      return { kind: "failed" };
    const response = JSON.parse(hello);
    if (
      response?.requestId !== "hello" ||
      response.ok !== true ||
      !Number.isInteger(response.protocol)
    )
      return { kind: "failed" };
    if (response.protocol !== 1) return { kind: "unknownProtocol" };
    if (response.data !== "studioctl") return { kind: "failed" };
    const status = await Promise.race([
      deadline,
      Promise.resolve().then(() => bridge.status()),
    ]);
    return typeof status === "string"
      ? parseStatusResponse(status, "status")
      : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
