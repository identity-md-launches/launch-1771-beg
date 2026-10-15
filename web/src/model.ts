import { formatUnits } from "viem";
import { BATCH_WINDOW, ORACLE_TIMEOUT } from "./config";
export type Batch = {
  id: string;
  firstAttemptId: bigint;
  firstNonce: bigint;
  openedAt: bigint;
  closedAt: bigint;
  rollBlock: bigint;
  size: number;
  status: number;
  missedWindows: number;
  lastPlayer: string;
  prevrandao: bigint;
  scores: bigint;
  seed: string;
};
export type ChainState = {
  block: bigint;
  timestamp: number;
  at: number;
  vault: bigint;
  bank: bigint;
  total: bigint;
  oracle: bigint;
  bountyBudget: bigint;
  openId: string;
  nextClose: string;
  batches: Record<string, Batch>;
};
export type Attempt = {
  id: string;
  player: string;
  batchId: string;
  message: string;
  block: number;
  tx: string;
  status: number;
  score?: number;
  tier?: number;
  tokens?: bigint;
  eth?: bigint;
  refunded?: boolean;
};
export const TIERS = ["Nothing", "Common", "Rare", "Epic", "Jackpot"];
export const STATUSES = [
  "Waiting",
  "Being judged",
  "Graded",
  "Rolled",
  "Expired",
];
export const byteLength = (s: string) => new TextEncoder().encode(s).length;
export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export function amount(value: bigint | undefined, digits = 3): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, 18));
  if (n > 0 && n < 0.001) return "<0.001";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    notation: n >= 1e7 ? "compact" : "standard",
  }).format(n);
}
export function duration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 3600)
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
export function validateMessage(message: string): string | undefined {
  const bytes = byteLength(message);
  if (!bytes || !message.trim())
    return "Give the swarm something to read. Write your message first.";
  if (bytes > 280)
    return `Your message is ${bytes - 280} bytes too long. Keep it within 280 UTF-8 bytes.`;
  if (byteLength(JSON.stringify(message).slice(1, -1)) > 400)
    return "Too many escaped characters. Use fewer line breaks, quotes or backslashes.";
  if (/\p{Surrogate}/u.test(message))
    return "Your message contains an incomplete Unicode character. Remove it and try again.";
}
export function localOdds(score: number): readonly number[] {
  const s = Math.max(0, Math.min(100, Math.floor(score)));
  const j = 1 + Math.floor((199 * s) / 100),
    e = 200 + Math.floor((1100 * s) / 100),
    r = 800 + Math.floor((2200 * s) / 100),
    c = 2000 + Math.floor((1500 * s) / 100);
  return [j, e, r, c, 10000 - j - e - r - c];
}
export function batchActions(batch: Batch, timestamp: number, block: bigint) {
  const closeAt = Number(batch.openedAt) + BATCH_WINDOW;
  const expireAt =
    batch.status === 0
      ? closeAt + ORACLE_TIMEOUT
      : Number(batch.closedAt) + ORACLE_TIMEOUT;
  return {
    close:
      batch.size > 0 &&
      batch.status === 0 &&
      timestamp >= closeAt &&
      timestamp < expireAt,
    reveal: batch.status === 2 && block > batch.rollBlock,
    expire:
      batch.size > 0 &&
      (batch.status === 0 || batch.status === 1) &&
      timestamp >= expireAt,
    rearm: batch.status === 2 && block > batch.rollBlock + 256n,
    closeAt,
    expireAt,
  };
}
export function serialize(value: unknown) {
  return JSON.stringify(value, (_k, v) =>
    typeof v === "bigint" ? { $bigint: v.toString() } : v,
  );
}
export function deserialize<T>(s: string): T {
  return JSON.parse(s, (_k, v) =>
    v && typeof v === "object" && "$bigint" in v ? BigInt(v.$bigint) : v,
  );
}
