# Revision validation

All four reported findings reproduced against the accepted production export, then passed after focused fixes. The app retains its existing contracts, ABI, RPC transport, wallet connector, transaction builder, design tokens and dependencies. This is local worker evidence, not independent certification. No transaction was signed or broadcast.

## Findings and rechecks

| Finding | Reproduction | Fix and final result |
| --- | --- | --- |
| `f7949119…` — high, statistics overflow | Exact supplied vault and bank fixtures: document width 380px at 375px and 360px at 320px; vault amount and oracle unit escaped the panel. | `web/src/styles.css:1562`: one phone statistics column with `minmax(0, 1fr)`, no alternating vertical dividers, oracle in the same column. At 320/375/390/600/768/1440px every value fits the panel; phone values remain 20px. |
| `dc2fe3d6…` — mobile Trade hidden | The sole Uniswap anchor computed to `display:none` and was not visible at 320–600px. | `web/src/styles.css:1439`: header/actions wrap with automatic height; mobile hiding rule removed. Existing destination remains visible at all six widths, including connected-wallet checks at 320/375px. Beg remains on the first 390×844 screen, ending at approximately 540px. |
| `488ca1e8…` — invalid donation labelled approved | With 5 IMD and zero allowance, `abc`, `0`, and `0.1234567890123456789` produced “IMD approved”, no error and `aria-invalid=false`. | `web/src/App.tsx:356`, `:370`, `:1165`: derive validation on editing; reuse the precise positive/18-decimal recovery message; mark the field invalid. Approval text now requires a valid positive amount and sufficient allowance. Invalid-to-valid recovery, valid approval and donation, and invalid input after approval passed. |
| `78e00872…` — unfunded Close enabled | Open size-1 batch older than 30 minutes, budget 0.1 IMD and exact ABI-encoded `OracleUnfunded`: Close enabled before and after rejected simulation; zero sends. | `web/src/useClosePreflight.ts:11`, `web/src/App.tsx:1047`: async preflight through the existing transaction builder and RPC race. Pending/rejected checks disable Close and explain the reason. Fresh state, account/network or visible-batch changes invalidate prior checks. Send-time rejection also disables it. Budget recovery, unchanged-budget retry, zero budget and late replies after a batch transition passed. The existing immediate pre-send simulation is unchanged. |

Full finding IDs and responses are in [`.imd-responses.json`](../../.imd-responses.json). [Before measurements](before.json) contain only test UI observations; [after results](results.json) contain measured bounds, labels and regression results. These balances, messages and wallet responses are fixtures, not claims about live balances. They never enter the production bundle.

Close eligibility uses the contract's actual success/revert result, not the quoted launch fee as a hard-coded threshold. A fixture with 0.2 IMD and a successful simulation enables Close; the same budget with `OracleUnfunded` does not. Preflights cover the visible eligible batches, refresh with the normal chain snapshot, and use the existing endpoint timeouts. A successful availability check cannot guarantee later inclusion; `sendAction` still verifies and simulates again before sending.

## Checks run

| Check | Result |
| --- | --- |
| `npm --prefix web run build` | Passed after the last source edit; `dist/` regenerated with relative URLs. Final formatting produced the same tested JS/CSS asset hashes. |
| `npm --prefix web run typecheck` | Passed separately; final production build also runs `tsc --noEmit`. |
| `npm --prefix web test` | 12/12 passed, including exact ABI hashes and all eight write paths' simulation guards. |
| `node web/tests/browser.mjs --reproduce` | All four reports reproduced before editing runtime source; retained UI observations in `before.json`. This mode intentionally expects the old defects. |
| `node web/tests/browser.mjs --revision` | Passed against the final production export at `/preview/index.html`; all regressions and recovery cases above, no uncaught script errors. |
| `node web/tests/browser.mjs` | Passed the original Chromium suite, including all eight simulated write flows, rejection recovery, mainnet switching, UTF-8/duplicate validation, odds/filters, plain-text hostile messages, cached offline reads and wallet keyboard focus. |
| axe populated fixture | 29 passed checks, zero violations; manual review still required. See [accessibility results](../accessibility.json). |
| Pinned taste probe | 16/16 passed; 320/390/1440px, metadata, type scale, contrast and reduced motion. See [probe output](taste.json). |
| Lighthouse 13.0.1, mobile cold run | Performance **87**, accessibility **100**, best practices **100**, SEO **100**. LCP 2.7s, TBT 270ms, CLS 0.051. See [measurement](lighthouse.json). |
| Provided browser tool | Viewed the actual export at 390 and 1440px, confirmed loaded local font, visible trade, first-screen action, empty-message focus/error and no overflow; local resource responses all 200, zero console errors at observation. |
| WebKit | Installed, but launch failed because required browser libraries were unavailable. No Safari result claimed. See [limitation](webkit.json). |
| Whitespace, protected paths and size | `git diff --check` passed. Build/dependency configuration, locks and protected paths unchanged. One root ignore exception includes the required `.imd-responses.json`, within the existing [512-byte path budget](../path-budget.md). See [submission audit](submission-audit.json). |

