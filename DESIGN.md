# Beg the Swarm design system

## Overview

A single-page Ethereum game where a public plea is the main interaction. The visual idea is one violet eye assembled from small agent dots, watching a compact gold-accented message form. The page uses the requested near-black background, warm gold actions and jackpot, violet oracle elements, and red Nothing results. It is playful in headings and plain in transaction instructions.

The form appears before the stats and remains above the fold at 390 × 844. Empty states describe actual chain availability; no example players or invented balances ship in the application. Layout primitives and tokens live in [web/src/styles.css](web/src/styles.css); components live in [web/src/App.tsx](web/src/App.tsx).

## Colors

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#07070B` | Page and pupil |
| `--surface` | `#101015` | Form, stat strip, message bubbles, odds panel |
| `--raised` | `#17171F` | Secondary buttons, selected filters, wallet rows |
| `--border` | `#2B2B36` | Separators and panel structure |
| `--text` | `#F4F1EA` | Headings and primary prose |
| `--muted` | `#A6A4B3` | Secondary text and explanations |
| `--gold` | `#FFC83D` | Beg button, jackpot amount and tier |
| `--violet` | `#8B7BFF` | Eye particles, range track, oracle signal |
| `--violet-text` | `#A99DFF` | Oracle text, Epic tier, graded score |
| `--red` | `#FF4D4D` | Nothing tier |
| `--green` | `#8DCBA8` | Connected signal, Common tier |
| `--focus` | `#D0C8FF` | Keyboard focus outline |

Rare results use `#A0C1FF`; error text uses `#FF8585`. Input boundaries use `#3A3747` or `#514B63`. The primary button pairs the gold background with near-black text. Status is always named in text as well as colored. Selected rendered contrast pairs are recorded in [artifacts/contrast.json](artifacts/contrast.json); the design probe also checked the rendered page. Disabled controls intentionally dim and are accompanied by availability explanations.

## Typography

The local variable **Space Grotesk** font (`web/src/assets/space-grotesk-latin.woff2`) supplies weights 400, 500 and 600, with Arial/sans-serif fallbacks. Non-Latin text uses the browser's fallback. Numbers and addresses use `SFMono-Regular, Consolas, Liberation Mono, monospace` with tabular figures. No remote font request is needed. The font's OFL license is beside the source asset.

The six size tokens are 12px captions, 14px labels, 16px body, 20px subheads, 32px section headings, and 80px hero display. Display reduces to 64px at 850px and 48px at 600px. A given viewport uses at most six sizes. Body line height is 1.5; explanations use up to 1.7; display uses 0.98 on desktop and 1.02 on mobile. The display has −0.06em tracking; section headings use −0.035em. Headings balance their lines, and user messages preserve line breaks and wrap long strings. All inputs remain 16px on phones. Prose stays sans-serif; mono is reserved for data.

## Layout

`.wrap` is at most 1248px including 32px side padding, giving 1184px of content at desktop sizes. Side padding becomes 20px under 600px and 16px under 360px. Common spacing is 8, 12, 16, 20, 24, 28, 32, 40 and 48px. Larger gaps separate sections; small gaps group related controls.

The desktop hero has two columns: the form on the left and eye on the right. At 600px it becomes one column, with a smaller decorative eye beside the headline. The form stays in normal reading order. The header navigation hides at 850px, while the wallet and Trade $BEG link remain available. Under 600px the header has automatic height, a 76px minimum and 12px block padding; its actions wrap onto a second row when needed.

The stat strip uses five columns, then three under 1100px, then one `minmax(0, 1fr)` column at 600px and below. Phone statistics retain their 20px values and complete units, with no alternating vertical dividers. The oracle budget stays in the same column beneath a horizontal separator. Feed and odds become one column at 850px. Hall and personal messages use up to two columns. Keeper actions and funding become one column at 850px. The five explanatory steps become three columns at 850px and a numbered vertical list at 600px. Full token addresses wrap in the footer rather than being clipped.

Observed widths: 320, 375, 390, 600, 768 and 1440 CSS pixels, including the revision fixture with `9,999,999.123 BEG` and `0.12346 ETH`. The 390px first screen contains the headline, explanatory line, labelled textarea, byte count, exact price and primary action (its bottom is approximately 540px). The page has no fixed header. Anchor targets use scroll margin. There is no horizontal scroll in these checks. Native browser zoom and physical devices were not tested.

