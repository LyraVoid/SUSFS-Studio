import { ArchiveCommandError } from "./archiveError";

const idPattern = /^[0-9a-f]{32}$/;
const revisionPattern = /^[0-9a-f]{64}$/;
const planStatuses = [
  "ready",
  "applying",
  "saved",
  "applied",
  "partial",
  "failed",
  "unknown",
  "recovery_required",
  "pending_reboot",
  "deferred",
  "blocked",
  "verified",
  "idle",
] as const;
const itemStatuses = [
  "saved",
  "applying",
  "applied",
  "partial",
  "failed",
  "unknown",
  "deferred",
  "pending_reboot",
  "recovery_required",
  "blocked",
] as const;
const eligibilities = ["eligible", "blocked", "pending_reboot"] as const;

export type OperationPlanStatus = (typeof planStatuses)[number];
export type OperationItemStatus = (typeof itemStatuses)[number];
export type OperationEffectStatus = "unverified" | "partial" | "verified";
export type EffectEvidence = {
  observed: boolean;
  source: string;
  code: string;
  valueDigest?: string;
};
export type OperationItem = {
  id: string;
  idempotencyKey: string;
  category: string;
  intent: string;
  stage: string;
  eligibility: (typeof eligibilities)[number];
  reason: string;
  effectProbe: string;
  recovery: string;
  identityDigest: string;
  executionUid: number;
  status: OperationItemStatus;
  attempts: number;
  effect?: EffectEvidence;
};
export type OperationProvider = {
  implementation: "builtin" | "lkm" | "unknown";
  version: string;
  variant: string;
  audited: boolean;
  features: string[];
  bootId: string;
  uid: number;
  procNodes: string[];
};
export type OperationPlan = {
  planVersion: 2;
  id: string;
  baselineRevision?: string;
  candidateRevision: string;
  provider: OperationProvider;
  status: OperationPlanStatus;
  effectStatus: OperationEffectStatus;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  items: OperationItem[];
};
export type OperationReport = {
  planId: string;
  status: OperationPlanStatus | "recovered";
  effectStatus: OperationEffectStatus;
  saved: boolean;
  applied: string[];
  failed: Record<string, string>;
  pendingReboot: string[];
  deferred: string[];
  blocked: Record<string, string>;
  unknown: string[];
  items: OperationItem[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: protocol fields are printable labels.
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function digest(value: unknown) {
  return typeof value === "string" && revisionPattern.test(value);
}

function ids(value: unknown, itemIds?: Set<string>) {
  return (
    Array.isArray(value) &&
    value.length <= 256 &&
    value.every(
      (id: unknown) =>
        typeof id === "string" &&
        idPattern.test(id) &&
        (!itemIds || itemIds.has(id)),
    ) &&
    new Set(value).size === value.length
  );
}

function failures(value: unknown, itemIds: Set<string>) {
  if (!record(value) || Object.keys(value).length > 256)
    throw new ArchiveCommandError("BAD_RESPONSE");
  for (const [id, reason] of Object.entries(value))
    if (!idPattern.test(id) || !itemIds.has(id) || !text(reason, 512))
      throw new ArchiveCommandError("BAD_RESPONSE");
  return value as Record<string, string>;
}

function item(value: unknown): OperationItem {
  if (!record(value)) throw new ArchiveCommandError("BAD_RESPONSE");
  const status = itemStatuses.find((candidate) => candidate === value.status);
  const eligibility = eligibilities.find(
    (candidate) => candidate === value.eligibility,
  );
  if (
    typeof value.id !== "string" ||
    !idPattern.test(value.id) ||
    typeof value.idempotencyKey !== "string" ||
    !idPattern.test(value.idempotencyKey) ||
    !text(value.category, 64) ||
    !text(value.intent, 32) ||
    !text(value.stage, 32) ||
    !eligibility ||
    !text(value.reason, 512) ||
    !text(value.effectProbe, 64) ||
    !text(value.recovery, 128) ||
    !digest(value.identityDigest) ||
    !Number.isInteger(value.executionUid) ||
    (value.executionUid as number) < 0 ||
    (value.executionUid as number) > 0xffffffff ||
    !status ||
    (value.reason !== undefined && !text(value.reason, 512)) ||
    !Number.isSafeInteger(value.attempts) ||
    (value.attempts as number) < 0 ||
    (value.attempts as number) > 1000
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  let effect: EffectEvidence | undefined;
  if (value.effect !== undefined) {
    if (
      !record(value.effect) ||
      typeof value.effect.observed !== "boolean" ||
      !text(value.effect.source, 128) ||
      !text(value.effect.code, 128) ||
      (value.effect.valueDigest !== undefined &&
        !digest(value.effect.valueDigest))
    )
      throw new ArchiveCommandError("BAD_RESPONSE");
    effect = {
      observed: value.effect.observed,
      source: value.effect.source as string,
      code: value.effect.code as string,
      ...(value.effect.valueDigest !== undefined && {
        valueDigest: value.effect.valueDigest as string,
      }),
    };
  }
  return {
    id: value.id,
    idempotencyKey: value.idempotencyKey,
    category: value.category as string,
    intent: value.intent as string,
    stage: value.stage as string,
    eligibility,
    reason: value.reason as string,
    effectProbe: value.effectProbe as string,
    recovery: value.recovery as string,
    identityDigest: value.identityDigest as string,
    executionUid: value.executionUid as number,
    status,
    attempts: value.attempts as number,
    ...(effect && { effect }),
  };
}

export function parseOperationPlan(value: unknown): OperationPlan {
  if (!record(value) || value.planVersion !== 2)
    throw new ArchiveCommandError("BAD_RESPONSE");
  const status = planStatuses.find((candidate) => candidate === value.status);
  const effectStatus =
    value.effectStatus === "verified" ||
    value.effectStatus === "partial" ||
    value.effectStatus === "unverified"
      ? value.effectStatus
      : undefined;
  if (
    typeof value.id !== "string" ||
    !idPattern.test(value.id) ||
    (value.baselineRevision != null && !digest(value.baselineRevision)) ||
    !digest(value.candidateRevision) ||
    !status ||
    !effectStatus ||
    typeof value.createdAt !== "string" ||
    !/^\d+$/u.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !/^\d+$/u.test(value.updatedAt) ||
    !Array.isArray(value.items) ||
    value.items.length > 256 ||
    !record(value.provider)
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  const provider = value.provider;
  if (
    (provider.implementation !== "builtin" &&
      provider.implementation !== "lkm" &&
      provider.implementation !== "unknown") ||
    !text(provider.version, 128) ||
    !text(provider.variant, 64) ||
    typeof provider.audited !== "boolean" ||
    !Array.isArray(provider.features) ||
    provider.features.length > 256 ||
    !provider.features.every((feature: unknown) => text(feature, 160)) ||
    !text(provider.bootId, 128) ||
    !Number.isInteger(provider.uid) ||
    (provider.uid as number) < 0 ||
    (provider.uid as number) > 0xffffffff ||
    !Array.isArray(provider.procNodes) ||
    provider.procNodes.length > 64 ||
    !provider.procNodes.every((node: unknown) => text(node, 64))
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  const items = value.items.map(item);
  if (new Set(items.map((entry) => entry.id)).size !== items.length)
    throw new ArchiveCommandError("BAD_RESPONSE");
  return {
    planVersion: 2,
    id: value.id,
    ...(value.baselineRevision != null && {
      baselineRevision: value.baselineRevision as string,
    }),
    candidateRevision: value.candidateRevision as string,
    provider: {
      implementation: provider.implementation,
      version: provider.version as string,
      variant: provider.variant as string,
      audited: provider.audited,
      features: provider.features as string[],
      bootId: provider.bootId as string,
      uid: provider.uid as number,
      procNodes: provider.procNodes as string[],
    },
    status,
    effectStatus,
    ...(value.reason !== undefined && { reason: value.reason as string }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    items,
  };
}

export function parseOperationReport(value: unknown): OperationReport {
  if (!record(value) || typeof value.saved !== "boolean")
    throw new ArchiveCommandError("BAD_RESPONSE");
  const status =
    planStatuses.find((candidate) => candidate === value.status) ??
    (value.status === "recovered" ? "recovered" : undefined);
  const effectStatus =
    value.effectStatus === "verified" ||
    value.effectStatus === "partial" ||
    value.effectStatus === "unverified"
      ? value.effectStatus
      : undefined;
  if (
    typeof value.planId !== "string" ||
    !idPattern.test(value.planId) ||
    !status ||
    !effectStatus ||
    !Array.isArray(value.items) ||
    value.items.length > 256
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  const items = value.items.map(item);
  const itemIds = new Set(items.map((entry) => entry.id));
  if (
    itemIds.size !== items.length ||
    !ids(value.applied, itemIds) ||
    !ids(value.pendingReboot, itemIds) ||
    !ids(value.deferred, itemIds) ||
    !ids(value.unknown, itemIds)
  )
    throw new ArchiveCommandError("BAD_RESPONSE");
  return {
    planId: value.planId,
    status,
    effectStatus,
    saved: value.saved,
    applied: value.applied as string[],
    failed: failures(value.failed, itemIds),
    pendingReboot: value.pendingReboot as string[],
    deferred: value.deferred as string[],
    blocked: failures(value.blocked, itemIds),
    unknown: value.unknown as string[],
    items,
  };
}