The screenshot links in [the PR description](../PR.md) were refreshed from the final export. Also inspected the reproduced clipping image, the fixed 320px statistics, 390px first screen, invalid donation and unfunded Close states. No screenshot was inferred from source.

Browser checks use Playwright 1.56.1 and axe-core/playwright 4.10.2 outside the repository:

```sh
npm install --prefix /tmp/beg-revision-checks playwright@1.56.1 @axe-core/playwright@4.10.2
PLAYWRIGHT_BROWSERS_PATH=/tmp/beg-revision-browsers \
  /tmp/beg-revision-checks/node_modules/.bin/playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/beg-revision-browsers \
  BEG_PLAYWRIGHT=/tmp/beg-revision-checks/node_modules/playwright/index.mjs \
  BEG_AXE=/tmp/beg-revision-checks/node_modules/@axe-core/playwright/dist/index.mjs \
  node web/tests/browser.mjs --revision
# Omit --revision to run the original integration suite.
PLAYWRIGHT_BROWSERS_PATH=/tmp/beg-revision-browsers \
  IMD_PLAYWRIGHT=/tmp/beg-revision-checks/node_modules/playwright/index.mjs \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The pinned probe is an assignment input and is removed before submission. Its module path was supplied explicitly; no home-directory discovery was needed. Browser scripts own and close their preview servers. Lighthouse used the exported page under `/preview/` with real public RPCs and default mobile simulated throttling. The initial temporary Lighthouse launcher setup failed; using the working Playwright Chromium with an explicit debugging port produced the recorded completed run. No failed launch was represented as a score.

## Better Interface review

Read the pinned workflow, six core domains and documentation guidance; applied them only to the revision's affected surfaces. The established dark, gold and violet visual direction remains intact.

| Domain | Coverage and evidence |
| --- | --- |
| Accessibility — checked | Native controls/links retained. Invalid donation now has linked inline error and `aria-invalid`; keeper status is linked with `aria-describedby`. Browser validation exercised keyboard blur, form recovery and the original wallet focus loop. axe and rendered screenshots reviewed. Physical screen reader not tested. |
| Layout — checked | Tested realistic long balances, all six widths and connected phone headers. Measured each statistic's text bounds inside the panel; no clipping or horizontal scroll. First-screen action stays visible at 390px. Native zoom/RTL/device checks not performed. |
| Writing — checked | Reused the existing precise amount error and decoded `OracleUnfunded` funding explanation. “IMD approved” now agrees with the amount and allowance; pending Close says what is being checked. |
| Typography — checked | Full supplied amount and units retained at the original 20px phone value size; no ellipsis or font-size reduction. Existing local Space Grotesk, mono numbers and type scale retained; font load verified in browser. International fallback not exhaustively tested. |
| Colors — checked | Reused muted, error and action colors; no new palette. Existing six measured pairs remain ≥4.5:1 in [contrast results](../contrast.json); probe contrast passed. New statuses are conveyed by text/semantics, not color alone. Disabled controls and decorative eye are not claimed as text contrast measurements. |
| UI — checked | Walked unresolved, insufficient, valid, failed-send, retried and late-response Close states; invalid, recovered, approved and donated funding states. Existing native disabled controls, surfaces and motion retained. No extra animation or redesign; slow-motion playback not performed. |

Alternate themes/localization, media, drag/drop and new routes are not applicable. `DESIGN.md` now describes the implemented phone header, single-column stats, funding validation and Close preflight.

**Complete for this revision scope.** Remaining limitations: simulated transaction confirmations only; no real wallet sends, gas estimates under live contention, passkey creation, mobile wallet-app handoff, physical device, native 200% zoom, screen-reader session or WebKit render. RPCs remain external services that may fail or lag. Hosting and publication are outside this assignment.
