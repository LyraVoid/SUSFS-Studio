import type { DiagnosticBridge } from "./host";

export interface CommandBridge {
  exec(command: string, options: string, callback: string): void;
}

const executable = "/data/adb/modules/susfs_studio/bin/studioctl";
let nextId = 0;

export function execCommand(
  host: Window,
  bridge: CommandBridge,
  command: string,
  timeout = 4500,
  maximum = 512 * 1024,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const name = `studio_command_${nextId++}`;
    const callbacks = host as unknown as Record<string, unknown>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value?: string, expired = false) => {
      clearTimeout(timer);
      if (expired)
        callbacks[name] = () => {
          delete callbacks[name];
        };
      else delete callbacks[name];
      if (value === undefined) reject(new Error("Studio command failed"));
      else resolve(value);
    };
    callbacks[name] = (code: unknown, stdout: unknown) => {
      if (code !== 0 || typeof stdout !== "string" || stdout.length > maximum)
        finish();
      else finish(stdout);
    };
    timer = setTimeout(() => finish(undefined, true), timeout);
    try {
      bridge.exec(command, "{}", name);
    } catch {
      finish();
    }
  });
}

export function commandBridge(
  host: Window,
  bridge: CommandBridge,
): DiagnosticBridge {
  const call = (action: "hello" | "status") =>
    execCommand(host, bridge, `/system/bin/timeout 3 ${executable} ${action}`);
  return { hello: () => call("hello"), status: () => call("status") };
}
