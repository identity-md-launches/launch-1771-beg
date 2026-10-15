/** Regression cases from the independent review; fixture values are never shipped. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function revisionChecks({ browser, mockPage, root, reproduce }) {
  const out = resolve(root, reproduce ? "test/scratch/revision-before" : "artifacts/revision");
  await mkdir(out, { recursive: true });
  const options = {
    viewport: { width: 375, height: 812 },
    reads: {
      vaultFreeBalance: 9999999123456789000000000n,
      jackpotBank: 123456789000000000n,
      oracleTokenBudget: 100000000000000000n,
    },
    closeError: "OracleUnfunded",
  };
  let releaseClose;
  if (!reproduce) options.closeGate = new Promise((resolve) => { releaseClose = resolve; });
  const { page, context, f } = await mockPage(browser, options);
  const scriptErrors = [];
  page.on("pageerror", (e) => scriptErrors.push(e.message));
  const report = { mode: reproduce ? "before" : "after", layouts: [], funding: [], keeper: {} };
  try {
    await page.evaluate(() => document.fonts.ready);
    for (const width of [375, 320, 390, 600, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 812 });
      await page.evaluate(() => scrollTo(0, 0));
      const layout = await page.evaluate(() => {
        const panel = document.querySelector(".stats").getBoundingClientRect();
        const values = [...document.querySelectorAll(".stat-value")].map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return { text: el.textContent.trim(), left: r.left, right: r.right, fontSize: getComputedStyle(el).fontSize };
        });
        const trade = document.querySelector('a[href*="app.uniswap.org"]');
        return {
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          panel: { left: panel.left, right: panel.right, width: panel.width }, values,
          columns: getComputedStyle(document.querySelector(".stats")).gridTemplateColumns,
          tradeVisible: trade.checkVisibility(), tradeDisplay: getComputedStyle(trade).display,
          primaryBottom: document.querySelector(".primary").getBoundingClientRect().bottom,
        };
      });
      report.layouts.push(layout);
      if (!reproduce) {
        assert.equal(layout.scrollWidth, width, `Page overflow at ${width}`);
        assert.ok(layout.tradeVisible, `Trade visible at ${width}`);
        for (const value of layout.values) {
          assert.ok(value.left >= layout.panel.left && value.right <= layout.panel.right, `Stat fits panel at ${width}: ${value.text}`);
          if (width <= 600) assert.equal(value.fontSize, "20px");
        }
        if (width === 390) assert.ok(layout.primaryBottom <= 844, "Beg remains on the first screen");
      }
      if ([320, 375].includes(width)) await page.locator(".stats").screenshot({ path: resolve(out, `stats-${width}.jpg`), type: "jpeg", quality: 85 });
      if (width === 390) await page.screenshot({ path: resolve(out, "first-screen-390.jpg"), type: "jpeg", quality: 85 });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator(".site-header .wallet-button").click();
    await page.getByRole("button", { name: "Test wallet (simulated)" }).click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await page.waitForFunction(() => document.querySelector(".fund-panel").textContent.includes("5 IMD"));
    const closeRow = page.locator(".batch-row").filter({ hasText: "Batch #1" });
    const close = closeRow.getByRole("button", { name: "Close batch", exact: true });
    if (!reproduce) {
      await closeRow.getByText("Checking whether this batch can close…").waitFor();
      assert.equal(await close.isEnabled(), false, "Unresolved Close preflight stays disabled");
      report.keeper.pendingDisabled = true;
      releaseClose();
      options.closeGate = undefined;
      report.connectedLayouts = [];
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 812 });
        const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, tradeVisible: document.querySelector(".trade-link").checkVisibility() }));
        assert.equal(layout.scrollWidth, width);
        assert.equal(layout.tradeVisible, true);
        report.connectedLayouts.push(layout);
      }
    }
    for (const value of ["abc", "0", "0.1234567890123456789"]) {
      await page.locator("#imd-amount").fill(value);
      await page.locator("#imd-amount").press("Tab");
      const state = await page.evaluate(() => ({
        amount: document.querySelector("#imd-amount").value,
        invalid: document.querySelector("#imd-amount").getAttribute("aria-invalid"),
        error: document.querySelector("#fund-error").textContent,
        actions: [...document.querySelectorAll(".fund-actions button")].map((el) => ({ text: el.textContent, disabled: el.disabled })),
      }));
      report.funding.push(state);
      if (!reproduce) {
        assert.equal(state.invalid, "true");
        assert.equal(state.error, "Enter an amount greater than zero, with at most 18 decimal places.");
        assert.equal(state.actions[0].text, "1. Approve IMD");
        assert.ok(state.actions.every((a) => a.disabled));
      }
    }
    await page.locator(".fund-panel").screenshot({ path: resolve(out, "invalid-funding.jpg"), type: "jpeg", quality: 85 });
    await page.locator("#imd-amount").fill("0.5");
    if (!reproduce) {
      assert.equal(await page.locator("#imd-amount").getAttribute("aria-invalid"), "false");
      assert.equal(await page.locator("#fund-error").textContent(), "");
      assert.equal(await page.locator(".fund-actions button").first().isEnabled(), true);
    }
    if (reproduce) {
      report.keeper.enabledBefore = await close.isEnabled();
      await close.click();
      await page.getByText("Transaction not sent", { exact: true }).waitFor();
      report.keeper.enabledAfter = await close.isEnabled();
      report.keeper.error = await page.locator(".transaction-notice").textContent().catch(() => page.locator('[role="alert"]').last().textContent());
    } else {
      await page.locator(".batch-row").filter({ hasText: "Batch #1" }).getByText(/Add IMD/).waitFor();
      assert.equal(await close.isEnabled(), false, "Positive insufficient budget blocks Close");
      report.keeper.unfundedDisabled = true;
    }
    report.keeper.walletSends = f.sends.length;
    assert.equal(f.sends.length, 0, "Invalid amounts and unfunded Close cannot send");
    await page.locator(".batch-row").first().screenshot({ path: resolve(out, "unfunded-close.jpg"), type: "jpeg", quality: 85 });
    if (!reproduce) {
      // A changed oracle budget triggers a new check, even below the quoted launch
      // fee: only a successful contract simulation establishes availability.
      options.closeError = undefined;
      options.reads.oracleTokenBudget = 200000000000000000n;
      options.closeGate = new Promise((resolve) => { releaseClose = resolve; });
      await page.locator(".connection-line button").click();
      await closeRow.getByText("Checking whether this batch can close…").waitFor();
      assert.equal(await close.isEnabled(), false);
      releaseClose();
      options.closeGate = undefined;
      await close.waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector(".batch-row .keeper-actions button").disabled);
      report.keeper.budgetChangeRechecked = true;
      // The oracle can become unavailable between availability check and send.
      options.closeError = "OracleUnfunded";
      await close.click();
      await page.getByText("Transaction not sent", { exact: true }).waitFor();
      assert.equal(await close.isEnabled(), false, "Send-time revert invalidates prior availability");
      assert.equal(f.sends.length, 0);
      assert.match(await closeRow.textContent(), /Add IMD/);
      report.keeper.sendTimeFailureDisabled = true;
      await page.getByRole("button", { name: "Dismiss transaction notice" }).click();
      // A refresh retries even if the budget is unchanged (the external oracle may recover).
      options.closeError = undefined;
      await page.locator(".connection-line button").click();
      await page.waitForFunction(() => !document.querySelector(".batch-row .keeper-actions button").disabled);
      const before = f.simulations.length;
      await close.click();
      await page.getByText("You’re onchain.", { exact: true }).waitFor();
      assert.equal(f.sends.at(-1).name, "closeBatch");
      assert.ok(f.simulations.length > before, "Successful Close is simulated again before send");
      report.keeper.recoveryAndResimulation = true;
      await page.getByRole("button", { name: "Dismiss transaction notice" }).click();

      // A slow response for the previous batch state must not re-enable a closed batch.
      options.closeGate = new Promise((resolve) => { releaseClose = resolve; });
      await page.locator(".connection-line button").click();
      await closeRow.getByText("Checking whether this batch can close…").waitFor();
      options.batches = { 1: { status: 1 } };
      await page.locator(".connection-line button").click();
      await closeRow.getByText("1/20 · Being judged").waitFor();
      releaseClose();
      options.closeGate = undefined;
      await page.waitForTimeout(600);
      assert.equal(await close.isEnabled(), false);
      report.keeper.lateResultIgnoredAfterBatchChange = true;
      options.batches = { 1: { status: 0 } };
      options.reads.oracleTokenBudget = 0n;
      await page.locator(".connection-line button").click();
      await page.getByText("The oracle needs IMD before a batch can close.", { exact: true }).waitFor();
      assert.equal(await close.isEnabled(), false);
      report.keeper.zeroBudgetDisabled = true;

      // Approval is truthful for a valid amount, and invalid input never inherits it.
      await page.locator(".fund-actions button").first().click();
      await page.getByText("You’re onchain.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "IMD approved", exact: true }).waitFor();
      assert.equal(await page.locator(".fund-actions button").nth(1).isEnabled(), true);
      await page.getByRole("button", { name: "Dismiss transaction notice" }).click();
      await page.locator("#imd-amount").fill("0");
      assert.equal(await page.locator(".fund-actions button").first().textContent(), "1. Approve IMD");
      await page.locator("#imd-amount").fill("0.5");
      await page.locator(".fund-actions button").nth(1).click();
      await page.getByText("You’re onchain.", { exact: true }).waitFor();
      assert.equal(f.sends.at(-1).name, "fundOracle");
      report.fundingRecovery = "Valid approval and donation simulated before send; invalid input never says approved, including with nonzero allowance.";
      report.simulatedWrites = f.sends.map((s) => s.name);
    }
    if (reproduce) {
      assert.equal(report.layouts[0].scrollWidth > 375, true);
      assert.equal(report.layouts[1].scrollWidth > 320, true);
      assert.equal(report.layouts[0].tradeVisible, false);
      assert.ok(report.funding.every((s) => s.invalid === "false" && !s.error && s.actions[0].text === "IMD approved"));
      assert.equal(report.keeper.enabledBefore && report.keeper.enabledAfter, true);
    }
    assert.deepEqual(scriptErrors, []);
    report.scriptErrors = scriptErrors;
    await writeFile(resolve(out, "results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, layouts: report.layouts.map(({ width, scrollWidth, tradeVisible, primaryBottom }) => ({ width, scrollWidth, tradeVisible, primaryBottom })), funding: report.funding, keeper: report.keeper, simulatedWrites: report.simulatedWrites, scriptErrors }, null, 2));
  } finally {
    await context.close();
  }
}
