import {
  capabilityKeys,
  type Device,
  type Provider,
  type Status,
} from "./mock";

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
  const facts = { ...(Object.keys(device).length ? { device } : {}) };
  let control: Status["control"];
  if (data.control !== undefined) {
    if (
      !record(data.control) ||
      typeof data.control.archiveImport !== "boolean" ||
      (data.control.providerWrite !== undefined &&
        typeof data.control.providerWrite !== "boolean") ||
      (data.control.effectVerification !== undefined &&
        typeof data.control.effectVerification !== "boolean") ||
      (data.control.adapter !== undefined &&
        data.control.adapter !== "confirmed" &&
        data.control.adapter !== "unknown" &&
        data.control.adapter !== "unsupported")
    )
      return { kind: "failed", ...facts };
    control = {
      archiveImport: data.control.archiveImport,
      providerWrite: data.control.providerWrite === true,
      effectVerification: data.control.effectVerification === true,
      adapter:
        data.control.adapter === "confirmed" ||
        data.control.adapter === "unsupported"
          ? data.control.adapter
          : "unknown",
    };
  }
  const factsWithControl = { ...facts, ...(control && { control }) };
  if (
    data.kind === "missing" ||
    data.kind === "unknownProtocol" ||
    data.kind === "failed"
  )
    return { kind: data.kind, ...factsWithControl };
  if (data.kind !== "active" || !record(data.provider))
    return { kind: "failed", ...factsWithControl };
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
    return { kind: "failed", ...factsWithControl };
  const capabilities: Provider["capabilities"] = {};
  for (const key of [...capabilityKeys, "extensions"] as const) {
    const value = provider.capabilities[key];
    if (
      value !== undefined &&
      value !== "available" &&
      value !== "unavailable" &&
      value !== "unknown"
    )
      return { kind: "failed", ...factsWithControl };
    if (value !== undefined) capabilities[key] = value;
  }
  const {
    variant,
    audited,
    features,
    staticKstatFields,
    redirectUidSchemes,
    procNodes,
  } = provider;
  if (
    (variant !== undefined &&
      (typeof variant !== "string" ||
        !/^[A-Za-z0-9_+.-]{1,64}$/u.test(variant))) ||
    (audited !== undefined && typeof audited !== "boolean") ||
    (features !== undefined &&
      (!Array.isArray(features) ||
        features.length > 256 ||
        !features.every(
          (feature: unknown) =>
            typeof feature === "string" &&
            (feature === "SUSFS_LKM_MODULES" ||
              /^CONFIG_KSU_SUSFS_[A-Z0-9_]{1,128}$/u.test(feature)),
        ) ||
        new Set(features).size !== features.length)) ||
    (staticKstatFields !== undefined &&
      (!Array.isArray(staticKstatFields) ||
        staticKstatFields.length > 64 ||
        !staticKstatFields.every(
          (field: unknown) =>
            typeof field === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(field),
        ) ||
        new Set(staticKstatFields).size !== staticKstatFields.length)) ||
    (redirectUidSchemes !== undefined &&
      (!Array.isArray(redirectUidSchemes) ||
        redirectUidSchemes.length > 64 ||
        !redirectUidSchemes.every(
          (id: unknown) =>
            typeof id === "number" &&
            Number.isInteger(id) &&
            id >= 0 &&
            id <= 0xffffffff,
        ) ||
        new Set(redirectUidSchemes).size !== redirectUidSchemes.length)) ||
    (procNodes !== undefined &&
      (!Array.isArray(procNodes) ||
        procNodes.length > 64 ||
        !procNodes.every(
          (node: unknown) =>
            typeof node === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(node),
        ) ||
        new Set(procNodes).size !== procNodes.length))
  )
    return { kind: "failed", ...factsWithControl };
  return {
    kind: "active",
    ...factsWithControl,
    provider: {
      implementation: provider.implementation,
      kernelType: provider.kernelType,
      version: provider.version,
      capabilities,
      ...(variant !== undefined && { variant }),
      ...(audited !== undefined && { audited }),
      ...(features !== undefined && { features }),
      ...(staticKstatFields !== undefined && { staticKstatFields }),
      ...(redirectUidSchemes !== undefined && { redirectUidSchemes }),
      ...(procNodes !== undefined && { procNodes }),
    },
  };
}
