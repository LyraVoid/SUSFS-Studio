import type { DiagnosticBridge } from "./host";

interface CommandBridge {
  exec(command: string, options: string, callback: string): void;
}

const executable = "/data/adb/modules/susfs_studio/bin/studioctl";
let nextId = 0;

export function commandBridge(
  host: Window,
  bridge: CommandBridge,
): DiagnosticBridge {
  const call = (action: "hello" | "status") =>
    new Promise<string>((resolve, reject) => {
      const name = `studio_diagnostic_${nextId++}`;
      const callbacks = host as unknown as Record<string, unknown>;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (value?: string, expired = false) => {
        clearTimeout(timer);
        if (expired)
          callbacks[name] = () => {
            delete callbacks[name];
          };
        else delete callbacks[name];
        if (value === undefined) reject(new Error("Diagnostic command failed"));
        else resolve(value);
      };
      callbacks[name] = (code: unknown, stdout: unknown) => {
        if (code !== 0 || typeof stdout !== "string" || stdout.length > 524288)
          finish();
        else finish(stdout);
      };
      timer = setTimeout(() => finish(undefined, true), 4500);
      try {
        bridge.exec(
          `/system/bin/timeout 3 ${executable} ${action}`,
          "{}",
          name,
        );
      } catch {
        finish();
      }
    });
  return { hello: () => call("hello"), status: () => call("status") };
}
