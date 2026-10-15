import {
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  type Abi,
  type Address,
  type Hex,
  toHex,
} from "viem";
import {
  VAULT,
  BEG,
  IMD,
  RUNTIME_HASH,
  PRICE,
  vaultAbi,
  tokenAbi,
} from "./config";
import { rpc, rpcBatch } from "./rpc";
import type { Batch, ChainState } from "./model";
export function callRequest(
  name: string,
  args: readonly unknown[] = [],
  address: Address = VAULT,
  abi: Abi = vaultAbi,
  block = "latest",
) {
  return {
    method: "eth_call",
    params: [
      {
        to: address,
        data: encodeFunctionData({ abi, functionName: name, args }),
      },
      block,
    ],
  };
}
export function decode<T>(name: string, data: unknown, abi: Abi = vaultAbi): T {
  return decodeFunctionResult({
    abi,
    functionName: name,
    data: data as Hex,
  }) as T;
}
export async function read<T>(
  name: string,
  args: readonly unknown[] = [],
  address: Address = VAULT,
  abi: Abi = vaultAbi,
): Promise<T> {
  const request = callRequest(name, args, address, abi);
  return decode<T>(name, await rpc(request.method, request.params), abi);
}
export async function verifyContract(): Promise<void> {
  const [chain, code, token, imd, price] = await rpcBatch([
    { method: "eth_chainId", params: [] },
    { method: "eth_getCode", params: [VAULT, "latest"] },
    callRequest("token"),
    callRequest("imd"),
    callRequest("ATTEMPT_PRICE"),
  ]);
  if (
    chain !== "0x1" ||
    typeof code !== "string" ||
    keccak256(code as Hex) !== RUNTIME_HASH ||
    decode<string>("token", token).toLowerCase() !== BEG ||
    decode<string>("imd", imd).toLowerCase() !== IMD ||
    decode<bigint>("ATTEMPT_PRICE", price) !== PRICE
  ) {
    throw new Error(
      "Contract verification failed. Transactions are disabled. Check Ethereum mainnet and refresh.",
    );
  }
}
export async function loadState(batchIds: string[] = []): Promise<ChainState> {
  const block = await rpc<Hex>("eth_blockNumber");
  const names = [
    "vaultFreeBalance",
    "jackpotBank",
    "nextAttemptId",
    "oracleTokenBudget",
    "oracleBudget",
    "openBatchId",
    "nextToClose",
  ];
  const values = await rpcBatch([
    { method: "eth_getBlockByNumber", params: [block, false] },
    ...names.map((n) => callRequest(n, [], VAULT, vaultAbi, block)),
  ]);
  const header = values[0] as { timestamp: string; number: string } | null;
  if (!header || header.number !== block)
    throw new Error("Unable to verify the latest Ethereum block. Try again.");
  const [vault, bank, next, oracle, bountyBudget, open, nextClose] = names.map(
    (n, i) => BigInt(decode<bigint>(n, values[i + 1])),
  );
  const ids = [
    ...new Set([open.toString(), nextClose.toString(), ...batchIds]),
  ].filter((id) => BigInt(id) > 0n && BigInt(id) <= open);
  const batches: Record<string, Batch> = {};
  // Bound individual RPC batch size for public endpoint limits.
  for (let offset = 0; offset < ids.length; offset += 30) {
    const chunk = ids.slice(offset, offset + 30);
    const rows = await rpcBatch(
      chunk.map((id) =>
        callRequest("getBatch", [BigInt(id)], VAULT, vaultAbi, block),
      ),
    );
    rows.forEach((row, i) => {
      batches[chunk[i]] = {
        ...decode<Omit<Batch, "id">>("getBatch", row),
        id: chunk[i],
      };
    });
  }
  return {
    block: BigInt(block),
    timestamp: Number(BigInt(header.timestamp)),
    at: Date.now(),
    vault,
    bank,
    total: next - 1n,
    oracle,
    bountyBudget,
    openId: open.toString(),
    nextClose: nextClose.toString(),
    batches,
  };
}
export type UserState = {
  tokens: bigint;
  eth: bigint;
  cooldown: number;
  allowance: bigint;
  imd: bigint;
  at: number;
};
export async function loadUser(address: Address): Promise<UserState> {
  const requests = [
    callRequest("claimable", [address]),
    callRequest("cooldownUntil", [address]),
    callRequest("allowance", [address, VAULT], IMD, tokenAbi),
    callRequest("balanceOf", [address], IMD, tokenAbi),
  ];
  const data = await rpcBatch(requests);
  const credit = decode<readonly [bigint, bigint]>("claimable", data[0]);
  return {
    tokens: credit[0],
    eth: credit[1],
    cooldown: Number(decode<bigint>("cooldownUntil", data[1])),
    allowance: decode<bigint>("allowance", data[2], tokenAbi),
    imd: decode<bigint>("balanceOf", data[3], tokenAbi),
    at: Date.now(),
  };
}
export async function contractOdds(score: number) {
  return (await read<readonly bigint[]>("oddsFor", [BigInt(score)])).map(
    Number,
  );
}
export const hexBlock = (n: bigint) => toHex(n);
