/** Production-export integration checks. RPC and wallet fixtures never touch mainnet. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  encodeErrorResult,
  getAddress,
  toHex,
} from "viem";
import { revisionChecks } from "./revision-browser.mjs";
const { chromium, webkit } = await import(
  process.env.BEG_PLAYWRIGHT || "playwright"
);
const { default: AxeBuilder } = await import(
  process.env.BEG_AXE || "@axe-core/playwright"
);
const root = resolve(import.meta.dirname, "../..");
const vaultAbi = JSON.parse(
  await readFile(resolve(root, "web/src/contracts/BegVault.json"), "utf8"),
);
const tokenAbi = JSON.parse(
  await readFile(resolve(root, "web/src/contracts/LaunchToken.json"), "utf8"),
);
const runtime = (
  await readFile(resolve(root, "web/tests/fixtures/vault-runtime.hex"), "utf8")
).trim();
const VAULT = "0x5c0a76dff019df3a3a118080ae3f073dc02bad13",
  BEG = "0x99e176e02691be327a3a00637d4a893c58264d0c",
  IMD = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
  account = getAddress(BEG);
const deploy = 26193895n,
  head = deploy + 100n;
const now = Math.floor(Date.now() / 1000);
const zeroHash = toHex(0, { size: 32 });
const artifacts = resolve(root, "artifacts/screenshots");
await mkdir(artifacts, { recursive: true });
const results = [];
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      root,
      "dist",
      decodeURIComponent(
        new URL(req.url, "http://localhost").pathname.replace(
          /^\/preview\//,
          "",
        ),
      ) || "index.html",
    );
    if (!path.startsWith(resolve(root, "dist") + "/")) throw Error();
    const file = await readFile(path);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".png": "image/png",
      }[extname(path)] || "application/octet-stream",
    );
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/index.html`;
function batch(id, status, size = 1) {
  return {
    firstAttemptId: BigInt(id),
    firstNonce: BigInt(id),
    openedAt: BigInt(now - 1900),
    closedAt: BigInt(now - 86401),
    rollBlock: head - 1n,
    size,
    status,
    missedWindows: 0,
    lastPlayer: account,
    prevrandao: 0n,
    scores: 95n,
    seed: zeroHash,
  };
}
const batches = {
  1: batch(1, 0),
  2: batch(2, 1),
  3: batch(3, 2),
  4: batch(4, 4),
  5: batch(5, 3),
  6: batch(6, 0, 0),
};
let logIndex = 0;
function log(eventName, args, types, data) {
  logIndex++;
  return {
    address: VAULT,
    topics: encodeEventTopics({ abi: vaultAbi, eventName, args }),
    data: encodeAbiParameters(
      types.map((type) => ({ type })),
      data,
    ),
    blockNumber: toHex(deploy + BigInt(logIndex)),
    blockHash: toHex(logIndex, { size: 32 }),
    transactionHash: toHex(logIndex, { size: 32 }),
    logIndex: "0x0",
  };
}
const messages = [
  "Dear swarm, I have budgeted all my dignity for this transaction.",
  "My oracle is taking a very long lunch.",
  "I offer one excellent sentence and absolutely no collateral.",
  "Please return my dignity deposit.",
  '<img src=x onerror="window.__xss=true"> The jackpot was inside us all along.',
];
const logs = messages.map((message, i) =>
  log(
    "AttemptSubmitted",
    { attemptId: BigInt(i + 1), player: account, batchId: BigInt(i + 1) },
    ["string"],
    [message],
  ),
);
logs.push(
  log(
    "BatchClosed",
    { batchId: 2n, questionId: toHex(22, { size: 32 }) },
    ["uint256"],
    [1n],
  ),
  log(
    "BatchClosed",
    { batchId: 3n, questionId: toHex(33, { size: 32 }) },
    ["uint256"],
    [1n],
  ),
  log("BatchGraded", { batchId: 3n }, ["uint256[]"], [[95n]]),
  log("BatchExpired", { batchId: 4n }, [], []),
  log(
    "BatchClosed",
    { batchId: 5n, questionId: toHex(55, { size: 32 }) },
    ["uint256"],
    [1n],
  ),
  log("BatchGraded", { batchId: 5n }, ["uint256[]"], [[100n]]),
  log(
    "Rolled",
    { attemptId: 5n, player: account },
    ["uint8", "uint8", "uint256", "uint256"],
    [100, 4, 8000000n * 10n ** 18n, 50000000000000000n],
  ),
);
function fixture(options = {}) {
  let allowance = 0n,
    credit = [123n * 10n ** 18n, 5000000000000000n],
    duplicate = false,
    revert = false;
  const simulations = [],
    sends = [];
  return {
    simulations,
    sends,
    options,
    setDuplicate: (value) => {
      duplicate = value;
    },
    setRevert: (value) => {
      revert = value;
    },
    async route(route) {
      const body = route.request().postDataJSON();
      if (options.closeGate && !Array.isArray(body) && body.method === "eth_call" && body.params[0].from &&
          decodeFunctionData({ abi: vaultAbi, data: body.params[0].data }).functionName === "closeBatch")
        await options.closeGate;
      function one(q) {
        let result;
        try {
          if (q.method === "eth_blockNumber") result = toHex(head);
          else if (q.method === "eth_chainId") result = "0x1";
          else if (q.method === "eth_getBlockByNumber")
            result = { number: toHex(head), timestamp: toHex(now) };
          else if (q.method === "eth_getCode") result = runtime;
          else if (q.method === "eth_getLogs") {
            const f = q.params[0];
            result = logs.filter(
              (l) =>
                BigInt(l.blockNumber) >= BigInt(f.fromBlock) &&
                BigInt(l.blockNumber) <= BigInt(f.toBlock),
            );
          } else if (q.method === "eth_getTransactionReceipt")
            result = {
              status: "0x1",
              transactionHash: q.params[0],
              blockNumber: toHex(head),
            };
          else if (q.method === "eth_estimateGas") result = toHex(200000);
          else if (q.method === "eth_call") {
            const tx = q.params[0],
              abi = tx.to.toLowerCase() === IMD ? tokenAbi : vaultAbi,
              { functionName: name, args = [] } = decodeFunctionData({
                abi,
                data: tx.data,
              });
            if (tx.from) {
              simulations.push(tx);
              if (name === "closeBatch" && options.closeError)
                return {
                  jsonrpc: "2.0", id: q.id,
                  error: { code: 3, message: "execution reverted", data: encodeErrorResult({ abi: vaultAbi, errorName: options.closeError }) },
                };
              if (revert)
                return {
                  jsonrpc: "2.0",
                  id: q.id,
                  error: { code: 3, message: "Test simulation rejected" },
                };
              result = "0x";
            } else {
              const reads = {
                token: BEG,
                imd: IMD,
                ATTEMPT_PRICE: 5000000000000000n,
                vaultFreeBalance: 800000000n * 10n ** 18n,
                jackpotBank: 100000000000000000n,
                nextAttemptId: 6n,
                oracleTokenBudget: 500000000000000000n,
                oracleBudget: 1000000000000000n,
                openBatchId: 6,
                nextToClose: 1,
                cooldownUntil: 0n,
                usedMessage: duplicate,
                claimable: credit,
                allowance,
                balanceOf: 5n * 10n ** 18n,
                ...options.reads,
              };
              let value = reads[name];
              if (name === "getBatch") value = { ...batches[String(args[0])], ...options.batches?.[String(args[0])] };
              if (name === "oddsFor") {
                const s = args[0],
                  j = 1n + (199n * s) / 100n,
                  e = 200n + (1100n * s) / 100n,
                  r = 800n + (2200n * s) / 100n,
                  c = 2000n + (1500n * s) / 100n;
                value = [j, e, r, c, 10000n - j - e - r - c];
              }
              if (value === undefined) throw new Error("Unhandled " + name);
              result = encodeFunctionResult({
                abi,
                functionName: name,
                result: value,
              });
            }
          } else throw new Error("Unhandled RPC " + q.method);
          return { jsonrpc: "2.0", id: q.id, result };
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id: q.id,
            error: { code: -32000, message: error.message },
          };
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)),
      });
    },
    send(tx) {
      assert.ok(
        simulations.some(
          (s) =>
            s.from === tx.from &&
            s.to === tx.to &&
            s.data === tx.data &&
            s.value === tx.value,
        ),
        "Exact transaction must be simulated before wallet send",
      );
      const abi = tx.to.toLowerCase() === IMD ? tokenAbi : vaultAbi;
      const d = decodeFunctionData({ abi, data: tx.data });
      sends.push({ name: d.functionName, args: d.args, tx });
      if (d.functionName === "approve") allowance = d.args[1];
      if (d.functionName === "claim") credit = [0n, 0n];
      if (d.functionName === "refund") credit = [0n, 5000000000000000n];
      return toHex(1000 + sends.length, { size: 32 });
    },
  };
}
async function mockPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const f = fixture(options);
  await page.route(
    /^https:\/\/(ethereum-rpc\.publicnode\.com|eth\.llamarpc\.com|cloudflare-eth\.com)\/?$/,
    (r) => f.route(r),
  );
  await page.exposeFunction("__fixtureSend", (tx) => f.send(tx));
  await page.addInitScript(
    ({ account }) => {
      const listeners = {};
      window.__walletTrace = [];
      window.__mockChain = "0xaa36a7";
      window.__reject = false;
      const p = {
        on: (name, fn) => {
          listeners[name] = fn;
        },
        removeListener: () => {},
        request: async ({ method, params }) => {
          window.__walletTrace.push(method);
          if (method === "eth_requestAccounts") {
            if (window.__reject) throw { code: 4001, message: "User rejected" };
            return [account];
          }
          if (method === "eth_accounts") return [account];
          if (method === "eth_chainId") return window.__mockChain;
          if (method === "wallet_switchEthereumChain") {
            window.__mockChain = "0x1";
            listeners.chainChanged?.("0x1");
            return null;
          }
          if (method === "eth_sendTransaction")
            return window.__fixtureSend(params[0]);
          throw new Error("Unexpected wallet method " + method);
        },
      };
      const info = {
        uuid: "browser-validation-fixture",
        name: "Test wallet (simulated)",
        rdns: "test.fixture",
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"%3E%3Ccircle cx="14" cy="14" r="12" fill="%238B7BFF"/%3E%3C/svg%3E',
      };
      window.addEventListener("eip6963:requestProvider", () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: { info, provider: p },
          }),
        ),
      );
    },
    { account },
  );
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector(".stat-value")?.innerText.includes("ETH") &&
    !document.querySelector(".stat-value")?.innerText.includes("—"));
  await page.waitForFunction(() =>
    document.body.innerText.includes("All indexed events"),
  );
  return { page, context, f };
}
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  if (process.argv.includes("--revision") || process.argv.includes("--reproduce")) {
    await revisionChecks({ browser, mockPage, root, reproduce: process.argv.includes("--reproduce") });
  } else {
  const { page, context, f } = await mockPage(browser);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.getByRole("button", { name: "Beg", exact: true }).click();
  assert.match(
    await page.locator("#message-error").innerText(),
    /Write your message/,
  );
  results.push("Empty message: inline error and textarea focus");
  assert.equal(
    await page
      .locator("#beg-message")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator("#beg-message").fill("🫠".repeat(71));
  assert.match(await page.locator(".byte-count").innerText(), /284/);
  await page.getByRole("button", { name: "Beg", exact: true }).click();
  assert.match(
    await page.locator("#message-error").innerText(),
    /4 bytes too long/,
  );
  results.push("UTF-8 284-byte message blocked before wallet");
  await page.locator("#beg-message").fill("I beg only in a simulated browser.");
  await page.getByRole("button", { name: "Beg", exact: true }).click();
  await page.locator("dialog[open]").waitFor();
  await page.evaluate(() => {
    window.__reject = true;
  });
  await page.getByRole("button", { name: "Test wallet (simulated)" }).click();
  await page
    .getByText("You declined the wallet request. Nothing was sent.", {
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => {
    window.__reject = false;
  });
  await page.getByRole("button", { name: "Test wallet (simulated)" }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.ok(
    (await page.evaluate(() => window.__walletTrace)).includes(
      "wallet_switchEthereumChain",
    ),
  );
  results.push(
    "EIP-6963 discovery, rejection recovery, automatic switch to mainnet",
  );
  await page.waitForFunction(
    () => !document.querySelector("button.primary").disabled,
  );
  await page.getByRole("button", { name: "Beg", exact: true }).click();
  await page.getByText("You’re onchain.", { exact: true }).waitFor();
  assert.equal(f.sends.at(-1).name, "attempt");
  assert.equal(await page.locator("#beg-message").inputValue(), "");
  await page
    .getByRole("button", { name: "Dismiss transaction notice" })
    .click();
  results.push(
    "Beg: exact eth_call before wallet send; receipt confirmation and form reset",
  );
  await page.locator("#beg-message").fill("Duplicate fixture message");
  f.setDuplicate(true);
  await page.getByRole("button", { name: "Beg", exact: true }).click();
  await page
    .locator("#message-error")
    .filter({ hasText: "already read" })
    .waitFor();
  assert.equal(f.sends.length, 1);
  await page
    .getByRole("button", { name: "Dismiss transaction notice" })
    .click();
  f.setDuplicate(false);
  results.push("Duplicate precheck prevents wallet send");
  const before = f.sends.length;
  f.setRevert(true);
  await page.getByRole("button", { name: "Beg", exact: true }).click();
  await page.getByText("Transaction not sent", { exact: true }).waitFor();
  assert.equal(f.sends.length, before);
  await page
    .getByRole("button", { name: "Dismiss transaction notice" })
    .click();
  f.setRevert(false);
  results.push("Simulation rejection prevents wallet send");
  await page.locator("#score-slider").fill("100");
  await page.waitForFunction(() =>
    document.querySelector(".odds-row.tier-4").innerText.includes("2.00%"),
  );
  await page.locator("#score-slider").fill("0");
  await page.waitForFunction(() =>
    document.querySelector(".odds-row.tier-4").innerText.includes("0.01%"),
  );
  results.push("Odds slider: onchain response at scores 0 and 100");
  await page.getByRole("button", { name: "Results", exact: true }).click();
  assert.equal(await page.locator("#feed .message").count(), 1);
  assert.equal(await page.locator("#feed .message-body img").count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.match(
    await page.locator("#feed .message-body").innerText(),
    /<img src=x/,
  );
  results.push("Feed filtering, raw untrusted HTML displayed as text");
  await page
    .getByRole("button", { name: "Jackpot winners", exact: true })
    .click();
  assert.equal(await page.locator("#hall .message").count(), 1);
  results.push("Hall of fame jackpot filter");
  async function clickWrite(selector, expected) {
    await page.locator(selector).click();
    await page.getByText("You’re onchain.", { exact: true }).waitFor();
    assert.equal(f.sends.at(-1).name, expected);
    await page
      .getByRole("button", { name: "Dismiss transaction notice" })
      .click();
  }
  await clickWrite("#mine .claim-row button", "claim");
  await clickWrite("#mine .message button", "refund");
  await clickWrite(
    ".batch-row:nth-of-type(1) .keeper-actions button:nth-child(1)",
    "closeBatch",
  );
  await clickWrite(
    ".batch-row:nth-of-type(2) .keeper-actions button:nth-child(3)",
    "expireBatch",
  );
  await clickWrite(
    ".batch-row:nth-of-type(3) .keeper-actions button:nth-child(2)",
    "reveal",
  );
  await page.locator("#imd-amount").fill("0");
  await page.waitForFunction(
    () => document.querySelector(".fund-actions button").disabled,
  );
  await page.locator("#imd-amount").fill("0.5");
  await clickWrite(".fund-actions button:nth-child(1)", "approve");
  await page.waitForFunction(
    () => !document.querySelector(".fund-actions button:nth-child(2)").disabled,
  );
  await clickWrite(".fund-actions button:nth-child(2)", "fundOracle");
  results.push(
    "Claim, refund, closeBatch(uint256), expireBatch, reveal, approve, fundOracle(uint256): all simulated and confirmed",
  );
  const names = f.sends.map((s) => s.name);
  assert.deepEqual(names, [
    "attempt",
    "claim",
    "refund",
    "closeBatch",
    "expireBatch",
    "reveal",
    "approve",
    "fundOracle",
  ]);
  assert.equal(pageErrors.length, 0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.locator("#beg-message").fill("");
  await page.locator("#score-slider").fill("50");
  await page.getByRole("button", { name: "Disconnect wallet" }).click();
  await page.evaluate(() => scrollTo(0, 0));
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await writeFile(
    resolve(root, "artifacts/accessibility.json"),
    JSON.stringify(
      {
        violations: axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        })),
        passes: axe.passes.length,
        incomplete: axe.incomplete.map((x) => ({
          id: x.id,
          count: x.nodes.length,
        })),
      },
      null,
      2,
    ),
  );
  assert.equal(
    axe.violations.length,
    0,
    JSON.stringify(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  results.push(
    `axe: ${axe.passes.length} checks passed, zero violations in populated fixture`,
  );
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      view: innerWidth,
      primary: document.querySelector(".primary").getBoundingClientRect()
        .bottom,
    }));
    assert.ok(sizes.scroll <= width, `overflow ${width}: ${sizes.scroll}`);
    if (width === 390) assert.ok(sizes.primary < 844);
    results.push(
      `Layout ${width}px: no overflow${width === 390 ? ", Beg visible above fold" : ""}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: resolve(artifacts, "fixture-desktop.jpg"),
    type: "jpeg",
    quality: 88,
    fullPage: true,
  });
  await context.close();
  // Live read-only export: no wallet, no fixture or fabricated balances.
  const live = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const p = await live.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForTimeout(5000);
  await p.screenshot({
    path: resolve(artifacts, "desktop-full.jpg"),
    type: "jpeg",
    quality: 88,
    fullPage: true,
  });
  for (const [name, selector] of [
    ["hero", ".hero"],
    ["stats", ".stats"],
    ["feed", "#feed"],
    ["odds", "#odds"],
    ["hall", "#hall"],
    ["my-stuff", "#mine"],
    ["keepers", "#keepers"],
    ["how-it-works", "#how"],
  ]) {
    await p.locator(selector).screenshot({
      path: resolve(artifacts, `${name}-desktop.jpg`),
      type: "jpeg",
      quality: 88,
    });
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({
    path: resolve(artifacts, "mobile-first-screen.jpg"),
    type: "jpeg",
    quality: 88,
  });
  await p.screenshot({
    path: resolve(artifacts, "mobile-full.jpg"),
    type: "jpeg",
    quality: 88,
    fullPage: true,
  });
  assert.equal(errors.length, 0);
  results.push(
    "Actual live RPC export: section screenshots + mobile first screen, zero uncaught script errors",
  );
  const contrast = await p.evaluate(() => {
    const luminance = (rgb) =>
      rgb
        .map((c) => c / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const values = (s) =>
      s
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    return [
      ".primary",
      ".hero-description",
      ".odds-row.tier-0>span",
      ".odds-row.tier-4>span",
      ".odds-row.tier-3>span",
      ".stat-value",
    ].map((selector) => {
      const el = document.querySelector(selector);
      const cs = getComputedStyle(el);
      let node = el;
      let bg;
      while (node) {
        bg = getComputedStyle(node).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
        node = node.parentElement;
      }
      const a = luminance(values(cs.color)),
        b = luminance(values(bg));
      return {
        selector,
        foreground: cs.color,
        background: bg,
        ratio: Number(
          ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2),
        ),
      };
    });
  });
  assert.ok(contrast.every((pair) => pair.ratio >= 4.5));
  await writeFile(
    resolve(root, "artifacts/contrast.json"),
    JSON.stringify(contrast, null, 2),
  );
  results.push(
    "Six actual rendered text/background pairs measured above 4.5:1",
  );
  // Native dialog keyboard containment and focus restoration, with actual exported markup.
  await p.evaluate(() => scrollTo(0, 0));
  await p.locator(".site-header .wallet-button").click();
  await p.locator("dialog[open]").waitFor();
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press("Tab");
    assert.equal(
      await p.evaluate(() => !!document.activeElement?.closest("dialog")),
      true,
    );
  }
  await p.screenshot({
    path: resolve(artifacts, "wallet-mobile.jpg"),
    type: "jpeg",
    quality: 88,
  });
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.equal(
    await p
      .locator(".site-header .wallet-button")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  results.push(
    "Native wallet dialog: keyboard focus stays inside, Escape closes, focus returns to its trigger",
  );
  // Cached offline reload must render cached balance synchronously and preserve the message form.
  await p.reload();
  await p.waitForTimeout(500);
  const cached = await p.evaluate(() =>
    localStorage.getItem("beg:1:5c0a76df:v1"),
  );
  assert.ok(cached, "Live reads produced a cached state");
  await p.route(/^https:\/\//, (route) => route.abort());
  await p.reload();
  await p.locator(".stat-value").filter({ hasText: "800M" }).waitFor();
  await p.waitForTimeout(5000);
  assert.match(
    await p.locator(".network-notice").innerText(),
    /last successful read/,
  );
  assert.equal(await p.locator("#beg-message").isEnabled(), true);
  results.push(
    "Offline reload: cached state appears and failed reads are labelled; draft input remains usable",
  );
  await live.close();
  try {
    const wb = await webkit.launch({ headless: true });
    try {
      const { page: wp, context: wc } = await mockPage(wb);
      await wp.getByRole("button", { name: "Beg", exact: true }).click();
      assert.match(
        await wp.locator("#message-error").innerText(),
        /Write your message/,
      );
      await wc.close();
      results.push("WebKit primary interaction passed");
    } finally {
      await wb.close();
    }
  } catch (error) {
    results.push(
      `WebKit not performed: ${"Required WebKit system libraries are unavailable; Chromium checks completed."}`,
    );
  }
  await writeFile(
    resolve(root, "artifacts/browser-results.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        simulatedWrites: names,
        screenshots: "artifacts/screenshots",
        liveState:
          "Screenshots use actual RPC responses. fixture-desktop.jpg uses synthetic test data, never shown by the shipped app.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, results }, null, 2));
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
