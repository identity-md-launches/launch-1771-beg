# Vendored sources

No dependency installation is needed for the offline verifier. `remappings.txt` resolves every
import to ordinary files in this repository; there are no submodules or package-manager downloads.

| Dependency | Source | Included |
| --- | --- | --- |
| OpenZeppelin Contracts 5.5.0 | [official tagged release](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/v5.5.0) | Unmodified Solidity import closure for this project, plus MIT license |
| forge-std 1.9.7 | [official tagged release](https://github.com/foundry-rs/forge-std/tree/v1.9.7) | Unmodified `src/`, MIT and Apache licenses |

SHA-256 of the downloaded release archives:

```
OpenZeppelin v5.5.0: 95a4e1ff7a01da7d875e7872b6160337561efd7fb0a8751de76e837a10d90cbf
forge-std v1.9.7:   45157353ab49eab01d294565866731e599b32401757229689ee459aa26b7ee94
```

`src/OracleAttestation.sol` was copied from the assignment's supplied canonical oracle reference.
Its struct, field order, type hash, domain, signature checker and decoders are preserved. The only
behavioral adaptation is making the signer immutable and removing the internal rotation hook,
as the task requires no administrator. Corresponding comments explain this adaptation. The supplied
digest, signature, chain, address and attestation test vector constants are preserved in the
conformance suite; setup instead creates a real pending BegVault batch through MockIntake.

The local mocks are test support only. Their minting/failure controls and test attester keys are
not production contracts or deployment configuration.
