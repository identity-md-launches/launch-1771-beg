# BEG / Beg the Swarm

An Ethereum mainnet Foundry project with a fixed-supply `LaunchToken` and an immutable `BegVault`.
The vault has no owner, admin, setters, pause, upgrade, arbitrary withdrawal, or delegatecall.
All dependencies needed to build and test are ordinary source files in `lib/`.

## Build and test

```sh
forge build
FOUNDRY_FUZZ_SEED=0x287f067bcaead21d571f7e05e8ce91e965fed6e0cc65b39d2dec8f3c11045822 forge test
forge fmt --check
```

`foundry.toml` pins Solidity **0.8.26**, Cancun, optimization with 200 runs, via-IR, and
`bytecode_hash = "none"`. No network, environment reads, FFI, filesystem permissions, or RPC fork
is needed by the tests. Ethereum must support transient storage (Cancun); the reentrancy guard uses it.
See [the local validation record](docs/VALIDATION.md) for measured gas and test results.

## Deployment parameters

Deploy `src/LaunchToken.sol:LaunchToken` first, with **no constructor arguments**. Its name and
symbol are `BEG`, decimals are 18, and its entire fixed supply of `1_000_000_000 * 10^18` is minted
once to its deploying factory. The token has plain ERC-20 transfers and no special privileges.

Deploy `src/BegVault.sol:BegVault` with these six arguments, in order:

| Argument | Ethereum launch value |
| --- | --- |
| `token_` | The just-deployed `LaunchToken` (`$token` at the manifest step) |
| `team_` | `0xa7e99bb7155d7477e0c838e201b16e62b9c0b5ac` (`$owner`) |
| `intake_` | `0xa43e6f75ee006411f79ac1c84120606c2330de82` — Intake v2 |
| `imd_` | `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7` |
| `signer_` | `0x5598aa9146215bc13eb26f2c692ad1461fd32982` |
| `attemptPrice_` | `5000000000000000` wei (0.005 ETH) |

These protocol addresses come from the assignment's supplied deployment table dated 2026-10-10;
this project has not broadcast transactions or independently verified their live bytecode.
Before launch, the deployment operator must verify the addresses, signer, action availability,
and `priceOf(bytes32("oracle.request@oracle-1"), imd)` against that deployment.
The supplied reference quotes a fee of **0.5 IMD**. The vault reads the actual fee at each close.
Addresses and entry price cannot be changed after deployment. The constructor checks missing
addresses and invalid prices, but performs no external calls or code-presence checks.

“Deployer” for the team payment means the requester's supplied launch wallet, passed explicitly,
because the EVM constructor caller is the platform factory. The team address is only a beneficiary;
it has no administrative powers. Do not pass the factory or launch service wallet as `team_`.

The factory performs the launch allocation **after** both constructors: 10% to the swarm's
MerkleDistributor, 10% to the pool, and **80% directly to `BegVault`** (per the launch terms given
with this assignment). Neither constructor moves the factory's supply. A vault with no BEG rejects
attempts with `VaultEmpty`, so if the share instead lands in the requester's wallet the game cannot
start until that wallet transfers it to the vault.
This project does not contain a distributor, hook, factory, initialization guard, or `launch.json`.
The platform's later manifest step must name the application contract exactly `BegVault`.

Pool settings supplied for that step: Ethereum chain 1; paired currency native ETH; fee `12500`
(1.25%); tick spacing `60`; declared initial price `79228162514264337593543950336`.
The factory derives the effective opening price from the launch policy's 10 ETH opening market cap.

## Playing and batch transitions

1. Call `attempt(message)` with exactly `ATTEMPT_PRICE`. A message must be 1–280 **UTF-8 bytes**.
   Its exact `keccak256` is permanently reserved globally, including after a refund. Each address
   waits ten minutes between successful attempts. ETH remains escrowed until a valid grade.
