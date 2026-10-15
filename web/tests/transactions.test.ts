import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  getAddress,
  toHex,
  type Hex,
} from "viem";
import { BEG, IMD, PRICE, VAULT, vaultAbi, tokenAbi } from "../src/config";
import { sendAction, type Action } from "../src/transactions";
import type { Provider } from "../src/wallet";
const runtime = readFileSync(
  new URL("./fixtures/vault-runtime.hex", import.meta.url),
  "utf8",
).trim();
const address = getAddress(BEG);
const actions: Action[] = [
  { name: "attempt", message: "A test plea; never submitted to mainnet." },
  { name: "claim" },
  { name: "closeBatch", id: 1n },
  { name: "reveal", id: 1n },
  { name: "expireBatch", id: 1n },
  { name: "refund", id: 1n },
  { name: "approve", amount: 500000000000000000n },
  { name: "fundOracle", amount: 500000000000000000n },
];
function fixture({
  duplicate = false,
  cooldown = 0n,
  revert = false,
  chain = "0x1",
} = {}) {
  const trace: string[] = [];
  let simulated: unknown;
  let sent: unknown;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    function response(q: { id: number; method: string; params: any[] }) {
      trace.push(q.method);
      let result: unknown;
      if (q.method === "eth_chainId") result = "0x1";
      if (q.method === "eth_getCode") result = runtime;
      if (q.method === "eth_estimateGas") result = toHex(150000);
      if (q.method === "eth_call") {
        const tx = q.params[0],
          abi = tx.to.toLowerCase() === IMD ? tokenAbi : vaultAbi;
        const { functionName } = decodeFunctionData({ abi, data: tx.data });
        trace.push(`call:${functionName}`);
        const reads: Record<string, unknown> = {
          token: BEG,
          imd: IMD,
          ATTEMPT_PRICE: PRICE,
          cooldownUntil: cooldown,
          usedMessage: duplicate,
        };
        if (functionName in reads)
          result = encodeFunctionResult({
            abi,
            functionName,
            result: reads[functionName],
          });
        else {
          simulated = tx;
          if (revert)
            return {
              jsonrpc: "2.0",
              id: q.id,
              error: {
                code: 3,
                message: "execution reverted",
                data: encodeErrorResult({
                  abi: vaultAbi,
                  errorName: "InvalidBatchState",
                }),
              },
            };
          result = "0x";
        }
      }
      return { jsonrpc: "2.0", id: q.id, result };
    }
    return new Response(
      JSON.stringify(Array.isArray(body) ? body.map(response) : response(body)),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const provider: Provider = {
    request: async ({ method, params }) => {
      trace.push(`wallet:${method}`);
      if (method === "eth_chainId") return chain;
      if (method === "eth_accounts") return [address];
      if (method === "eth_sendTransaction") {
        sent = params?.[0];
        return toHex(1771, { size: 32 });
      }
      throw new Error("Unexpected wallet method");
    },
  };
  return {
    provider,
    trace,
    get simulated() {
      return simulated;
    },
    get sent() {
      return sent;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
test("all eight write paths simulate the exact from/to/data/value before sending", async () => {
  for (const action of actions) {
    const f = fixture();
    try {
      const stages: string[] = [];
      await sendAction(f.provider, address, action, (s) => stages.push(s));
      assert.ok(
        f.trace.indexOf(`call:${action.name}`) <
          f.trace.indexOf("wallet:eth_sendTransaction"),
      );
      const { gas, ...sent } = f.sent as Record<string, unknown>;
      assert.deepEqual(sent, f.simulated);
      assert.equal(gas, toHex(180000));
      assert.ok(stages.includes("Simulating transaction…"));
    } finally {
      f.restore();
    }
  }
});
test("a failed eth_call prevents all eight writes from reaching the wallet", async () => {
  for (const action of actions) {
    const f = fixture({ revert: true });
    try {
      await assert.rejects(() =>
        sendAction(f.provider, address, action, () => {}),
      );
      assert.ok(!f.trace.includes("wallet:eth_sendTransaction"));
    } finally {
      f.restore();
    }
  }
});
test("wrong chain, duplicate and cooldown never prompt a transaction", async () => {
  for (const options of [
    { chain: "0xa" },
    { duplicate: true },
    { cooldown: BigInt(Math.floor(Date.now() / 1000) + 120) },
  ]) {
    const f = fixture(options);
    try {
      await assert.rejects(() =>
        sendAction(f.provider, address, actions[0], () => {}),
      );
      assert.ok(!f.trace.includes("wallet:eth_sendTransaction"));
    } finally {
      f.restore();
    }
  }
});
test("a changed wallet account after simulation aborts safely", async () => {
  const f = fixture();
  let calls = 0;
  const provider: Provider = {
    request: async (args) => {
      if (args.method === "eth_accounts" && ++calls === 2)
        return [getAddress(VAULT)];
      return f.provider.request(args);
    },
  };
  try {
    await assert.rejects(
      () => sendAction(provider, address, actions[1], () => {}),
      /account changed/,
    );
    assert.ok(!f.trace.includes("wallet:eth_sendTransaction"));
  } finally {
    f.restore();
  }
});
