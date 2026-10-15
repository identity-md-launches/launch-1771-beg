import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { batchActions, type ChainState } from "./model";
import { buildTransaction } from "./transactions";
import { rpc } from "./rpc";
import { humanError } from "./errors";

type Check = { ready: boolean; message: string; failedOnSend?: boolean };

/** Availability only: sendAction still simulates again immediately before sending. */
export function useClosePreflight(
  state: ChainState | undefined,
  from: Address | undefined,
  enabled: boolean,
  limit: number,
) {
  // A refreshed budget/batch, account change or stale read invalidates old results
  // during render, before the next effect starts its requests.
  const scope = useMemo(() => ({}), [state, from, enabled, limit]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [result, setResult] = useState<{
    scope: object;
    checks: Record<string, Check>;
  }>({ scope, checks: {} });

  useEffect(() => {
    let active = true;
    if (!enabled || !state || !from || state.oracle === 0n) return;
    const batches = Object.values(state.batches)
      .filter((b) => b.size > 0 && b.status < 3)
      .sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)))
      .slice(0, limit)
      .filter((b) => batchActions(b, state.timestamp, state.block).close);
    for (const b of batches) {
      const finish = (check: Check) => {
        if (!active) return;
        setResult((previous) => {
          if (!active || currentScope.current !== scope) return previous;
          const checks = previous.scope === scope ? previous.checks : {};
          // A later send-time revert takes precedence over an in-flight check.
          if (checks[b.id]?.failedOnSend) return previous;
          return { scope, checks: { ...checks, [b.id]: check } };
        });
      };
      void rpc("eth_call", [
        buildTransaction({ name: "closeBatch", id: BigInt(b.id) }, from),
        "latest",
      ]).then(
        () => finish({ ready: true, message: "" }),
        (error) => finish({ ready: false, message: humanError(error) }),
      );
    }
    return () => {
      active = false;
    };
  }, [scope, state, from, enabled, limit]);

  return {
    checks: result.scope === scope ? result.checks : {},
    reject(id: string, message: string) {
      const latest = currentScope.current;
      setResult((previous) => ({
        scope: latest,
        checks: {
          ...(previous.scope === latest ? previous.checks : {}),
          [id]: { ready: false, message, failedOnSend: true },
        },
      }));
    },
  };
}