2. A batch accepts up to 20 entries. Its twentieth entry automatically closes it. At or after
   30 minutes from the first entry, a new entry starts the next batch and the stale one waits for
   `closeBatch()` (closes the oldest still-open batch, `nextToClose`) or `closeBatch(batchId)`.
   Several batches may be open, pending or graded at once; play never freezes behind one batch.
3. Closing buys exactly one oracle request. Only the fixed scoring template, with the count
   replacing `N`, is the question. Definitions `"1"` … `"N"` contain the original messages in
   entry order, losslessly JSON-escaped. Player text never becomes request keys or question text.
   The panel request uses size 5, quorum 3, `allowAmbiguous: false`, panel evidence, a one-hour
   relative context window, and 86,400 seconds of attestation validity. The brief's `toleranceBps`
   is not a key the oracle reference lists and an unknown key refuses the request, so it is omitted.
   Each entry's JSON-escaped message (at most `MAX_ESCAPED_BYTES` = 400 bytes) is kept in a small
   data contract created by the entry; its address follows from the vault's creation nonce
   (`messagePointer(batchId, index)`). The closing entry's message goes straight into the question.
4. The authenticated callback clamps scores to 100, splits that batch's escrow, stores callback
   `block.prevrandao`, and sets `rollBlock = block.number + 2`. It only verifies and credits state;
   it makes no payout transfers. Team earnings are claim credits, so a rejecting team receiver
   cannot block grading.
5. Anyone calls `reveal(batchId)` after `rollBlock`, while its hash remains available. Every entry
   is processed in order, with credits deducted from the free balances before the next entry.
   A missing block hash re-arms the batch for another future block and **forfeits the highest
   remaining tier** (`missedWindows`): after one miss a Jackpot roll pays Epic and the ETH bank is
   untouched; after four misses every entry pays Nothing. Withholding a draw can therefore never buy
   a better one. Reveal within 256 blocks (about 51 minutes) to keep the full prize table.
6. Players call `claim()` for all their token and ETH credits. Refunds, team earnings, jackpots and
   revealer bounties share the ETH credit ledger. Failed transfers restore the entire credit.

Stored message words are erased on close or on expiration of an unclosed batch. Closed messages
are obtained from `AttemptSubmitted` logs, not the vault's current storage. Logs and historical
chain state remain public; erasure is not a privacy mechanism.

## Oracle funding and authentication

The live Intake accepts **IMD**, not ETH, for this action. Two separate asset budgets are necessary:

| View / method | Units and purpose |
| --- | --- |
| `oracleTokenBudget()` | Actual IMD balance available for Intake fees |
| `fundOracle(uint256 amount)` | Pull IMD from the donor after an IMD approval; emit the actual received amount |
| `oracleBudget()` | ETH from the 10% entry allocation and optional ETH donations; funds revealer bounties |
| `fundOracle()` payable | Donate ETH to that bounty budget |

There is **no implicit ETH-to-IMD conversion, exchange rate, or DEX dependency**. Donations are
non-refundable. IMD sent directly to the vault is also usable. Intake receives an exact temporary
allowance, which is cleared after the call. No escrowed entry ETH pays an oracle fee.
If the fee exceeds the IMD budget, closing reverts with `OracleUnfunded`. The twentieth entry
then also reverts atomically: the first nineteen remain, and the twentieth sender keeps its ETH.

The callback is the canonical `onOracleResult(bytes32, OracleAttestation.Attestation, bytes)`.
It accepts only Intake, a locally created matching request ID, an unsettled batch, a valid EIP-712
signature, the mainnet question chain, fresh issuance, and panel size/quorum/agreement at least
5/3/3 (agreement must also meet the signed quorum and not exceed panel size).
The protocol supports **`bytes32[]`**, not `uint256[]`: each element is the big-endian unsigned
score in one 32-byte word. The array must have exactly the batch's size.

