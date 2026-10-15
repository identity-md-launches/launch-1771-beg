import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { IMD, PRICE, VAULT, vaultAbi, tokenAbi } from "./config";
import { read, verifyContract } from "./chain";
import { validateMessage, duration } from "./model";
import { rpc } from "./rpc";
import { assertWallet, type Provider } from "./wallet";
export type Action =
  | { name: "attempt"; message: string }
  | { name: "claim" }
  | { name: "closeBatch" | "reveal" | "expireBatch" | "refund"; id: bigint }
  | { name: "approve" | "fundOracle"; amount: bigint };
export function buildTransaction(action: Action, from: Address) {
  const args =
    action.name === "attempt"
      ? [action.message]
      : action.name === "approve"
        ? [VAULT, action.amount]
        : action.name === "fundOracle"
          ? [action.amount]
          : "id" in action
            ? [action.id]
            : [];
  return {
    from,
    to: action.name === "approve" ? IMD : VAULT,
    data: encodeFunctionData({
      abi: action.name === "approve" ? tokenAbi : vaultAbi,
      functionName: action.name,
      args,
    }),
    value: toHex(action.name === "attempt" ? PRICE : 0n),
  };
}
export async function sendAction(
  provider: Provider,
  from: Address,
  action: Action,
  stage: (s: string) => void,
): Promise<Hex> {
  stage("Checking Ethereum…");
  await assertWallet(provider, from);
  await verifyContract();
  if (action.name === "attempt") {
    const invalid = validateMessage(action.message);
    if (invalid) throw new Error(invalid);
    const [cooldown, used] = await Promise.all([
      read<bigint>("cooldownUntil", [from]),
      read<boolean>("usedMessage", [keccak256(stringToHex(action.message))]),
    ]);
    if (Number(cooldown) > Date.now() / 1000)
      throw new Error(
        `Your cooldown ends in ${duration(Number(cooldown) - Date.now() / 1000)}. Try again then.`,
      );
    if (used)
      throw new Error(
        "The swarm has already read this exact message. Write something original.",
      );
  }
  if ("amount" in action && action.amount <= 0n)
    throw new Error("Enter an IMD amount greater than zero.");
  const tx = buildTransaction(action, from);
  stage("Simulating transaction…");
  await rpc("eth_call", [tx, "latest"]);
  const estimated = await rpc<Hex>("eth_estimateGas", [tx]);
  await assertWallet(provider, from);
  stage("Confirm in your wallet…");
  return (await provider.request({
    method: "eth_sendTransaction",
    params: [{ ...tx, gas: toHex((BigInt(estimated) * 120n) / 100n) }],
  })) as Hex;
}
export async function receipt(
  hash: Hex,
): Promise<"pending" | "success" | "reverted"> {
  const r = await rpc<{ status: Hex } | null>("eth_getTransactionReceipt", [
    hash,
  ]);
  return r === null ? "pending" : r.status === "0x1" ? "success" : "reverted";
}
