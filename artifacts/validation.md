# Website validation record

## Scope and outcome

**Complete for the requested implementation and production-export scope**, with the external/device limitations below. This is the worker's own evidence, not independent certification. No real wallet transaction was signed or broadcast, and nothing was published or deployed.

| Area | Actual result |
| --- | --- |
| Production export | `dist/index.html` and all local assets present; relative Vite base `./` |
| Production build | `npm --prefix web run build` passed; final build also runs `tsc --noEmit` |
| Separate typecheck | `npm --prefix web run typecheck` passed |
| Focused tests | `npm --prefix web test`: 12 tests, 12 passed, 0 failed |
| Browser interaction validation | Chromium against the production export at `/preview/index.html`: passed |
| All write paths | Eight exact transaction simulations before wallet sends, with mocked RPC and wallet confirmations |
| Responsive widths | 320, 375, 390, 768 and 1440px; no horizontal overflow |
| Product on first 390px screen | Yes: headline, textarea, byte count, 0.005 ETH price and Beg action |
| Design probe | 16/16 final checks passed |
| axe populated fixture | 29 checks passed, 0 violations; 1 rule group requires manual review |
| Lighthouse mobile | Cold runs: performance 91 and 88; accessibility 100/100; best practices 96/100; SEO 100/100 |
| Source/ABI verification | Both canonical ABI hashes match pinned deployment values; compiled vault entries match verified Blockscout |
| Live read observation | Vault free balance 800M BEG, zero attempts and oracle budget at observation time; no fabricated messages |
| Submission size | See final file audit at the end; below the 8 MiB cap |

The visual idea is a single swarm eye made of violet particles watching a compact, gold-action message form. The exact palette and requested text guided the design. Source stays in the existing contract repository, under the separate `web/` frontend; Solidity configuration and dependencies were preserved.

## Requirement coverage

| Brief requirement | Implementation/evidence |
| --- | --- |
| Dark, playful eye; exact headline/subline | `Swarm.tsx`, hero in `App.tsx`, live hero screenshot |
| Read without a wallet | Public RPC summary and events load before connection; actual live screenshots |
| Max 280 UTF-8 bytes | `TextEncoder` counter; ASCII/multibyte/invalid-surrogate/escaped-body tests; 284-byte emoji input blocked in Chromium |
| 0.005 ETH and wallet chain 1 | Exact wei constant, verified `ATTEMPT_PRICE()`, auto switch, second network/account check before send |
| Cooldown, duplicate and length prechecks | Exact cooldown/usedMessage reads, keccak256 of raw UTF-8, inline recovery instructions |
| Every custom error | All 37 BegVault ABI errors have human explanations; tests enumerate coverage; relevant token errors also mapped |
| Vault, ETH bank, total, batch/window, IMD budget | Contract reads at a single block; last-good cache, refresh age, 30-minute first-entry timer |
| Exact odds and prizes | `oddsFor` read; local contract formula is explicitly labelled while waiting/offline; all 101 scores sum to 10,000 bps |
| Live feed and all statuses | Chunked vault logs from verified deployment block; event projection tests; raw message text, player, batch and tx links |
| Scores, tier stamps and prizes | Populated fixture screenshot; score/tier/credit decoding tests |
| Highest 10 scores/all jackpots | Deterministic sorting, separate jackpot filter, load-more pagination; partial-history label |
| Personal attempts, claims, refunds | Connected-wallet filtering, claim credits, expired-attempt refund controls; separate refund/claim explanation |
| Keeper actions | Exact overloaded close function, strict `block > rollBlock`, expiry deadline; zero oracle-budget close disabled; rearm consequences and bounty shown |
| Approve IMD then fundOracle(uint256) | Default 0.5 IMD; exact allowance approval and separate donation; no payable ETH overload is used |
| Five steps/split/immutability/refunds | Rules section, exact capped-bounty qualification to nominal 80/10/10 split, source and explorer links |
| RPC fallback/timeout/cache/refresh | Three provided endpoints, staggered race, 4-second per-endpoint timeout, failed-transport cooldown, local summary and IndexedDB logs, 15-second refresh |
| Deploy-block discovery and history | Blockscout deploy transaction confirms 26,193,895; 2,000-block log chunks, adaptive smaller retries, 64-block reorg overlap |
| EIP-6963 wallet discovery | Named providers, no relay, browser fallback, chain switching; discovery/rejection/recovery exercised |
| Mobile connectors | Local wallet marks, vendor URL handoffs; lazy Coinbase Smart Wallet, no project ID; physical-device flows unverified |
| No backend/analytics/trackers | Static output; external read endpoints and explicitly selected wallet services only |
| Metadata and static export | Title, description, favicon, og:title, 1200×630 local `og:image`; files resolve at a subpath |
| Design/README/screenshots | Root `DESIGN.md`, updated README, `artifacts/PR.md` with each section's image |

## Commands and evidence

The task supplied the pinned design probe as an input. It was run from the repository root:

