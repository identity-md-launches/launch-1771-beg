# Contributor test additions

The original tests are retained. All additions run locally using the repository's existing
vendored dependencies, with no fork, network access, FFI, environment mutation, or production-code changes.
This revision re-targets the additions at the builder's revised `BegVault` (`BatchView` getter,
question ids via `questionBatch`, messages in nonce-derived data contracts, `closeBatch(uint256)`,
stale batches left to the close cursor, tier forfeiture on missed windows, the implemented escrow
split, and the `retire()` dead-man path).

Run the complete suite with the verifier's seed:

```sh
forge build
FOUNDRY_FUZZ_SEED=0x287f067bcaead21d571f7e05e8ce91e965fed6e0cc65b39d2dec8f3c11045822 forge test
```

| File | Additional coverage |
| --- | --- |
| `AdversarialLifecycle.t.sol` | Exact cooldown/timeout/attestation boundaries; invalid configuration (price above `uint80`) and unknown ids; payment rollback; unfunded and rejected automatic closes (now `OracleUnfunded`) with the closing entry located without a stored record; invalid Intake ids; wrong-length callbacks that can be corrected; signed-field tampering and signatures for another consumer; a stale open batch left behind by a late entry and closed by the cursor or by id; a timed-out stale batch that blocks only the cursor until expired; `retire()` guards (30 days after an expiry, reset by any grade, blocked by unrevealed grades) and the retired state's solvency, refunds and `VaultRetired` rejections. |
| `RewardProperties.t.sol` | Monotonic odds; mixed-score rolls versus advertised intervals; overlapping batch indices/scores/randomness; player/team/revealer role overlap; refunds and prizes in one credit; claim-timing and revealer independence; repeated rearming with the tier cap after three misses; bounty dust; one-wei and maximum-price (`uint80`) accounting against the implemented split. |
| `SiteEventsAndMessages.t.sol` | Event payloads and ordering, absence of transfers during reveal, literal scoring template, two-digit definition-key order, dirty ABI padding, message pointers across the auto-close nonce skew (including a quoted/escaped Unicode message read back into the body), and messages served only while a batch is open. |
| `ClaimGuard.t.sol` | Credits are cleared at the ETH callback; nested calls to all eleven mutating entry points fail with the guard error; a second claim fails without paying and later legitimate calls succeed. |
| `TokenAccountingProperties.t.sol` | Zero/self/full-supply transfers, conservation round trips, finite/infinite/revoked allowances, zero-recipient and overspending failures, atomic allowance rollback. |
| `IndependentLedgerInvariant.t.sol` | Independent cash-flow and lifecycle model, randomized operations including by-id closes, stale batches, long warps and retirement, and withdrawal liveness after every campaign. |

The stateful suite uses **256 runs × 96 calls**, configured inline in its test file. It targets
thirteen handler actions and 24 actors, including the team as a player, revealer and sweep beneficiary.
It starts with graded, pending, expired and open batches so settlement/refund properties have real
liabilities from the first call. Fuzz inputs exercise oracle outages, fee changes, bad signatures,
exact payments, token/IMD/ETH donations, unsolicited ETH, block-window misses (with the tier cap),
late entries that open a new batch, refunds, claims and the 30-day retirement path.

The handler records attempts, timestamps, message hashes, expected credits, fee payments and
withdrawals separately from the vault's aggregate getters, and tracks the open batch id, the close
cursor, the auto-close count, `failingSince`, `unrevealedGraded` and `retired` independently.
Successful operations must succeed; expected failures check the revert reason. Its invariants check
asset balances against cash flows and debts, fixed token supply across all holders, separate IMD fee
accounting with the standing allowance, permanent message reservation, attempt order, per-entry tiers
against the advertised odds and the forfeiture cap, floor-division payout bounds against the
sequentially available balances, and immutable terminal batch states. `afterInvariant` expires
unanswered requests, reveals graded batches, refunds every expired entry and withdraws every actor's
credits, checking that no escrow or claim liabilities remain. Two deterministic handler tests cover
these operations independently.

Findings are reported in the root `.imd-findings.json` rather than asserted as correct:

- `retire()` can hand the whole prize pool and ETH banks to the team after one expired batch and 30
  quiet days, and then pauses play, where the brief forbids any admin or pause (medium, with proof).
- `attempt()` exceeds the brief's 250k gas ceiling for a 280-byte message in every shape except plain
  ASCII: 281,231 call gas for the batch-closing twentieth entry, 282,191 for text needing JSON
  escapes, 270,668 for two-byte UTF-8 (medium, with proof). The builder's gas tests assert 300k/400k.
- The escrow split is `floor(10%)` team, `min(10%, 0.001 ETH)` bounty budget, remainder jackpot,
  not the brief's 80/10/10 (low); missed reveal windows forfeit tiers (info); message data contracts
  are never deleted (info).

Both proofs were run from `test/scratch/` and fail on the current code for the stated reasons.

Scope limits: mocks exercise the supplied on-chain ABI and the existing protocol conformance vector;
they do not prove live endpoint availability, off-chain scoring quality, or factory launch allocation.
The blockhash/prevrandao fixtures check the requested seed mechanics, not economic resistance to block
producers or withheld reveals. The standard launch token and IMD behavior are the supported asset model.