The signing domain is `IdentityMD Oracle`, version `2`, the consumer's current chain ID and
**the vault address**. The Intake request ID and attestation's oracle UUID are different identifiers;
both are protected against repeated settlement. A relative window prevents precomputing the
question hash; the authenticated Intake writer is trusted to associate the answer with the request.
The supplied cross-implementation digest/signature vector is tested in
`test/OracleConsumerConformance.t.sol`, including the production 200,000-gas callback stipend.

## Timeouts and refunds

At `closedAt + 24 hours`, anyone can `expireBatch(batchId)` if it is still pending. A callback
arriving at or after that deadline marks it expired and returns without grading; callbacks for
already expired batches are ignored. A valid grade received earlier prevents expiration.

An **unclosed** batch also expires at `openedAt + 30 minutes + 24 hours`. This additional liveness
path covers an unfunded, unavailable, or persistently reverting Intake. It erases the open messages
and advances the open batch. After that deadline it must expire rather than close.

For either expiration path, each player calls `refund(attemptId)` once for each of their entries,
then `claim()` to receive the full entry price. `refund` creates a pull credit; it does not transfer
ETH. No team share, jackpot allocation, or bounty is taken from an expired batch. An already-paid
IMD request fee is spent and is not refunded to donors.

## Odds, balances, and randomness

For a clamped score `s`, interpolation uses integer division, rounding down:

| Tier | Basis points | Credit from current free balances |
| --- | --- | --- |
| Jackpot | `1 + floor(199*s/100)` | BEG `/100`, plus jackpot ETH bank `/2` |
| Epic | `200 + 11*s` | BEG `/2000` |
| Rare | `800 + 22*s` | BEG `/10000` |
| Common | `2000 + 15*s` | BEG `/50000` |
| Nothing | `10000 - sum(other tiers)` | zero |

The roll first checks Jackpot, then Epic, Rare, Common, Nothing against cumulative thresholds.
At score 0, Nothing is 6999 bps; at 100 it is 2000 bps. Amounts round down in minor units.
The escrow split gives `floor(escrow/10)` to the team, `min(floor(escrow/10), 0.001 ETH)` to the
ETH bounty budget (exactly one revealer bounty), and everything else to the jackpot bank. Intake is
paid in IMD, so the ETH tenth is not kept beyond what the bounty needs.

```
seed = keccak256(abi.encode(blockhash(rollBlock), storedPrevrandao, uint256(batchId), address(vault)))
r[i] = uint256(keccak256(abi.encode(seed, uint256(i)))) % 10000
```

Indices are zero-based within the batch. Free BEG is `token.balanceOf(vault) - totalClaimableTokens`.
The ETH bank excludes escrow, all outstanding credits, and the ETH oracle budget. Claiming an
existing token credit leaves free BEG unchanged. Top-ups received before reveal increase it.
The revealer receives exactly 0.001 ETH as a claim credit if the ETH oracle budget has at least
that much, otherwise zero. Rearming pays nothing.

**This is the requested block-based randomness, not verifiable randomness.** Builders/validators
can influence blocks; reveal can be withheld until a window expires; rearming and the order of
revealing different batches introduce timing choices. There is no player-supplied seed in the
contract, but that does not make the game manipulation-resistant or a VRF lottery.

## Gas and protocol limits

Measured with `vm.lastCallGas()`, which under forge includes the 21,000 transaction base and the
calldata gas (an empty call measures 21,208). ASCII 280-byte entry: about 206k; entries needing JSON
escapes or non-ASCII UTF-8 take the bytewise validator path and measure 256k–272k; the twentieth
entry that closes the batch measures 274k against a minimal fee-pulling Intake and 368k against the
recording mock; a timed close of nineteen full messages about 306k; a 20-entry reveal well under
1.5M. **The requested 250k ceiling is met for plain ASCII entries only.** The floor for the closing
entry is about 243k: three fresh storage slots the brief requires (message hash, cooldown, question
id), the Intake's own fee pull, and nineteen cold code reads at 2,600 gas each. Wallets must
estimate rather than hard-code 250k.

