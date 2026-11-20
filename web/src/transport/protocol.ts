import type { Device, Status } from "./mock";

const maxResponseBytes = 512 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStatusResponse(text: string, requestId: string): Status {
  if (
    text.length > maxResponseBytes ||
    new TextEncoder().encode(text).length > maxResponseBytes
  )
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
  const device: Device = {};
  if (record(data.device)) {
    for (const key of ["model", "system", "kernel"] as const) {
      const value = data.device[key];
      if (
        typeof value === "string" &&
        value.length <= 256 &&
        value.trim() &&
        // biome-ignore lint/suspicious/noControlCharactersInRegex: device labels must be printable.
        !/[\u0000-\u001f\u007f]/u.test(value)
      ) {
        device[key] = value;
      }
    }
  }
  const facts = {
    ...(Object.keys(device).length ? { device } : {}),
    ...(record(data.control) && data.control.archiveImport === true
      ? { archiveImport: true }
      : {}),
  };
  if (
    data.kind === "missing" ||
    data.kind === "unknownProtocol" ||
    data.kind === "failed"
  )
    return { kind: data.kind, ...facts };
  if (data.kind !== "active" || !record(data.provider))
    return { kind: "failed", ...facts };
  const provider = data.provider;
  if (
    (provider.implementation !== "builtin" &&
      provider.implementation !== "lkm" &&
      provider.implementation !== "unknown") ||
    (provider.kernelType !== "GKI" && provider.kernelType !== "unknown") ||
    typeof provider.version !== "string" ||
    !provider.version.trim() ||
    provider.version.length > 128 ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: provider labels must be printable.
    /[\u0000-\u001f\u007f]/u.test(provider.version) ||
    !record(provider.capabilities)
  )
    return { kind: "failed", ...facts };
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
      return { kind: "failed", ...facts };
    if (value !== undefined) capabilities[key] = value;
  }
  return {
    kind: "active",
    ...facts,
    provider: {
      implementation: provider.implementation,
      kernelType: provider.kernelType,
      version: provider.version,
      capabilities,
    },
  };
}