```sh
npm --prefix web run build
npm --prefix web run typecheck
npm --prefix web test
PLAYWRIGHT_BROWSERS_PATH=/tmp/beg-browsers \
  IMD_PLAYWRIGHT=/tmp/beg-checks/node_modules/playwright/index.mjs \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The probe itself is an assignment input and is removed before submission. Its actual final result is retained in [`taste.json`](taste.json), rather than shipping the external probe or temporary screenshots. [`PR.md`](PR.md) links durable section screenshots taken from the final export.

Browser testing is reproducible from delivered `web/tests/browser.mjs`. Browser dependencies are deliberately outside the source and submission. The validation used Playwright 1.56.1 and axe-core/playwright 4.10.2:

```sh
npm install --prefix /tmp/beg-checks playwright@1.56.1 @axe-core/playwright@4.10.2
PLAYWRIGHT_BROWSERS_PATH=/tmp/beg-browsers \
  /tmp/beg-checks/node_modules/.bin/playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/beg-browsers \
  BEG_PLAYWRIGHT=/tmp/beg-checks/node_modules/playwright/index.mjs \
  BEG_AXE=/tmp/beg-checks/node_modules/@axe-core/playwright/dist/index.mjs \
  node web/tests/browser.mjs
```

The script owns and closes its temporary static server and browser. It exercises the actual production bundle. A test-only provider and exact ABI-encoded RPC fixtures cover all eight writes: `attempt`, `claim`, `refund`, `closeBatch(uint256)`, `expireBatch`, `reveal`, `approve`, `fundOracle(uint256)`. It checks the exact simulated `from/to/data/value` against each wallet send. Separate tests confirm that every write is blocked by a failed `eth_call`, and that duplicate/cooldown/chain/account failures produce no send.

Browser interactions also check: empty and overlong input focus/errors, UTF-8 count, named EIP-6963 discovery, wallet rejection and retry, automatic switch from another chain, receipt confirmation, draft clearing only after success, odds extremes, feed and hall filtering, literal hostile HTML, funding allowance progression, narrow reflow, six actual contrast pairs, modal keyboard wrapping, Escape/focus return, and cache-first offline reload. Results are in [`browser-results.json`](browser-results.json). The fixture address is a supplied public contract address used only as a simulated account; no private/test key is used, and no fixture data is in the runtime bundle.

Lighthouse 13.0.1 used default mobile simulated throttling, a cold cache and real public RPCs, against the final local export under a subpath. [`lighthouse.json`](lighthouse.json) retains the two actual runs, metric values and failed audit names. Final LCP was 2.6s and 3.2s, total blocking time 170ms and 70ms, and CLS 0.049 and 0.047. The first run's best-practices reduction came from external RPC console/network errors. Static cache-header suggestions depend on the eventual host and are not claimed resolved. Source JS is split so the Coinbase SDK is only loaded for that connection path.

## Better Interface six-domain review

The pinned workflow and core principles of all six domains were read and used during implementation. The source review and rendered inspections were consolidated here. Both initial and final mobile/desktop screenshots were inspected. The final wallet screenshot was also viewed to confirm the visible keyboard ring.

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native controls, labels, heading hierarchy, live/error regions, skip link, modal semantics; browser validation/error focus, Tab wrap, Escape and return focus; axe found 0 violations. No physical screen-reader session. |
| Layout | Checked | First-screen main action at 390, actual screenshots at 390/1440, programmatic overflow checks at 320/375/390/768/1440, all section captures. No native 200% zoom, RTL locale or physical-device test. |
| Writing | Checked | Short exact hero; local errors state how to recover; public message and payment consequences near controls; explicit cached/partial/empty states; accurate donation/refund and capped-bounty language. |
| Typography | Checked | Six-size maximum per viewport; two font families and three weights; numbers mono, prose sans; mobile inputs 16px; long hostile message wraps. Probe confirms size/family limits. Non-Latin system fallback not exhaustively reviewed. |
| Colors | Checked | Six actual rendered pairs measured at ≥4.5:1 in `contrast.json`; probe passed contrast; state names accompany colors. Gold button 13.01:1; Nothing red on its panel 5.80:1. Decorative translucent eye and disabled controls are not treated as prose contrast measurements. |
| UI | Checked | Loading, empty, populated, failure, retry, pending and confirmed paths; flat surfaces, coherent radii; visible focused wallet row; one-shot eye pulse; probe found no reduced-motion animation. Physical touch feedback and animation-panel slow playback unverified. |

Not applicable: alternate theme, localization switching, rich-text editor, drag/drop, video/audio and multi-route navigation. These were not added to fill the guide's checklist.

## Findings, fixes and rechecks

Source locations refer to final source; the finding describes the earlier behavior and its correction.

1. **Medium, writing: stacked two-beat slogans.** `web/src/App.tsx:552` (`message-hint`) and repeated section copy produced six flagged fragments. The first probe showed the repeated structure. Replaced the form hint with UTF-8/public-message guidance, simplified feed copy and made the rules heading direct. Final probe: one deliberate immutable-rules line; slogans check passed.
2. **Medium, layout: bounty label looked like an eyebrow above the funding heading.** `web/src/App.tsx:995` (`bounty-note`). Moved the bounty into Batch controls beside the action it describes. Final desktop capture and eyebrow check passed.
3. **High, interaction: simulation rejection could cool down healthy RPCs.** `web/src/rpc.ts:75` (`error.code !== undefined`). A browser fixture returning a JSON-RPC revert without data made the next action fail as a network error. Cooldown now applies to transport failure, not semantic RPC errors; all-endpoint network failure can retry after a connection recovers. The full browser sequence now completes a subsequent claim and all other writes after the deliberate failed simulation.
4. **High, accessibility: Tab could leave the wallet sheet at its final control.** `web/src/WalletSheet.tsx:37` (`onKeyDown`). Keyboard testing reproduced the end-of-sequence escape. Added first/last focus wrapping while retaining the native dialog, Escape behavior and inert backdrop. Final test performs nine Tab presses, then Escape and verifies trigger focus; the final wallet image shows the ring.
5. **Medium, accessibility: custom accessible names could differ from visible label text.** `web/src/App.tsx:435` (wordmark) and footer copy button. Lighthouse reported a label/name mismatch. Removed redundant labels so the native visible text supplies the name. The final Lighthouse reports contain no label-content-name-mismatch finding.
6. **Medium, interaction: draft clearing and old-account read races.** `web/src/App.tsx:245` (`submittedMessage`) and `:183` (`currentAddress`). Source review found premature draft clearing on send and possible late balance updates from a previous account. Drafts clear only on successful confirmation if unchanged; responses are ignored after an account changes. Browser success/reset and failure-retention paths passed.
7. **Medium, data responsiveness: a long event scan shared the summary refresh lock.** `web/src/useChain.ts:49` (`updateHistory`). Source review found that indexing could delay the 15-second summary schedule. Separate history and summary locks now allow summary refresh while indexing. Chunk progress remains cached independently; offline/cached render tests passed. Very large multi-year histories were not load-tested.

8. **Medium, accessibility: score stamp names needed an explicit semantic role.** `web/src/App.tsx:88` (`score-stamp`). The manual-review group in axe corresponded to labelled generic score containers. Added `role="img"` so the stamp announces its complete score label as one graphic; rechecked the populated fixture.

All reproduced high/medium findings above were corrected before the final build. The first probe had 14/16 passes; the final probe has 16/16. No unaddressed repository-side blocker is known.

## Limitations

- The browser runs and real read-only RPC checks are actual; transaction confirmations in tests are simulated. No mainnet gas was spent. Real wallet confirmations, Coinbase passkey creation, phone app handoffs and gas pricing were not tested with a funded user account.
- PublicNode supplied live reads. LlamaRPC returned CORS failures intermittently; Cloudflare and the other endpoints may independently fail, lag or rate-limit. Such failures appear as cached/unavailable state and are not represented as zero balances. A simulation cannot guarantee a later mined transaction succeeds; state may change before inclusion.
- WebKit was installed but could not launch because required host system libraries were unavailable. This is recorded as unperformed, not a Safari pass. Chromium and the provided browser tool were used successfully.
- Native 200% browser zoom, physical devices, a real screen reader, full RTL and full international-font coverage were not tested. axe also flags a manual-review group for contrast; selected actual contrast pairs, native semantics, keyboard behavior and screenshots were reviewed, not claimed as a full accessibility certification.
- Event history is browser-local and rebuildable from public chain logs. An initial long history scan may take time; rankings say when they are partial. Reorg recovery overlaps 64 blocks; deeper reorganizations require clearing site storage. The public RPCs must retain the requested log history.
- Hosting, publishing and creation of the network's final PR occur outside this work. A ready PR body and linked screenshot files are delivered; the export was not hosted or published by the worker.

## Final file and bundle audit

The complete submission tree is about **4.4 MB uncompressed**, including the existing Solidity dependency sources. The production export is about **681 kB**. An isolated full clone of the named upstream repository was used to form a candidate commit containing the entire deliverable and create a complete Git bundle with upstream history. It measures approximately **2.1 MB**; the final audit asserts it remains below a conservative **3 MiB** ceiling, well under **8,388,608 bytes**. The task repository's Git metadata is read-only and was not changed. The temporary audit repository and bundle are outside the submission.

`submission-audit.json` records the file counts, raw byte totals, path totals and bundle ceiling. Generated dependencies and caches are excluded at every depth. No submodule, dependency archive, source map, private configuration or test key is included. Every relative entrypoint asset exists, and the share image is a valid PNG. `git diff --check` passed; the protected Solidity configuration/dependency paths have no diff. Final evidence is self-reported and does not certify behavior beyond the checks described above.
