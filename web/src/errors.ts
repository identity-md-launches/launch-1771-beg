import { decodeErrorResult, type Hex } from "viem";
import { vaultAbi, tokenAbi } from "./config";
import { duration } from "./model";
export const ERRORS: Record<string, string> = {
  WrongPayment:
    "An attempt costs exactly 0.005 ETH, plus network gas. Refresh and try again.",
  InvalidMessageLength: "Write a message between 1 and 280 UTF-8 bytes.",
  DuplicateMessage:
    "The swarm has already read this exact message. Write something original.",
  CooldownActive:
    "Your 10-minute cooldown is still active. Wait before begging again.",
  VaultEmpty:
    "The token vault is empty. Attempts are unavailable until it holds BEG.",
  BodyTooLarge:
    "This message needs too many escape characters. Use fewer quotes, backslashes or line breaks.",
  OracleUnfunded:
    "The oracle could not accept this batch. Add IMD in “Fund the oracle”, or try again later.",
  InvalidShortString:
    "The contract could not decode a short string. Refresh and try again.",
  StringTooLong:
    "The contract received an oversized string. Shorten the message and try again.",
  InvalidConfiguration:
    "The contract configuration is invalid. This transaction cannot proceed.",
  BatchNotReady:
    "This batch cannot close yet. It needs at least one message and a completed 30-minute window.",
  InvalidQuestionId:
    "The oracle request could not be linked to this batch. Refresh its status.",
  NotIntake: "Only the oracle intake contract can submit grades.",
  UnknownBatch:
    "This batch does not exist. Refresh and choose an available batch.",
  UnknownAttempt: "This attempt does not exist. Refresh your attempts.",
  InvalidBatchState:
    "The batch changed state. Refresh and choose an available action.",
  WrongScoreCount:
    "The oracle returned the wrong number of scores. Await a valid response or the refund timeout.",
  InvalidPanel:
    "The oracle panel did not meet the required quorum. Await a valid response or the refund timeout.",
  WrongChain: "Switch your wallet to Ethereum mainnet to continue.",
  StaleAnswer:
    "The oracle answer is too old. Await a valid response or the refund timeout.",
  TooEarly:
    "This action is not ready. Wait for the displayed block or deadline.",
  BatchTimedOut: "The batch timed out. Expire it to unlock refunds.",
  NotPlayer: "Connect the wallet that submitted this attempt to refund it.",
  AlreadyRefunded:
    "This attempt is already refunded. Check your claimable ETH.",
  NothingToClaim: "There are no tokens or ETH to claim from this wallet.",
  ETHTransferFailed:
    "Your wallet could not receive ETH. Your credit remains available; try again from a compatible wallet.",
  MessageStoreFailed:
    "The message could not be stored. No attempt was recorded. Try again.",
  InvalidUTF8:
    "This message is not valid UTF-8. Remove incomplete characters and try again.",
  MalformedEscape:
    "This message contains an invalid escape sequence. Rewrite that part and try again.",
  AttestationExpired:
    "The oracle attestation expired. Await a new response or the refund timeout.",
  AttestationNotYetValid:
    "The oracle attestation is not valid yet. Wait and refresh.",
  BadSignature:
    "The oracle signature is invalid. Await a valid response or the refund timeout.",
  AlreadyConsumed:
    "This oracle response has already been processed. Refresh the batch.",
  WrongAnswerType:
    "The oracle returned an unsupported answer. Await a valid response or the refund timeout.",
  ZeroSigner: "The oracle signer is invalid. This transaction cannot proceed.",
  ReentrancyGuardReentrantCall:
    "The contract blocked a repeated call. Send one action at a time.",
  SafeERC20FailedOperation:
    "The token transfer failed. Check your balance and approval, then try again.",
  ERC20InsufficientBalance:
    "Your token balance is too low for this amount. Reduce the amount or add tokens.",
  ERC20InsufficientAllowance:
    "Approve the IMD amount first, then fund the oracle.",
  ERC20InvalidApprover:
    "This wallet cannot approve tokens. Connect a compatible wallet.",
  ERC20InvalidReceiver:
    "The token recipient is invalid. This transaction cannot proceed.",
  ERC20InvalidSender: "The token sender is invalid. Reconnect your wallet.",
  ERC20InvalidSpender:
    "The token spender is invalid. This transaction cannot proceed.",
  AddressEmptyCode:
    "The target contract is unavailable. Refresh and try again.",
  FailedCall: "The contract call failed. Refresh the state and try again.",
};
function findData(error: unknown, depth = 0): Hex | undefined {
  if (depth > 5 || error == null) return;
  if (typeof error === "string" && /^0x[0-9a-f]{8,}$/i.test(error))
    return error as Hex;
  if (typeof error === "object")
    for (const key of ["data", "cause", "error", "originalError"]) {
      const found = findData(
        (error as Record<string, unknown>)[key],
        depth + 1,
      );
      if (found) return found;
    }
}
export function humanError(error: unknown): string {
  const e = error as { code?: number; message?: string; shortMessage?: string };
  if (e?.code === 4001 || /user rejected|user denied/i.test(e?.message || ""))
    return "You declined the wallet request. Nothing was sent.";
  if (e?.code === -32002)
    return "A wallet request is already open. Check your wallet to continue.";
  const data = findData(error);
  if (data)
    try {
      const decoded = decodeErrorResult({
        abi: [...vaultAbi, ...tokenAbi],
        data,
      });
      if (decoded.errorName === "CooldownActive")
        return `Your cooldown ends in ${duration(Number(decoded.args?.[0]) - Date.now() / 1000)}. Try again then.`;
      return (
        ERRORS[decoded.errorName] ||
        `The contract rejected this action (${decoded.errorName}). Refresh and try again.`
      );
    } catch {
      /* unknown custom error remains a safe readable failure */
    }
  if (/insufficient funds/i.test(e?.message || ""))
    return "Your wallet needs more ETH to cover the payment and network gas.";
  return (
    e?.shortMessage ||
    e?.message ||
    "Unable to complete the action. Check your connection and try again."
  );
}
