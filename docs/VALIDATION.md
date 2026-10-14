# Local validation record

Validated with Foundry 1.8.3 and the repository's pinned Solidity 0.8.26 configuration.

| Check | Result |
| --- | --- |
| `forge build` | Pass |
| `forge test` with the assignment's seed | 67 tests passed; zero failures or skips (second revision of 2026-10-14, after the dead-man path was removed) |
| Stateful accounting suite | Four invariants, 128 runs × 64 calls = 8,192 actions; zero handler reverts |
| Mixed 280-byte message gas fuzzing | 10,000 cases passed the 250,000 ceiling including conservative transaction overhead |
| `forge fmt --check` | Pass |
| Runtime / forbidden-opcode tests | Pass for both production contracts |
| Vendored file comparison | All 58 upstream source/license files match the pinned release archives |

Fuzz seed:

```
0x287f067bcaead21d571f7e05e8ce91e965fed6e0cc65b39d2dec8f3c11045822
```

Measured callee execution gas in the final fixtures (before intrinsic transaction gas; the gas
assertions add 21,000 plus a conservative calldata allowance):

| Operation | Gas |
| --- | ---: |
| Regular 280-byte ASCII entry (includes ~26.6k transaction base and calldata gas) | ~206,000 |
| 280-byte entry with quotes/backslashes (escape slow path) | ~272,000 |
| 280-byte two-byte Unicode entry | ~261,000 |
| 280-byte three-byte Unicode / emoji entry | ~256,000 |
| Twentieth 280-byte entry **including automatic close**, minimal Intake | 273,956 |
| Twentieth 280-byte entry including automatic close, recording mock | ~368,000 |

The automatic-close measurement uses a mock Intake that does not persist the JSON body. It is not
a live-mainnet gas quote, and it explicitly exceeds the requested 250k entry ceiling. Real Intake
execution adds its own costs. Full-size cold callback tests use an actual 200,000-gas subcall.

Compiled runtime sizes: `LaunchToken` 1,502 bytes; `BegVault` 17,989 bytes, both below 24,576.
Creation bytecode is fully linked. No fork, live oracle submission, deployment, or broadcast was used.
These checks are local evidence, not an independent security attestation.
