# Security review notes

This is a local design/code review and test record, not an independent audit or live-chain validation.

## Boundaries checked

- All public state transitions are permissionless except the callback (immutable Intake only) and
  per-player refunds/claims. There are no role assignments, configuration setters or escape opcodes.
- The launch token mints once, to its constructor caller; app construction does not access another
  contract or move the supply. The wallet beneficiary is explicit rather than `msg.sender` or `tx.origin`.
- Entry funds are accounted for in exactly one place: escrow, bank, ETH oracle budget, or claim credits.
  State-machine invariant tests check conservation and sum the individual credits after randomized
  entries, time advances, closes, callbacks, expiry, reveal, funding, refunds and claims.
- Every external mutating entry point uses the same transient reentrancy guard. Claim performs all
  accounting before SafeERC20 and ETH interactions. Failed ETH or token sends revert the whole claim.
  Grading/reveal/refund use pull credits, so a rejecting beneficiary cannot stop others settling.
- Oracle fee approvals are exact and cleared. Fees use IMD donations, never player ETH escrow.
  Failed closes roll back the fee, ID counters, messages and any automatic twentieth entry.
- Callback authentication checks the source, locally issued question ID, lifecycle, signed panel,
  chain, issuance/expiration, signature, answer type/count and one-use oracle UUID. Late callbacks
  cannot settle even if expiry has not yet been called. The supplied independent signature vector
  verifies domain/type compatibility; cold full-size callbacks are exercised under a 200,000-gas call.
- The UTF-8 validator is compared against a separate codepoint decoder. ASCII vector counting is
  checked against per-byte reference calculations and JSON parsing. Messages cannot insert JSON keys.
- Payout calculations exclude reserved tokens and update free balances after each entry. Exact tier
  tests and sequential models include multiple jackpots, later donations, earlier unclaimed credits,
  bounty availability, zero scores, clamping and rounding. Reveal performs no payout transfers.
- Message and batch loops are bounded. Scores use 160 bits for twenty 8-bit values. Amount credits
  use 128-bit halves; the standard token's entire 10^27 supply fits. The price is positive and at most
  uint96, so a 20-entry escrow conversion fits in uint128. Cumulative balances use checked arithmetic.
  Timestamp/block/ID packing assumes fewer than 2^40 timestamp seconds and 2^64 blocks/entries.

## Explicit limitations and assumptions

1. The requested randomness is economically influenceable. Validators can affect block values,
   participants/keepers can withhold reveal, and rearming permits later random draws. Anyone can
   choose the order of different batch reveals, which changes their available prize balances. No
   security claim equivalent to VRF is made. No alternative randomness mechanism was substituted.
2. The oracle panel and its signer are trusted for scoring. Signature verification does not prove a
   message deserved a score. Five seats and three agreements are the requested parameters, not Sybil
   resistance. Protocol writer binding of a callback to a request is trusted for the relative window.
3. One immutable signer and Intake cannot rotate locally. External protocol failure can permanently
   stop future grading. Timeouts preserve entry refunds; already-spent donor IMD fees cannot be recovered.
   There is deliberately no dead-man, retire or sweep path: a permanent oracle outage leaves the
   prize pool in the vault rather than giving anyone, the team included, a way to take it or to
   close the game. The brief forbids an admin or pause, and a timed sweep could be armed by anyone
   who let one batch's IMD fee go unfunded.
4. The oracle fee asset and entry fee asset differ. ETH revenue funds bounties, while independent IMD
   funding remains an operational responsibility. The project intentionally includes no unrequested
   exchange route or configurable keeper with access to escrow.
5. Full auto-close cannot satisfy the literal 250k entry gas ceiling, and the preallocated message
   buffer does not obtain ordinary zero-slot deletion refunds. See README for the explicit gas tradeoff.
6. Invalid UTF-8 and overflowing JSON body budgets are refused before entry. This prevents paid but
   structurally unprocessable questions, but adds limits beyond message byte count alone.
7. Global duplicate detection exposes a mempool front-running opportunity: copying an unused message
   can reserve it first. Cooldown is per address and does not prevent Sybil entry. Both follow the brief.
8. Production supports the supplied standard BEG token and IMD fee asset. A malicious/rebasing
   substitute token, hostile oracle implementation or incorrect constructor values is outside that model.
9. A contract player must be able to call `refund`/`claim` and receive ETH. There is no alternate-recipient
   redirect or admin rescue. Forced ETH can create unaccounted surplus but cannot reduce backing.

## Validation

The submitted tests cover both success and failure, fuzz odds/JSON/gas/payouts, compare the protocol
conformance vector, and run four stateful accounting invariants. They use the requested deterministic
fuzz seed and no network/environment lookups. Runtime size and forbidden-opcode tests mirror the
supplied platform floor. No test-only function or key is present in a production contract.

The required tools are Foundry build, tests and formatter. No Slither/Mythril run or independent
adversarial contributor review is claimed. The deployment operator must still verify the supplied
mainnet endpoints and complete the platform's separate manifest and review steps.
