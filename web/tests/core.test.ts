import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeErrorResult,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import {
  byteLength,
  validateMessage,
  localOdds,
  batchActions,
  serialize,
  deserialize,
  type Batch,
} from "../src/model";
import { ERRORS, humanError } from "../src/errors";
import { buildTransaction, type Action } from "../src/transactions";
import {
  BEG,
  IMD,
  VAULT,
  PRICE,
  vaultAbi,
  tokenAbi,
  DEPLOY_BLOCK,
} from "../src/config";
import { projectHistory, type RawLog } from "../src/events";
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
        )
      : v;
test("exact pinned ABI hashes, including all inherited errors", () => {
  const expected = {
    BegVault:
      "0xb78395d0d94547990186d2a95fba1c64e408775b66da6d528a39aedede204db4",
    LaunchToken:
      "0x38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const abi = JSON.parse(
      readFileSync(
        new URL(`../src/contracts/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(keccak256(toHex(JSON.stringify(canonical(abi)))), hash);
  }
  for (const item of vaultAbi)
    if (item.type === "error")
      assert.ok(ERRORS[item.name], `Missing custom error: ${item.name}`);
});
test("UTF-8 byte cap, multibyte text, malformed surrogate and JSON escape cap", () => {
  assert.equal(byteLength("🫠"), 4);
  assert.equal(byteLength("é"), 2);
  assert.equal(byteLength("你好"), 6);
  assert.equal(validateMessage("🫠".repeat(70)), undefined);
  assert.match(validateMessage("🫠".repeat(71))!, /4 bytes too long/);
  assert.equal(validateMessage("a".repeat(280)), undefined);
  assert.match(validateMessage("a".repeat(281))!, /1 bytes too long/);
  assert.match(validateMessage("")!, /Write your message/);
  assert.match(validateMessage(" \n ")!, /Write your message/);
  assert.match(validateMessage("a" + "\n".repeat(220))!, /escaped characters/);
  assert.match(validateMessage("\uD800")!, /incomplete Unicode/);
});
test("all 101 score distributions sum to 100% with precise floor rounding", () => {
  assert.deepEqual(localOdds(0), [1, 200, 800, 2000, 6999]);
  assert.deepEqual(localOdds(100), [200, 1300, 3000, 3500, 2000]);
  assert.deepEqual(localOdds(50), [100, 750, 1900, 2750, 4500]);
  for (let score = 0; score <= 100; score++) {
    const o = localOdds(score);
    assert.equal(
      o.reduce((a, b) => a + b),
      10000,
    );
    assert.ok(o.every((n) => Number.isInteger(n) && n >= 0));
  }
});
const batch: Batch = {
  id: "1",
  firstAttemptId: 1n,
  firstNonce: 1n,
  openedAt: 1000n,
  closedAt: 3000n,
  rollBlock: 500n,
  size: 1,
  status: 0,
  missedWindows: 0,
  lastPlayer: BEG,
  prevrandao: 0n,
  scores: 0n,
  seed: toHex(0, { size: 32 }),
};
test("keeper exact boundary conditions: no empty close, strict roll-block, timeout, rearm", () => {
  assert.equal(batchActions(batch, 2799, 500n).close, false);
  assert.equal(batchActions(batch, 2800, 500n).close, true);
  assert.equal(batchActions({ ...batch, size: 0 }, 3000, 500n).close, false);
  assert.equal(batchActions(batch, 89199, 500n).expire, false);
  assert.equal(batchActions(batch, 89200, 500n).expire, true);
  assert.equal(batchActions(batch, 89200, 500n).close, false);
  assert.equal(batchActions({ ...batch, status: 1 }, 89400, 500n).expire, true);
  assert.equal(batchActions({ ...batch, status: 2 }, 4000, 500n).reveal, false);
  assert.equal(batchActions({ ...batch, status: 2 }, 4000, 501n).reveal, true);
  assert.equal(batchActions({ ...batch, status: 2 }, 4000, 756n).rearm, false);
  assert.equal(batchActions({ ...batch, status: 2 }, 4000, 757n).rearm, true);
});
test("every write encodes an exact ABI function; ETH is attached only to attempt", () => {
  const actions: Action[] = [
    { name: "attempt", message: "please" },
    { name: "claim" },
    { name: "refund", id: 1n },
    { name: "closeBatch", id: 1n },
    { name: "reveal", id: 1n },
    { name: "expireBatch", id: 1n },
    { name: "approve", amount: 500000000000000000n },
    { name: "fundOracle", amount: 500000000000000000n },
  ];
  for (const action of actions) {
    const tx = buildTransaction(action, getAddress(BEG));
    const decoded = decodeFunctionData({
      abi: action.name === "approve" ? tokenAbi : vaultAbi,
      data: tx.data,
    });
    assert.equal(decoded.functionName, action.name);
    assert.equal(tx.to, action.name === "approve" ? IMD : VAULT);
    assert.equal(BigInt(tx.value), action.name === "attempt" ? PRICE : 0n);
    if (action.name === "fundOracle")
      assert.deepEqual(decoded.args, [action.amount]);
    if (action.name === "closeBatch") assert.deepEqual(decoded.args, [1n]);
    if (action.name === "approve")
      assert.deepEqual(decoded.args, [getAddress(VAULT), action.amount]);
  }
});
test("custom errors decode through nested provider errors, with actionable cooldown", () => {
  const data = encodeErrorResult({
    abi: vaultAbi,
    errorName: "DuplicateMessage",
  });
  assert.match(
    humanError({ data: { originalError: { data } } }),
    /already read/,
  );
  const cooldown = encodeErrorResult({
    abi: vaultAbi,
    errorName: "CooldownActive",
    args: [BigInt(Math.ceil(Date.now() / 1000) + 90)],
  });
  assert.match(humanError({ data: cooldown }), /cooldown ends in 01:3/);
  assert.match(humanError({ code: 4001 }), /Nothing was sent/);
});
test("bigint snapshot roundtrip preserves wei exactly", () => {
  const value = { amount: 2n ** 128n - 1n, batch };
  assert.deepEqual(deserialize(serialize(value)), value);
});
function log(
  eventName: string,
  args: Record<string, unknown>,
  types: readonly { type: string }[],
  data: readonly unknown[],
  i: number,
): RawLog {
  return {
    address: VAULT,
    topics: encodeEventTopics({ abi: vaultAbi, eventName, args }) as Hex[],
    data: encodeAbiParameters(types, data),
    blockNumber: toHex(DEPLOY_BLOCK + BigInt(i)),
    blockHash: toHex(i, { size: 32 }),
    transactionHash: toHex(i, { size: 32 }),
    logIndex: "0x0",
  };
}
test("events preserve untrusted text and resolve graded, rolled, expired, refunded statuses", () => {
  const malicious = '<img src=x onerror=alert(1)> & "please"';
  const logs = [
    log(
      "AttemptSubmitted",
      { attemptId: 1n, player: BEG, batchId: 1n },
      [{ type: "string" }],
      [malicious],
      1,
    ),
    log(
      "BatchClosed",
      { batchId: 1n, questionId: toHex(1, { size: 32 }) },
      [{ type: "uint256" }],
      [1n],
      2,
    ),
    log("BatchGraded", { batchId: 1n }, [{ type: "uint256[]" }], [[99n]], 3),
  ];
  let result = projectHistory({ cursor: DEPLOY_BLOCK + 10n, logs });
  assert.equal(result[0].message, malicious);
  assert.equal(result[0].score, 99);
  assert.equal(result[0].status, 2);
  logs.push(
    log(
      "Rolled",
      { attemptId: 1n, player: BEG },
      [
        { type: "uint8" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [99, 4, 5n, 6n],
      4,
    ),
  );
  result = projectHistory({ cursor: DEPLOY_BLOCK + 10n, logs });
  assert.equal(result[0].tier, 4);
  assert.equal(result[0].tokens, 5n);
  assert.equal(result[0].status, 3);
  const refundLogs = [
    log(
      "AttemptSubmitted",
      { attemptId: 2n, player: BEG, batchId: 2n },
      [{ type: "string" }],
      ["hello"],
      5,
    ),
    log("BatchExpired", { batchId: 2n }, [], [], 6),
    log(
      "Refunded",
      { attemptId: 2n, player: BEG },
      [{ type: "uint256" }],
      [PRICE],
      7,
    ),
  ];
  result = projectHistory({ cursor: DEPLOY_BLOCK + 10n, logs: refundLogs });
  assert.equal(result[0].status, 4);
  assert.equal(result[0].refunded, true);
});
