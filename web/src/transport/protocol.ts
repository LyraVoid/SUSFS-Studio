import {
  type BootFacts,
  type BootField,
  capabilityKeys,
  type Device,
  type Provider,
  type Status,
} from "./mock";

const maxResponseBytes = 512 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bootField(value: unknown, limit: number): BootField | false {
  if (
    !record(value) ||
    typeof value.value !== "string" ||
    !value.value ||
    new TextEncoder().encode(value.value).length > limit ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: runtime sources allow line breaks only.
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.value) ||
    typeof value.source !== "string" ||
    !value.source ||
    value.source.length > 128 ||
    (value.confidence !== "current-runtime" &&
      value.confidence !== "boot-image")
  )
    return false;
  return {
    value: value.value,
    source: value.source,
    confidence: value.confidence,
  };
}

function bootFacts(value: unknown): BootFacts | false {
  if (
    !record(value) ||
    typeof value.parser !== "string" ||
    !/^studio-boot-facts\/1$/u.test(value.parser) ||
    typeof value.readAt !== "number" ||
    !Number.isSafeInteger(value.readAt) ||
    (value.readAt as number) < 0 ||
    (value.readAt as number) > 8.64e12 ||
    (value.currentSlot !== null &&
      (typeof value.currentSlot !== "string" ||
        !/^[a-z0-9]{1,32}$/u.test(value.currentSlot))) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length > 32 ||
    !Array.isArray(value.slots) ||
    value.slots.length === 0 ||
    value.slots.length > 8
  )
    return false;
  const evidence: BootFacts["evidence"] = [];
  for (const item of value.evidence) {
    if (
      !record(item) ||
      typeof item.source !== "string" ||
      !item.source ||
      item.source.length > 128 ||
      (item.slot !== null &&
        (typeof item.slot !== "string" ||
          !/^[a-z0-9]{1,32}$/u.test(item.slot))) ||
      typeof item.status !== "string" ||
      !/^[a-z0-9-]{1,64}$/u.test(item.status) ||
      (item.detail !== undefined &&
        (typeof item.detail !== "string" ||
          item.detail.length > 256 ||
          item.detail.includes("\0")))
    )
      return false;
    evidence.push({
      source: item.source,
      slot: item.slot,
      status: item.status,
      ...(item.detail !== undefined && { detail: item.detail }),
    });
  }
  const ids = new Set<string>();
  let current = 0;
  const slots: BootFacts["slots"] = [];
  for (const item of value.slots) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !/^[a-z0-9]{1,32}$/u.test(item.id) ||
      ids.has(item.id) ||
      typeof item.current !== "boolean" ||
      (item.source !== "current-runtime" && item.source !== "inactive-image") ||
      (item.status !== "current-runtime" &&
        item.status !== "parsed-image" &&
        item.status !== "empty-image" &&
        item.status !== "invalid-image") ||
      !Array.isArray(item.cmdline) ||
      item.cmdline.length > 8 ||
      !Array.isArray(item.bootconfig) ||
      item.bootconfig.length > 8 ||
      (item.note !== undefined &&
        (typeof item.note !== "string" ||
          item.note.length > 256 ||
          item.note.includes("\0")))
    )
      return false;
    ids.add(item.id);
    if (item.current) current += 1;
    const release =
      item.release === undefined ? undefined : bootField(item.release, 64);
    const version =
      item.version === undefined ? undefined : bootField(item.version, 64);
    if (release === false || version === false) return false;
    const cmdline: BootField[] = [];
    for (const field of item.cmdline) {
      const parsed = bootField(field, 8 * 1024);
      if (parsed === false) return false;
      cmdline.push(parsed);
    }
    const bootconfig: BootField[] = [];
    for (const field of item.bootconfig) {
      const parsed = bootField(field, 16 * 1024);
      if (parsed === false) return false;
      bootconfig.push(parsed);
    }
    slots.push({
      id: item.id,
      current: item.current,
      source: item.source,
      status: item.status,
      ...(release !== undefined && { release }),
      ...(version !== undefined && { version }),
      cmdline,
      bootconfig,
      ...(item.note !== undefined && { note: item.note }),
    });
  }
  if (current !== 1) return false;
  return {
    parser: value.parser,
    readAt: value.readAt as number,
    currentSlot: value.currentSlot as string | null,
    evidence,
    slots,
  };
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
    bootFacts: rawBootFacts,
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
  const parsedBootFacts =
    rawBootFacts === undefined ? undefined : bootFacts(rawBootFacts);
  if (parsedBootFacts === false) return { kind: "failed", ...factsWithControl };
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
      ...(parsedBootFacts !== undefined && { bootFacts: parsedBootFacts }),
    },
  };
}
