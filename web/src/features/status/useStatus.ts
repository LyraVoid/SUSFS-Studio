import { useEffect, useState } from "react";
import { type DiagnosticBridge, readHostStatus } from "../../transport/host";
import {
  MockTransport,
  type Scenario,
  type Status,
} from "../../transport/mock";

const transport = new MockTransport();
const pending: Status = { kind: "loading" };

export function useStatus(
  selection: { scenario: Scenario },
  request: number,
  bridge?: DiagnosticBridge,
) {
  const [snapshot, setSnapshot] = useState<{
    selection: typeof selection;
    request: number;
    status: Status;
  }>();
  useEffect(() => {
    const { scenario } = selection;
    if (!bridge && scenario === "loading") return;
    let current = true;
    const read = bridge
      ? readHostStatus(bridge)
      : scenario === "loading"
        ? Promise.resolve(pending)
        : transport.status(scenario);
    void read.then(
      (status) => {
        if (current) setSnapshot({ selection, request, status });
      },
      () => {
        if (current)
          setSnapshot({ selection, request, status: { kind: "failed" } });
      },
    );
    return () => {
      current = false;
    };
  }, [selection, request, bridge]);
  const sameScenario = snapshot?.selection === selection;
  return {
    status: sameScenario ? snapshot.status : pending,
    stale: sameScenario && snapshot.request !== request,
  };
}
