# Build the Beg the Swarm mainnet website

Adds a complete static app for the existing BEG vault. Visitors can read cached/live chain state without a wallet, submit a UTF-8-bounded plea, explore exact contract odds, follow batches, claim rewards and refunds, and perform permissionless keeper and oracle-funding actions. Every write verifies the contract and simulates the exact transaction before asking the wallet to send it.

The new frontend source and npm lockfile live in `web/`; the complete relative-URL production export is in `dist/`. Existing contracts, Solidity dependencies and build configuration are unchanged.

Validation: production build and typecheck pass; 12 focused tests pass; all eight write flows pass in a browser with simulated RPC/wallet responses; the final design probe passes 16/16. Final Lighthouse mobile performance scores are 91 and 88, accessibility 100 in both runs. See [the full validation record](validation.md) for actual scope and limitations. No transaction was broadcast. WebKit and physical wallet handoffs remain unverified.

## First screen and complete page

Actual live RPC state, 390px wide. The Beg form and its action are on the first screen.

![390px first screen](screenshots/mobile-first-screen.jpg)

[Full desktop page](screenshots/desktop-full.jpg) · [Full mobile page](screenshots/mobile-full.jpg) · [Wallet sheet with visible keyboard focus](screenshots/wallet-mobile.jpg)

## Each section

### Hero and primary interaction

![Hero and Beg form](screenshots/hero-desktop.jpg)

### Live statistics

![Vault statistics](screenshots/stats-desktop.jpg)

### Live feed

![Onchain message feed](screenshots/feed-desktop.jpg)

### Odds

![Contract odds and prizes](screenshots/odds-desktop.jpg)

### Hall of fame

![Hall of fame](screenshots/hall-desktop.jpg)

### My stuff

![Personal attempts and claims entry point](screenshots/my-stuff-desktop.jpg)

### Keeper actions and oracle funding

![Keeper controls and funding](screenshots/keepers-desktop.jpg)

### How it works

![Rules, five steps and ETH split](screenshots/how-it-works-desktop.jpg)

## Populated interaction fixture

[Populated fixture screenshot](screenshots/fixture-desktop.jpg) shows synthetic messages for waiting, pending, graded, expired and jackpot states, including literal hostile HTML to verify safe text rendering. It is explicitly a test fixture. These entries and balances are not seeded into the app; every other screenshot above uses actual live RPC responses.
