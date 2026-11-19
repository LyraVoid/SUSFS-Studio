import { useEffect, useState } from "react";
import {
  MockTransport,
  type Scenario,
  type Status,
} from "../../transport/mock";

const transport = new MockTransport();
const pending: Status = { kind: "loading" };

export function useStatus(selection: { scenario: Scenario }, request: number) {
  const [snapshot, setSnapshot] = useState<{
    selection: typeof selection;
    request: number;
    status: Status;
  }>();
  useEffect(() => {
    const { scenario } = selection;
    if (scenario === "loading") return;
    let current = true;
    void transport.status(scenario).then(
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
  }, [selection, request]);
  const sameScenario = snapshot?.selection === selection;
  return {
    status: sameScenario ? snapshot.status : pending,
    stale: sameScenario && snapshot.request !== request,
  };
}
