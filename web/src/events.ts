import { decodeEventLog, type Hex } from "viem";
import { CACHE_KEY, DEPLOY_BLOCK, VAULT, vaultAbi } from "./config";
import { deserialize, serialize, type Attempt } from "./model";
import { rpc } from "./rpc";
import { hexBlock } from "./chain";
export type RawLog = {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: Hex;
  removed?: boolean;
};
export type History = { cursor: bigint; logs: RawLog[] };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(CACHE_KEY, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("history");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function getHistory(): Promise<History> {
  try {
    const d = await db();
    const stored = await new Promise<string | undefined>((resolve, reject) => {
      const r = d.transaction("history").objectStore("history").get("logs");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (stored) return deserialize<History>(stored);
  } catch {
    /* private mode / disabled storage: keep reading in memory */
  }
  return { cursor: DEPLOY_BLOCK - 1n, logs: [] };
}
async function saveHistory(value: History) {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("history", "readwrite");
      t.objectStore("history").put(serialize(value), "logs");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* storage is an optimization, never a dependency */
  }
}
/** All vault events, in bounded ranges. Re-read the last 64 blocks to replace shallow reorgs. */
export async function syncHistory(
  previous: History,
  head: bigint,
  progress: (h: History) => void,
  signal: AbortSignal,
): Promise<History> {
  let from =
    previous.cursor >= DEPLOY_BLOCK ? previous.cursor - 63n : DEPLOY_BLOCK;
  if (from < DEPLOY_BLOCK) from = DEPLOY_BLOCK;
  let history: History = {
    cursor: from - 1n,
    logs: previous.logs.filter((l) => BigInt(l.blockNumber) < from),
  };
  let chunk = 2000n;
  while (from <= head && !signal.aborted) {
    const to = from + chunk - 1n < head ? from + chunk - 1n : head;
    let logs: RawLog[];
    try {
      logs = await rpc<RawLog[]>("eth_getLogs", [
        { address: VAULT, fromBlock: hexBlock(from), toBlock: hexBlock(to) },
      ]);
    } catch (e) {
      if (chunk > 100n) {
        chunk /= 2n;
        continue;
      }
      throw e;
    }
    if (!Array.isArray(logs))
      throw new Error(
        "The RPC returned invalid event history. Retry the feed.",
      );
    if (signal.aborted) return previous;
    const valid = logs.filter(
      (l) =>
        !l.removed &&
        l.address.toLowerCase() === VAULT &&
        BigInt(l.blockNumber) >= from &&
        BigInt(l.blockNumber) <= to,
    );
    history = { cursor: to, logs: [...history.logs, ...valid] };
    await saveHistory(history);
    progress(history);
    from = to + 1n;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return history;
}
export function projectHistory(history: History): Attempt[] {
  const attempts = new Map<string, Attempt>();
  const batches = new Map<string, { status: number; scores?: number[] }>();
  const sorted = [...history.logs].sort(
    (a, b) =>
      Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) ||
      Number(BigInt(a.logIndex) - BigInt(b.logIndex)),
  );
  for (const log of sorted) {
    try {
      const event = decodeEventLog({
        abi: vaultAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      const a = event.args as unknown as Record<string, unknown>;
      const id = String(a.attemptId),
        batchId = String(a.batchId);
      if (event.eventName === "AttemptSubmitted")
        attempts.set(id, {
          id,
          player: String(a.player),
          batchId,
          message: String(a.message),
          block: Number(BigInt(log.blockNumber)),
          tx: log.transactionHash,
          status: 0,
        });
      if (event.eventName === "BatchClosed")
        batches.set(batchId, { status: 1 });
      if (event.eventName === "BatchGraded")
        batches.set(batchId, {
          status: 2,
          scores: (a.scores as bigint[]).map(Number),
        });
      if (event.eventName === "BatchExpired")
        batches.set(batchId, { status: 4 });
      if (event.eventName === "Rolled") {
        const entry = attempts.get(id);
        if (entry)
          Object.assign(entry, {
            status: 3,
            score: Number(a.score),
            tier: Number(a.tier),
            tokens: BigInt(String(a.tokenAmount)),
            eth: BigInt(String(a.ethAmount)),
          });
      }
      if (event.eventName === "Refunded") {
        const entry = attempts.get(id);
        if (entry) entry.refunded = true;
      }
    } catch {
      /* unrelated events from the exact ABI have no feed representation */
    }
  }
  const indexes = new Map<string, number>();
  for (const attempt of attempts.values()) {
    const index = indexes.get(attempt.batchId) || 0;
    indexes.set(attempt.batchId, index + 1);
    const batch = batches.get(attempt.batchId);
    if (batch && attempt.status !== 3) {
      attempt.status = batch.status;
      if (batch.scores) attempt.score = batch.scores[index];
    }
  }
  return [...attempts.values()].reverse();
}
