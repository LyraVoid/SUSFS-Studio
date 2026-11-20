export const scenarios = [
  "lkm23",
  "workflow",
  "builtin24",
  "unknownImplementation",
  "loading",
  "missing",
  "unknownProtocol",
  "failed",
] as const;
export type Scenario = (typeof scenarios)[number];
export const capabilityKeys = [
  "priorityUidFilter",
  "hideMounts",
  "logging",
  "avcSpoof",
  "uname",
  "cmdline",
  "paths",
  "map",
  "kstat",
  "fullClone",
  "staticKstat",
  "redirect",
  "hiddenModules",
  "mountPrefixes",
] as const;
export type Capability = (typeof capabilityKeys)[number];
export type Availability = "available" | "unavailable" | "unknown";
export type Device = { model?: string; system?: string; kernel?: string };
export type Control = {
  archiveImport: boolean;
  providerWrite: boolean;
  effectVerification: boolean;
  adapter: "confirmed" | "unknown" | "unsupported";
};
export type Provider = {
  implementation: "builtin" | "lkm" | "unknown";
  version: string;
  kernelType: "GKI" | "unknown";
  variant?: string;
  audited?: boolean;
  features?: string[];
  capabilities: Partial<Record<Capability | "extensions", Availability>>;
  staticKstatFields?: string[];
  redirectUidSchemes?: number[];
};
type Result =
  | {
      kind: "active";
      provider: Provider;
    }
  | { kind: "missing" | "unknownProtocol" | "failed" };
export type Status =
  | (Result & { device?: Device; control?: Control })
  | { kind: "loading"; device?: never; control?: never };

const baseDevice = {
  model: "Demo A",
  system: "Android 16 (API 36)",
  kernel: "6.1.141-android14-11-o-g16e6ef702577",
};
const demoControl: Control = {
  archiveImport: true,
  providerWrite: false,
  effectVerification: false,
  adapter: "confirmed",
};
const fixtures = {
  lkm23: {
    kind: "active",
    device: baseDevice,
    control: demoControl,
    provider: {
      implementation: "lkm",
      version: "2.3.0",
      variant: "GKI-LKM",
      audited: true,
      features: [
        "SUSFS_LKM_MODULES",
        "CONFIG_KSU_SUSFS_SUS_PATH",
        "CONFIG_KSU_SUSFS_SUS_MAP",
        "CONFIG_KSU_SUSFS_SUS_KSTAT",
        "CONFIG_KSU_SUSFS_OPEN_REDIRECT",
        "CONFIG_KSU_SUSFS_SUS_MOUNT",
        "CONFIG_KSU_SUSFS_ENABLE_LOG",
        "CONFIG_KSU_SUSFS_SPOOF_UNAME",
        "CONFIG_KSU_SUSFS_SPOOF_CMDLINE_OR_BOOTCONFIG",
      ],
      kernelType: "GKI",
      capabilities: {
        paths: "available",
        map: "unknown",
        kstat: "unknown",
        redirect: "unavailable",
        hiddenModules: "available",
        mountPrefixes: "available",
      },
    },
  },
  builtin24: {
    kind: "active",
    control: demoControl,
    device: {
      ...baseDevice,
      model: "Demo B",
      kernel: "6.6.118-android16-8-demo",
    },
    provider: {
      implementation: "builtin",
      version: "2.4.0",
      variant: "GKI",
      audited: true,
      features: [
        "CONFIG_KSU_SUSFS_SUS_PATH",
        "CONFIG_KSU_SUSFS_SUS_MAP",
        "CONFIG_KSU_SUSFS_SUS_KSTAT",
        "CONFIG_KSU_SUSFS_OPEN_REDIRECT",
      ],
      staticKstatFields: ["size", "ctime_sec"],
      redirectUidSchemes: [0, 1, 2],
      kernelType: "GKI",
      capabilities: {
        paths: "available",
        map: "available",
        kstat: "unknown",
        redirect: "available",
        staticKstat: "available",
        fullClone: "available",
        hiddenModules: "unavailable",
        mountPrefixes: "unavailable",
      },
    },
  },
  unknownImplementation: {
    kind: "active",
    device: baseDevice,
    control: demoControl,
    provider: {
      implementation: "unknown",
      version: "2.4.0",
      kernelType: "unknown",
      audited: false,
      features: ["SUSFS_LKM_MODULES"],
      capabilities: {},
    },
  },
  missing: { kind: "missing", device: baseDevice, control: demoControl },
  unknownProtocol: {
    kind: "unknownProtocol",
    device: baseDevice,
    control: demoControl,
  },
  failed: { kind: "failed", control: demoControl },
} satisfies Record<Exclude<Scenario, "loading" | "workflow">, Status>;

export class MockTransport {
  async status(scenario: Exclude<Scenario, "loading">): Promise<Status> {
    await new Promise((resolve) => setTimeout(resolve, 260));
    return scenario === "workflow" ? fixtures.lkm23 : fixtures[scenario];
  }
}
