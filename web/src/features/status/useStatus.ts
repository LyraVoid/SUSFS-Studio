import { useEffect, useState } from "react";
import { type DiagnosticSource, readHostStatus } from "../../transport/host";
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
  source: DiagnosticSource,
) {
  const [snapshot, setSnapshot] = useState<{
    selection: typeof selection;
    request: number;
    status: Status;
  }>();
  useEffect(() => {
    const { scenario } = selection;
    if (source.kind === "demo" && scenario === "loading") return;
    let current = true;
    const read =
      source.kind === "host"
        ? readHostStatus(source.bridge)
        : source.kind === "unavailable"
          ? Promise.resolve<Status>({ kind: "failed" })
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
  }, [selection, request, source]);
  const sameScenario = snapshot?.selection === selection;
  return {
    status: sameScenario ? snapshot.status : pending,
    stale: sameScenario && snapshot.request !== request,
  };
}
