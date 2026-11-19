export const scenarios = [
  "lkm23",
  "builtin24",
  "unknownImplementation",
  "loading",
  "missing",
  "unknownProtocol",
  "failed",
] as const;
export type Scenario = (typeof scenarios)[number];
export type Capability = "paths" | "map" | "kstat" | "redirect" | "extensions";
export type Availability = "available" | "unavailable" | "unknown";
export type Device = { model?: string; system?: string; kernel?: string };
type Result =
  | {
      kind: "active";
      provider: {
        implementation: "builtin" | "lkm" | "unknown";
        version: string;
        kernelType: "GKI" | "unknown";
        capabilities: Partial<Record<Capability, Availability>>;
      };
    }
  | { kind: "missing" | "unknownProtocol" | "failed" };
export type Status =
  | (Result & { device?: Device })
  | { kind: "loading"; device?: never };

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
      kernelType: "GKI",
      capabilities: {
        paths: "available",
        map: "unknown",
        kstat: "unknown",
        redirect: "unavailable",
        extensions: "available",
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
      kernelType: "GKI",
      capabilities: {
        paths: "available",
        map: "available",
        kstat: "unknown",
        redirect: "available",
        extensions: "unavailable",
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
} satisfies Record<Exclude<Scenario, "loading">, Status>;

export class MockTransport {
  async status(scenario: Exclude<Scenario, "loading">): Promise<Status> {
    await new Promise((resolve) => setTimeout(resolve, 260));
    return fixtures[scenario];
  }
}
