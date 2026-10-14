# Local validation record

Validated with Foundry 1.8.3 and the repository's pinned Solidity 0.8.26 configuration.

| Check | Result |
| --- | --- |
| `forge build` | Pass |
| `forge test` with the assignment's seed | 60 reported tests passed; zero failures or skips |
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
| First regular 280-byte ASCII entry | 167,064 |
| 280-byte two-byte Unicode entry | 201,873 |
| 280-byte three-byte Unicode entry | 196,290 |
| 280-byte emoji entry | 187,937 |
| Twenty paying entries revealed, including multiple jackpots | 1,143,095 |
| Twentieth 280-byte entry **including automatic close** | 3,878,950 |

The automatic-close measurement uses a mock Intake that does not persist the JSON body. It is not
a live-mainnet gas quote, and it explicitly exceeds the requested 250k entry ceiling. Real Intake
execution adds its own costs. Full-size cold callback tests use an actual 200,000-gas subcall.

Compiled runtime sizes: `LaunchToken` 1,502 bytes; `BegVault` 17,989 bytes, both below 24,576.
Creation bytecode is fully linked. No fork, live oracle submission, deployment, or broadcast was used.
These checks are local evidence, not an independent security attestation.
