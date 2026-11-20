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
export type Provider = {
  implementation: "builtin" | "lkm" | "unknown";
  version: string;
  kernelType: "GKI" | "unknown";
  variant?: string;
  audited?: boolean;
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
  | (Result & { device?: Device; archiveImport?: boolean })
  | { kind: "loading"; device?: never; archiveImport?: never };

const baseDevice = {
  model: "Demo A",
  system: "Android 16 (API 36)",
  kernel: "6.1.141-android14-11-o-g16e6ef702577",
};
const fixtures = {
  lkm23: {
    kind: "active",
    device: baseDevice,
    provider: {
      implementation: "lkm",
      version: "2.3.0",
      variant: "GKI-LKM",
      audited: false,
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
    provider: {
      implementation: "unknown",
      version: "2.4.0",
      kernelType: "unknown",
      capabilities: {},
    },
  },
  missing: { kind: "missing", device: baseDevice },
  unknownProtocol: { kind: "unknownProtocol", device: baseDevice },
  failed: { kind: "failed" },
} satisfies Record<Exclude<Scenario, "loading" | "workflow">, Status>;

export class MockTransport {
  async status(scenario: Exclude<Scenario, "loading">): Promise<Status> {
    await new Promise((resolve) => setTimeout(resolve, 260));
    return scenario === "workflow"
      ? { ...fixtures.lkm23, archiveImport: true }
      : fixtures[scenario];
  }
}
