# Submission path budget

The only ignore-file edits are `.gitignore` (at most 512 bytes) and new `web/.gitignore` (at most 256 bytes). They exclude generated dependencies and caches at every depth, and explicitly include the required static export and evidence. No build or dependency configuration of the existing Solidity project changes.

| Path | Budget | Includes |
| --- | ---: | --- |
| `web/` excluding ignored generated dependencies | 1.5 MiB | Source, exact ABIs, package manifest and lockfile, local assets, tests |
| `dist/` | 1 MiB | Complete runtime export, including lazy wallet SDK and share image |
| `artifacts/` | 2 MiB | Screenshots and validation evidence |
| `DESIGN.md`, README additions | 64 KiB | Design and install/rebuild documentation |
| `.gitignore`, `web/.gitignore` | 768 bytes total | Generated-file exclusions and required-output inclusions |

Total complete submission bundle cap: 8,388,608 bytes. Existing contract source, tests, and dependencies are retained. No dependency archives, npm cache, `node_modules`, or Git submodules are introduced into the submission. Final measured file totals are in `validation.md`.
