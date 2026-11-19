import type { Status } from "./mock";

const maxResponseBytes = 512 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStatusResponse(text: string, requestId: string): Status {
  if (new TextEncoder().encode(text).length > maxResponseBytes)
    return { kind: "failed" };
  let response: unknown;
  try {
    response = JSON.parse(text);
  } catch {
    return { kind: "failed" };
  }
  if (!record(response)) return { kind: "failed" };
  if (
    response.requestId !== requestId ||
    response.ok !== true ||
    !Number.isInteger(response.protocol)
  )
    return { kind: "failed" };
  if (response.protocol !== 1) return { kind: "unknownProtocol" };
  if (!record(response.data)) return { kind: "failed" };
  const data = response.data;
  if (
    data.kind === "missing" ||
    data.kind === "unknownProtocol" ||
    data.kind === "failed"
  )
    return { kind: data.kind };
  if (data.kind !== "active" || !record(data.provider))
    return { kind: "failed" };
  const provider = data.provider;
  if (
    (provider.implementation !== "builtin" &&
      provider.implementation !== "lkm" &&
      provider.implementation !== "unknown") ||
    (provider.kernelType !== "GKI" && provider.kernelType !== "unknown") ||
    typeof provider.version !== "string" ||
    provider.version.length === 0 ||
    provider.version.length > 128 ||
    !record(provider.capabilities)
  )
    return { kind: "failed" };
  const capabilities: Partial<
    Record<
      "paths" | "map" | "kstat" | "redirect" | "extensions",
      "available" | "unavailable" | "unknown"
    >
  > = {};
  for (const key of [
    "paths",
    "map",
    "kstat",
    "redirect",
    "extensions",
  ] as const) {
    const value = provider.capabilities[key];
    if (
      value !== undefined &&
      value !== "available" &&
      value !== "unavailable" &&
      value !== "unknown"
    )
      return { kind: "failed" };
    if (value !== undefined) capabilities[key] = value;
  }
  return {
    kind: "active",
    provider: {
      implementation: provider.implementation,
      kernelType: provider.kernelType,
      version: provider.version,
      capabilities,
    },
  };
}