## Elevation and depth

Surfaces are flat tonal layers with one-pixel structural borders, without drop shadows. Only the eye uses translucent radial color, kept behind decorative particles. Its glow never sits behind prose. The wallet uses a native modal `<dialog>` and a dark blurred backdrop; the transaction notice is a fixed, bordered raised surface. No gradients are used for text.

## Shapes

Panels use a 16px radius, message bubbles use `14px 14px 14px 3px`, and secondary controls use 10px. Filter buttons use 8px. Score stamps have a 4px radius and a slight −7° rotation. The wallet dialog has 22px corners and becomes a full-width bottom sheet under 600px. Icons are lightweight inline SVG or typographic symbols; provider marks are locally bundled or supplied as data images by EIP-6963 wallets.

## Components and states

- **Beg form**, `App.tsx`: label, UTF-8 byte counter, unrestricted textarea with validation, exact ETH price, and one gold primary action. Inline errors use `aria-describedby` and `role="alert"`; invalid submission focuses the field. The draft remains after rejection or a reverted transaction and clears after confirmation if unchanged.
- **Swarm**, `Swarm.tsx`: deterministic SVG particles, decorative and ignored by assistive technology. A new indexed submission triggers a single 1.3s pulse. It has no infinite rendering loop. Reduced motion removes the pulse.
- **Message**, `App.tsx`: plain React text nodes, isolated text direction, address and transaction links, named batch status, rotated score stamp, and named tier/prize. Refund controls only appear for eligible personal attempts. No HTML from a player is interpreted.
- **Odds panel**: native labelled range slider, numeric output, and a table with matching column alignment for all five tiers. Live `oddsFor` results replace the explicitly labelled exact local formula. Changed scores update immediately.
- **Wallet sheet**, `WalletSheet.tsx`: native dialog, discovered wallet rows, mobile wallet-browser links and lazy Coinbase Smart Wallet. Native focus containment, Escape, backdrop close, and focus return. Rejection appears inline and rows return to idle. Mainnet switching is explicit if the wallet refuses the automatic request.
- **Keeper/funding controls**: native disabled buttons with nearby reasons. Chain timestamp and block height determine batch eligibility. `useClosePreflight.ts` checks eligible visible Close actions with `eth_call`; unresolved or rejected checks keep Close disabled and expose a nearby, described status. Fresh snapshots, account/network changes and expanded batch lists invalidate earlier results. A send-time failure also disables Close until a subsequent successful check. The existing simulation before sending remains mandatory. Missed reveal windows name the reduced tier and rearm behavior. IMD approval and donation remain separate actions; invalid amounts show an inline error and `aria-invalid` immediately, and only valid positive amounts covered by the allowance say “IMD approved”.
- **Transaction notice**: announces simulation, wallet confirmation, submission, pending receipt, success or failure. Submitted transactions retain an explorer link; pending hashes survive reload in session storage. A completed notice can be dismissed.
- **Empty/network states**: no fabricated activity. Cached statistics are marked as cached; event indexing identifies its cursor and partial rankings. The input remains usable during RPC failure.

All interactive elements have hover, focus, active and disabled styling where relevant. Focus uses a two-pixel outline with four-pixel offset; forced colors preserve system outlines. Touch controls generally exceed 44px, with smaller inline links separated from neighbors. Motion is opt-in through `prefers-reduced-motion: no-preference`.

## Do and don't

Reuse `.wrap`, the six type tokens, section headings, buttons, and message/status patterns. Keep gold fill for the main Beg action, gold data for jackpots, and violet for the swarm. Pair status color with its name. Keep wallet and transaction instructions literal and state-based. Add any future section below the primary form and test at 320px.

Do not introduce remote fonts, card shadows, additional type scales, auto-playing effects, clipped addresses, invented player activity, or HTML rendering for messages. Do not imply that a high score guarantees a prize or that a donation is refundable.

## Guidance attribution

Design guidance was adapted from [Jakub Krehel's Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), MIT. Documentation method was adapted from [Paul Bakaus's Impeccable](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), Apache-2.0. The supplied combined notices and licenses are retained in [docs/DESIGN-GUIDANCE-LICENSES.txt](docs/DESIGN-GUIDANCE-LICENSES.txt). Wallet artwork comes from RainbowKit 2.2.8 under the accompanying MIT license.
