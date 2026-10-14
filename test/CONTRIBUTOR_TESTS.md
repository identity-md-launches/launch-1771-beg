# Contributor test additions

The original tests are retained. All additions run locally using the repository's existing
vendored dependencies, with no fork, network access, FFI, environment mutation, or production-code changes.

Run the complete suite with the verifier's seed:

```sh
forge build
FOUNDRY_FUZZ_SEED=0x287f067bcaead21d571f7e05e8ce91e965fed6e0cc65b39d2dec8f3c11045822 forge test
```

| File | Additional coverage |
| --- | --- |
| `AdversarialLifecycle.t.sol` | Exact cooldown/timeout/attestation boundaries; invalid configuration and unknown IDs; payment rollback; unfunded and rejected automatic closes; invalid Intake IDs; wrong-length callbacks that can be corrected; signed-field tampering and signatures for another consumer. |
| `RewardProperties.t.sol` | Monotonic odds; mixed-score rolls versus advertised intervals; overlapping batch indices/scores/randomness; player/team/revealer role overlap; refunds and prizes in one credit; claim-timing and revealer independence; repeated rearming; bounty dust; one-wei and maximum-price accounting. |
| `SiteEventsAndMessages.t.sol` | Event payloads and ordering, absence of transfers during reveal, literal scoring template, two-digit definition-key order, dirty ABI padding, buffer reuse and erasure on open-batch expiration. |
| `ClaimGuard.t.sol` | Credits are cleared at the ETH callback; nested calls to all nine mutating entry points fail with the guard error; a second claim fails without paying and later legitimate calls succeed. |
| `TokenAccountingProperties.t.sol` | Zero/self/full-supply transfers, conservation round trips, finite/infinite/revoked allowances, zero-recipient and overspending failures, atomic allowance rollback. |
| `IndependentLedgerInvariant.t.sol` | Independent cash-flow and lifecycle model, randomized operations, and withdrawal liveness after every campaign. |

The new stateful suite uses **256 runs × 96 calls**, configured inline in its test file.
It targets only eleven handler actions and uses 24 actors, including the team as a player and revealer.
It starts with graded, pending, expired and open batches so settlement/refund properties have real liabilities
from the first call. Fuzz inputs exercise oracle outages, fee changes, bad signatures, exact payments,
token/IMD/ETH donations, unsolicited ETH, block-window misses, refunds and claims.

The handler records submitted attempts, timestamps, message hashes, expected credits, fee payments and
withdrawals separately from the vault's aggregate getters. Successful operations must succeed; expected
failures check the revert reason. Its invariants check actual asset balances against cash flows and debts,
fixed token supply across all holders, separate IMD fee accounting with zero residual allowance, permanent
message reservation, attempt order, and immutable terminal batch states. Prize amounts also satisfy floor
division bounds against the sequentially available balances. `afterInvariant` expires unanswered requests,
reveals graded batches, refunds every expired entry and withdraws every actor's credits, checking that no
escrow or claim liabilities remain. A deterministic handler test covers these operations independently.

One confirmed requirement defect is reported in the root `.imd-findings.json`: a twentieth 280-byte
attempt uses **3,785,109 execution gas** with a minimal fee-pulling Intake, exceeding the requested 250,000.
Its self-contained proof was run under `test/scratch/` and failed at the gas-limit assertion. The proof
source is embedded in the finding rather than included as a failing submitted test. The original gas
measurement test is not evidence that this requirement passes.

Scope limits: mocks exercise the supplied on-chain ABI and the existing protocol conformance vector;
they do not prove live endpoint availability, off-chain scoring quality, or factory launch allocation.
The blockhash/prevrandao fixtures check the requested seed mechanics, not economic resistance to block
producers or withheld reveals. The standard launch token and IMD behavior are the supported asset model.

Final local verification: `forge build` passed; the full seeded `forge test` run passed **106 tests
across 14 suites**, with zero failures or skips. The new invariant campaign completed 24,576 handler
calls with zero handler reverts, including its final settlement and withdrawal checks. The separately
run gas-requirement proof failed as reported above.