The regular 280-byte submission tests include conservative transaction/calldata overhead and
check a 250,000 gas ceiling, including ASCII, Unicode, and mixed messages. A cold 20-entry reveal
with twenty paying players and multiple jackpots is checked below 1.5 million gas. Scores are
packed in one slot so the callback can finish within Intake's 200,000-gas stipend.

Messages are not stored in vault storage: each non-closing entry deploys `0x00 ++ len ++ escaped`
as the code of a data contract (about 53k gas plus 204 per byte), which the close reads back with
`EXTCODECOPY`. Those contracts are immutable and are not deleted; the brief's "delete the stored
message texts" is satisfied in the sense that nothing in the vault's storage holds them. A message
whose escaped form exceeds 400 bytes (more than 120 bytes of `"`, `\\`, newline or other control
escapes) reverts `BodyTooLarge` before charging ETH, so twenty entries always fit the 16 KiB body.

## Site interface

- `openBatchId`, `getBatch(id)`: lifecycle, first entry ID, size, timestamps, question ID,
  roll block, stored randomness, packed scores, and final seed. An empty/unknown batch getter reverts.
- `getAttempt(id)`: player, batch, zero-based index, score, tier, refund flag, payout amounts,
  and message (only while that batch remains open). IDs start at one. Payout amounts are historical,
  so they remain visible after claiming. An unrolled entry's tier defaults to Nothing; consult batch status.
- `oddsFor(score)`: `(jackpot, epic, rare, common, nothing)` in basis points; input clamped to 100.
- `vaultFreeBalance`, `jackpotBank`, `oracleBudget`, `oracleTokenBudget`, `cooldownUntil(player)`.
- `claimable(player)`: `(tokens, eth)` in minor units; `escrowedETH`, `totalClaimableTokens`, and
  `totalClaimableETH` expose liabilities for independent monitoring.
- Batch status enum: `Open=0, Pending=1, Graded=2, Revealed=3, Expired=4`.
  Tier enum: `Nothing=0, Common=1, Rare=2, Epic=3, Jackpot=4`.

Events: `AttemptSubmitted`, `BatchClosed`, `BatchGraded`, `Rolled`, `BatchExpired`, `Refunded`,
`Claimed`, `OracleFunded`, and `RollRearmed`. `OracleFunded` includes the asset; its zero address
means native ETH, not an unspecified external contract. Index submissions for message history.

## No dead-man path

Nothing can rotate the signer, action or Intake, and nothing can sweep, retire or pause the vault.
BEG leaves only through roll credits, ETH only through refunds, graded-escrow splits, jackpots and
revealer bounties. An earlier revision had a permissionless `retire()` that handed the free BEG
and the ETH banks to the team after thirty days without a grade; it was removed because the brief
forbids any admin or pause and names no beneficiary but the players, and because its clock could be
started by anyone simply by leaving one batch's IMD fee unfunded. The consequence is accepted and
stated here: if the oracle stops answering forever, entries keep expiring and refunding, but the
prize pool stays in the vault until a grade arrives. Anyone can fund IMD and close a batch to resume.

## After launch

Anyone may sponsor IMD fees; bootstrap funding is required **before the first batch can close**.
Approve IMD to BegVault and call `fundOracle(amount)`. The 10% ETH allocation does not replenish IMD.
Monitor both budgets, pending deadlines, open batch deadlines and `rollBlock`. Permissionless
keepers should close timed batches, reveal promptly, re-arm missed windows, and expire timed-out
batches. Each recipient must initiate their own refunds and claims; a contract recipient must
implement those calls and be able to receive ETH. No funded wallet, private key, or off-chain
service is shipped or controlled by this repository.

There are no post-launch setters. If the protocol addresses/action or signer cease working, existing
ungraded entries can time out and refund, but this vault cannot migrate to a new oracle. Surplus
donations and forced ETH cannot be swept. A separate independent security review remains necessary
before a funded release; see [the security review notes](docs/SECURITY.md).
