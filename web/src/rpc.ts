import { RPC_URLS } from "./config";
export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}
export type RpcRequest = { method: string; params: unknown[] };
let sequence = 0;
const unavailableUntil = new Map<string, number>();
/** Race independent endpoints; a JSON-RPC error is never a good answer. Every fetch has a 4s deadline. */
export async function rpcBatch(requests: RpcRequest[]): Promise<unknown[]> {
  const body = requests.map((r) => ({ jsonrpc: "2.0", id: ++sequence, ...r }));
  // A restored connection can retry immediately even if every endpoint failed earlier.
  if (RPC_URLS.every((url) => (unavailableUntil.get(url) || 0) > Date.now()))
    unavailableUntil.clear();
  const controllers = RPC_URLS.map(() => new AbortController());
  try {
    return await Promise.any(
      RPC_URLS.map(async (url, i) => {
        // Hedge slower fallbacks; a fast healthy primary avoids needless preflights.
        if (i > 0)
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, i * 250);
            controllers[i].signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new Error("RPC race completed."));
              },
              { once: true },
            );
          });
        if (controllers[i].signal.aborted)
          throw new Error("RPC race completed.");
        if ((unavailableUntil.get(url) || 0) > Date.now())
          throw new Error(
            "RPC endpoint is cooling down after a network error.",
          );
        const timer = setTimeout(() => controllers[i].abort(), 4000);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body.length === 1 ? body[0] : body),
            signal: controllers[i].signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok)
            throw new RpcError(`RPC returned HTTP ${response.status}.`);
          const payload = await response.json();
          const rows = Array.isArray(payload) ? payload : [payload];
          return body.map((item) => {
            const row = rows.find((r) => r.id === item.id);
            if (!row)
              throw new RpcError("The RPC returned an incomplete response.");
            if (row.error)
              throw new RpcError(
                row.error.message || "RPC request failed.",
                row.error.code,
                row.error.data,
              );
            if (row.result === undefined)
              throw new RpcError("The RPC returned no result.");
            return row.result;
          });
        } catch (error) {
          if (
            !controllers[i].signal.aborted &&
            !(error instanceof RpcError && error.code !== undefined)
          )
            unavailableUntil.set(url, Date.now() + 60000);
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }),
    );
  } catch (error) {
    if (error instanceof AggregateError) {
      const revert = error.errors.find(
        (e) =>
          e instanceof RpcError &&
          (e.data || e.code === 3 || /revert/i.test(e.message)),
      );
      if (revert) throw revert;
    }
    throw new RpcError(
      "Ethereum RPCs are unavailable. Check your connection and try again.",
    );
  } finally {
    controllers.forEach((c) => c.abort());
  }
}
export async function rpc<T = unknown>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  return (await rpcBatch([{ method, params }]))[0] as T;
}
