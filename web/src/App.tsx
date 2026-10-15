import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseUnits, type Hex } from "viem";
import { BEG, BOUNTY, CACHE_KEY, EXPLORER, REPO, TRADE } from "./config";
import { contractOdds, loadUser, type UserState } from "./chain";
import { useChain } from "./useChain";
import { useWallet } from "./wallet";
import { WalletSheet } from "./WalletSheet";
import { Swarm } from "./Swarm";
import {
  amount,
  batchActions,
  byteLength,
  duration,
  localOdds,
  short,
  STATUSES,
  TIERS,
  validateMessage,
  type Attempt,
} from "./model";
import { humanError } from "./errors";
import { receipt, sendAction, type Action } from "./transactions";
const Arrow = () => <span aria-hidden="true">↗</span>;
const Eye = () => (
  <svg
    width="30"
    height="22"
    viewBox="0 0 30 22"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M1 11S6 3 15 3s14 8 14 8-5 8-14 8S1 11 1 11Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="15" cy="11" r="4" fill="currentColor" />
  </svg>
);
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-orbit" aria-hidden="true">
        <Eye />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Message({
  attempt,
  onRefund,
  disabled = false,
}: {
  attempt: Attempt;
  onRefund?: (id: string) => void;
  disabled?: boolean;
}) {
  const a = attempt;
  return (
    <article className={`message tier-${a.tier ?? "pending"}`}>
      <div className="message-meta">
        <a
          href={`https://eth.blockscout.com/address/${a.player}`}
          target="_blank"
          rel="noreferrer"
          className="player mono"
          title={a.player}
        >
          {short(a.player)}
        </a>
        <span className="small muted">Batch #{a.batchId}</span>
        <span className={`status status-${a.status}`}>
          {STATUSES[a.status]}
        </span>
      </div>
      <div className="message-body">
        <p dir="auto">{a.message}</p>
        {a.score !== undefined && (
          <div
            className={`score-stamp tier-${a.tier ?? "pending"}`}
            role="img"
            aria-label={`Score ${a.score} out of 100`}
          >
            <strong>{a.score}</strong>
            <span>/100</span>
          </div>
        )}
      </div>
      <div className="message-bottom">
        <a
          className="small muted"
          href={`https://eth.blockscout.com/tx/${a.tx}`}
          target="_blank"
          rel="noreferrer"
        >
          Attempt #{a.id} <Arrow />
        </a>
        {a.status === 3 && (
          <span className={`result tier-${a.tier}`}>
            <span className="tier-mark" aria-hidden="true">
              {a.tier === 4 ? "✦" : a.tier === 0 ? "×" : "◇"}
            </span>{" "}
            {TIERS[a.tier ?? 0]}
            {a.tokens !== undefined &&
              a.tokens > 0n &&
              ` · ${amount(a.tokens)} BEG`}
            {a.eth !== undefined && a.eth > 0n && ` + ${amount(a.eth, 5)} ETH`}
          </span>
        )}
        {a.refunded && <span className="small muted">Refund credited</span>}
        {onRefund && a.status === 4 && !a.refunded && (
          <button
            className="button small-button"
            disabled={disabled}
            onClick={() => onRefund(a.id)}
          >
            Refund 0.005 ETH
          </button>
        )}
      </div>
    </article>
  );
}
export default function App() {
  const chain = useChain();
  const wallet = useWallet();
  const [picker, setPicker] = useState(false);
  const closePicker = useCallback(() => setPicker(false), []);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [now, setNow] = useState(Date.now());
  const [score, setScore] = useState(50);
  const [odds, setOdds] = useState<readonly number[]>(localOdds(50));
  const [oddsSource, setOddsSource] = useState("Contract formula");
  const [filter, setFilter] = useState("All");
  const [feedCount, setFeedCount] = useState(6);
  const [hallTab, setHallTab] = useState("Highest scores");
  const currentAddress = useRef(wallet.address);
  currentAddress.current = wallet.address;
  const [user, setUser] = useState<UserState>();
  const [userError, setUserError] = useState("");
  const [fund, setFund] = useState("0.5");
  const [fundError, setFundError] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const txLock = useRef(false);
  const [txStage, setTxStage] = useState("");
  const [txError, setTxError] = useState("");
  const submittedMessage = useRef<string | undefined>(undefined);
  const [txHash, setTxHash] = useState<Hex>();
  const [txStatus, setTxStatus] = useState<
    "pending" | "success" | "reverted"
  >();
  const [copied, setCopied] = useState(false);
  const [batchCount, setBatchCount] = useState(6);
  const [mineCount, setMineCount] = useState(10);
  const [hallCount, setHallCount] = useState(10);
  const state = chain.state;
  const stale = !state || now - state.at > 45000;
  const fresh = !!state && !stale && chain.verified && !chain.error;
  const currentBatch = state?.batches[state.openId];
  const bytes = byteLength(message);
  const cooldown = user ? Math.max(0, user.cooldown - now / 1000) : 0;
  const openWallet = () => {
    wallet.clearError();
    setPicker(true);
  };
  const refreshUser = useCallback(async () => {
    if (!wallet.address) {
      setUser(undefined);
      setUserError("");
      return;
    }
    try {
      const next = await loadUser(wallet.address);
      if (currentAddress.current !== wallet.address) return;
      setUser(next);
      setUserError("");
    } catch (e) {
      if (currentAddress.current === wallet.address)
        setUserError(humanError(e));
    }
  }, [wallet.address]);
  useEffect(() => {
    setUser(undefined);
    void refreshUser();
    const timer = setInterval(() => void refreshUser(), 15000);
    return () => clearInterval(timer);
  }, [refreshUser]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    setOdds(localOdds(score));
    setOddsSource("Contract formula · cached locally");
    const t = setTimeout(
      () =>
        void contractOdds(score)
          .then((o) => {
            if (active) {
              setOdds(o);
              setOddsSource("From the contract");
            }
          })
          .catch(() => {}),
      250,
    );
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [score]);
  useEffect(() => {
    try {
      const hash = sessionStorage.getItem(`${CACHE_KEY}:pending`);
      if (hash && /^0x[0-9a-f]{64}$/i.test(hash)) {
        setTxHash(hash as Hex);
        setTxStatus("pending");
        setTxStage("Transaction pending on Ethereum.");
      }
    } catch {
      /* no storage */
    }
  }, []);
  useEffect(() => {
    if (!txHash || txStatus !== "pending") return;
    let active = true,
      checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const s = await receipt(txHash);
        if (active && s !== "pending") {
          setTxStatus(s);
          if (s === "success" && submittedMessage.current !== undefined) {
            const sent = submittedMessage.current;
            setMessage((current) => (current === sent ? "" : current));
            submittedMessage.current = undefined;
          }
          setTxStage(
            s === "success"
              ? "Transaction confirmed. Refreshing your balance and the feed."
              : "Transaction reverted. Your action was not completed; network gas may have been spent.",
          );
          setTxBusy(false);
          txLock.current = false;
          try {
            sessionStorage.removeItem(`${CACHE_KEY}:pending`);
          } catch {
            /* no storage */
          }
          void chain.refresh();
          void refreshUser();
        }
      } catch {
        if (active)
          setTxStage(
            "Waiting for Ethereum. Your transaction link remains available.",
          );
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [txHash, txStatus, chain.refresh, refreshUser]);
  const run = async (action: Action) => {
    if (!wallet.address || !wallet.provider) {
      openWallet();
      return;
    }
    if (wallet.chain !== "0x1") {
      try {
        await wallet.switchChain();
      } catch (e) {
        setTxError(humanError(e));
      }
      return;
    }
    if (txLock.current || txStatus === "pending") return;
    if (!fresh) {
      setTxError(
        "Live contract data is unavailable. Refresh the connection before sending.",
      );
      return;
    }
    txLock.current = true;
    setTxBusy(true);
    setTxError("");
    setTxHash(undefined);
    setTxStatus(undefined);
    try {
      const hash = await sendAction(
        wallet.provider,
        wallet.address,
        action,
        setTxStage,
      );
      setTxHash(hash);
      setTxStatus("pending");
      setTxStage("Transaction sent. Waiting for confirmation…");
      try {
        sessionStorage.setItem(`${CACHE_KEY}:pending`, hash);
      } catch {
        /* no storage */
      }
      if (action.name === "attempt") submittedMessage.current = action.message;
    } catch (e) {
      const text = humanError(e);
      setTxError(text);
      setTxStage("");
      if (action.name === "attempt") setFormError(text);
      if (action.name === "approve" || action.name === "fundOracle")
        setFundError(text);
      setTxBusy(false);
      txLock.current = false;
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateMessage(message);
    setFormError(error || "");
    if (error) {
      textarea.current?.focus();
      return;
    }
    void run({ name: "attempt", message });
  };
  let fundAmount = 0n;
  try {
    if (!/^\d+(\.\d{0,18})?$/.test(fund)) throw Error();
    fundAmount = parseUnits(fund, 18);
  } catch {
    /* validated when clicked */
  }
  const funding = (name: "approve" | "fundOracle") => {
    if (fundAmount <= 0n) {
      setFundError(
        "Enter an amount greater than zero, with at most 18 decimal places.",
      );
      return;
    }
    if (user && fundAmount > user.imd) {
      setFundError("Your IMD balance is too low for this amount.");
      return;
    }
    setFundError("");
    void run({ name, amount: fundAmount });
  };
  const needsApproval = !user || user.allowance < fundAmount;
  const busy = txBusy || txStatus === "pending";
  const canWrite = fresh && wallet.chain === "0x1" && !!wallet.address && !busy;
  const allAttempts = useMemo(
    () =>
      chain.attempts.map((a) => {
        const b = state?.batches[a.batchId];
        if (!b || a.status === 3 || a.status === 4) return a;
        const index = BigInt(a.id) - b.firstAttemptId;
        return {
          ...a,
          status: b.status === 3 ? a.status : b.status,
          score:
            b.status >= 2 && b.status !== 4
              ? Number((b.scores >> (index * 8n)) & 255n)
              : a.score,
        };
      }),
    [chain.attempts, state],
  );
  const visibleFeed = allAttempts.filter(
    (a) =>
      filter === "All" ||
      (filter === "Results" ? a.status === 3 : a.status < 3),
  );
  const top = useMemo(
    () =>
      allAttempts
        .filter((a) => a.score !== undefined)
        .sort(
          (a, b) =>
            (b.score ?? 0) - (a.score ?? 0) ||
            Number(BigInt(a.id) - BigInt(b.id)),
        )
        .slice(0, 10),
    [allAttempts],
  );
  const jackpots = allAttempts.filter((a) => a.tier === 4);
  const mine = allAttempts.filter(
    (a) => a.player.toLowerCase() === wallet.address?.toLowerCase(),
  );
  const batches = Object.values(state?.batches || {})
    .filter((b) => b.size > 0 && b.status < 3)
    .sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)));
  const historyComplete =
    !!chain.history && !!state && chain.history.cursor >= state.block;
  const eventStatus = historyComplete
    ? "All indexed events"
    : chain.history
      ? `Indexing through block ${chain.history.cursor.toLocaleString()}`
      : "Fetching onchain messages…";
  const closeIn =
    currentBatch && currentBatch.size > 0
      ? Number(currentBatch.openedAt) + 1800 - now / 1000
      : undefined;
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(BEG);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a className="wordmark" href="#">
          <Eye />
          <span>
            beg<span className="logo-period">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#feed">The feed</a>
          <a href="#odds">The odds</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="header-actions">
          <a
            className="trade-link"
            href={TRADE}
            target="_blank"
            rel="noreferrer"
          >
            Trade $BEG <Arrow />
          </a>
          {wallet.address ? (
            <div className="account-controls">
              <button
                className="button wallet-button"
                onClick={() =>
                  wallet.chain !== "0x1"
                    ? void wallet
                        .switchChain()
                        .catch((e) => setTxError(humanError(e)))
                    : document
                        .getElementById("mine")
                        ?.scrollIntoView({ behavior: "auto" })
                }
              >
                {wallet.chain !== "0x1"
                  ? "Switch to Ethereum"
                  : short(wallet.address)}
              </button>
              <button
                className="disconnect"
                aria-label="Disconnect wallet"
                onClick={wallet.disconnect}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button className="button wallet-button" onClick={openWallet}>
              <span className="wallet-indicator" aria-hidden="true" />
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main id="main" className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-main">
            <h1 id="hero-title">
              Beg the
              <br />
              Swarm<span>.</span>
            </h1>
            <p className="hero-description">
              Convince the IMD swarm to give you tokens.
              <br className="desktop-break" /> It reads everything.
            </p>
            <form className="beg-form" onSubmit={submit}>
              <div className="form-top">
                <label htmlFor="beg-message">Make your case</label>
                <span
                  className={`byte-count mono ${bytes > 280 ? "error-text" : ""}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {bytes}
                  <span className="muted"> / 280 bytes</span>
                </span>
              </div>
              <textarea
                ref={textarea}
                id="beg-message"
                name="message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (formError) setFormError("");
                }}
                placeholder="Dear all-seeing swarm, I have a compelling lack of tokens…"
                aria-describedby="message-hint message-error"
                aria-invalid={bytes > 280 || !!formError}
                spellCheck
                rows={3}
              />
              <div className="form-bottom">
                <div className="entry-price">
                  <span className="mono">
                    0.005 <span className="muted">ETH</span>
                  </span>
                  <span className="small muted">per attempt + gas</span>
                </div>
                <button
                  type="submit"
                  className="button primary"
                  disabled={
                    busy ||
                    (!!wallet.address &&
                      (!fresh || wallet.chain !== "0x1" || cooldown > 0))
                  }
                >
                  {busy
                    ? "Transaction pending…"
                    : cooldown > 0
                      ? `Wait ${duration(cooldown)}`
                      : "Beg"}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
            <p id="message-hint" className="form-note small muted">
              Messages are public. Some characters use more than one byte.
            </p>
            <p
              id="message-error"
              role="alert"
              className="error-text form-error"
            >
              {formError}
            </p>
            {wallet.address && (!fresh || wallet.chain !== "0x1") && (
              <p className="small muted">
                {wallet.chain !== "0x1"
                  ? "Switch to Ethereum using the wallet control above."
                  : "Waiting for verified live data before enabling payment."}
              </p>
            )}
          </div>
          <div className="hero-visual">
            <Swarm pulse={chain.pulse} />
            <div className="hero-footnote">
              <span className="mono">280 bytes</span>
              <span>One very judgmental swarm.</span>
            </div>
          </div>
        </section>
        <div className="connection-line">
          <span>
            <span
              className={`signal-dot ${fresh ? "connected" : "unavailable"}`}
            />
            {fresh
              ? "Ethereum mainnet"
              : state
                ? "Cached Ethereum data"
                : "Connecting to Ethereum"}
            <span className="connection-detail">
              {state
                ? ` · Updated ${Math.max(0, Math.floor((now - state.at) / 1000))}s ago`
                : " · Public, no wallet needed"}
            </span>
          </span>
          <button
            className="text-button"
            onClick={() => void chain.refresh()}
            disabled={chain.loading}
          >
            {chain.loading ? "Refreshing…" : "Refresh"}
            <span aria-hidden="true">↻</span>
          </button>
        </div>
        {chain.error && (
          <div className="network-notice" role="status">
            <span>
              {state ? "Showing the last successful read. " : ""}
              {chain.error}
            </span>
            <button
              className="text-button"
              disabled={chain.loading}
              onClick={() => void chain.refresh()}
            >
              Try again
            </button>
          </div>
        )}
        <section className="stats" aria-label="Live vault statistics">
          <div className="stat jackpot-stat">
            <span>Jackpot bank</span>
            <div className="stat-value gold mono">
              {amount(state?.bank, 5)} <span>ETH</span>
            </div>
            <span className="small muted">A jackpot wins 50% of the bank</span>
          </div>
          <div className="stat">
            <span>Vault free balance</span>
            <div className="stat-value mono">
              {amount(state?.vault)} <span>BEG</span>
            </div>
            <span className="small muted">Available for the next rolls</span>
          </div>
          <div className="stat">
            <span>Total attempts</span>
            <div className="stat-value mono">
              {state?.total.toLocaleString() ?? "—"}
            </div>
            <span className="small muted">Every plea lives onchain</span>
          </div>
          <div className="stat">
            <span>Batch {currentBatch ? `#${state?.openId}` : ""}</span>
            <div className="stat-value mono">
              {currentBatch?.size ?? "—"}
              <span> / 20</span>
            </div>
            <span className="small muted">
              {closeIn === undefined
                ? "30m window starts with first beg"
                : closeIn <= 0
                  ? "Window ended · ready to close"
                  : `${duration(closeIn)} left in this window`}
            </span>
          </div>
          <div className="stat">
            <span>Oracle budget</span>
            <div className="stat-value mono">
              {amount(state?.oracle)} <span>IMD</span>
            </div>
            <a className="small text-link violet" href="#keepers">
              Feed the judges <Arrow />
            </a>
          </div>
        </section>
        <div className="feed-odds-grid">
          <section
            id="feed"
            className="feed-section section"
            aria-labelledby="feed-title"
          >
            <div className="section-heading">
              <div>
                <h2 id="feed-title">The begging floor</h2>
                <p className="muted">
                  The latest pleas, straight from Ethereum.
                </p>
              </div>
              <span className="live-label">
                <span className="signal-dot" />
                Onchain
              </span>
            </div>
            <div
              className="filter-row"
              role="group"
              aria-label="Filter messages"
            >
              {["All", "Waiting", "Results"].map((f) => (
                <button
                  key={f}
                  className={`filter ${filter === f ? "selected" : ""}`}
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setFeedCount(6);
                  }}
                >
                  {f}
                </button>
              ))}
              <span className="small muted">{allAttempts.length} indexed</span>
            </div>
            <div className="messages">
              {visibleFeed.length ? (
                visibleFeed
                  .slice(0, feedCount)
                  .map((a) => <Message key={a.id} attempt={a} />)
              ) : (
                <Empty
                  title={
                    historyComplete
                      ? "The floor is yours."
                      : "Listening for the first words."
                  }
                >
                  {historyComplete
                    ? filter === "All"
                      ? "No one has begged yet. Your message could be the first."
                      : "No messages match this filter. Choose All to see the floor."
                    : "Messages appear here after Ethereum event history loads. You can still write your plea above."}
                </Empty>
              )}
            </div>
            {visibleFeed.length > feedCount && (
              <button
                className="button load-more"
                onClick={() => setFeedCount((n) => n + 10)}
              >
                Show more messages
              </button>
            )}
            <p className="small muted index-status">
              {eventStatus}
              {chain.historyError ? ` · ${chain.historyError}` : ""}
            </p>
          </section>
          <section
            id="odds"
            className="odds-section section"
            aria-labelledby="odds-title"
          >
            <div className="section-heading">
              <div>
                <h2 id="odds-title">Charm changes the odds.</h2>
                <p className="muted">A better score buys a better chance.</p>
              </div>
            </div>
            <div className="odds-panel">
              <div className="slider-heading">
                <label htmlFor="score-slider">Imagine your score</label>
                <output className="mono violet" htmlFor="score-slider">
                  {score}
                  <span className="muted"> /100</span>
                </output>
              </div>
              <input
                id="score-slider"
                type="range"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                aria-valuetext={`${score} out of 100`}
                style={{ "--range-fill": `${score}%` } as React.CSSProperties}
              />
              <div className="range-labels small muted">
                <span>Absolutely shameless</span>
                <span>Strangely convincing</span>
              </div>
              <div
                className="odds-table"
                role="table"
                aria-label={`Tier odds at score ${score}`}
              >
                <div className="odds-row table-head small muted" role="row">
                  <span role="columnheader">Outcome</span>
                  <span role="columnheader">Chance</span>
                  <span role="columnheader">Vault prize</span>
                </div>
                {[4, 3, 2, 1, 0].map((tier, i) => (
                  <div
                    className={`odds-row tier-${tier}`}
                    role="row"
                    key={tier}
                  >
                    <span role="cell">
                      <span className="tier-mark" aria-hidden="true">
                        {tier === 4 ? "✦" : tier === 0 ? "×" : "◇"}
                      </span>
                      {TIERS[tier]}
                    </span>
                    <span role="cell" className="mono">
                      {(odds[i] / 100).toFixed(2)}%
                    </span>
                    <span role="cell" className="mono">
                      {["1%", "0.05%", "0.01%", "0.002%", "0%"][i]}
                    </span>
                  </div>
                ))}
              </div>
              <p className="small gold jackpot-note">
                ✦ Jackpot also takes 50% of the ETH bank.
              </p>
              <p className="small muted odds-note">
                {oddsSource}. Prizes use the remaining free vault at each roll.
                Scores improve odds; no score guarantees a win. Missed reveal
                windows lower the best available tier.
              </p>
            </div>
          </section>
        </div>
        <section
          id="hall"
          className="section hall-section"
          aria-labelledby="hall-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="hall-title">Hall of shameless fame</h2>
              <p className="muted">Some words are worth more than others.</p>
            </div>
            <div
              className="filter-row compact"
              role="group"
              aria-label="Hall of fame ranking"
            >
              {["Highest scores", "Jackpot winners"].map((t) => (
                <button
                  key={t}
                  className={`filter ${hallTab === t ? "selected" : ""}`}
                  aria-pressed={hallTab === t}
                  onClick={() => setHallTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <p className="small muted">
            {hallTab === "Highest scores"
              ? "Top 10 graded messages, ranked by score."
              : "Every indexed jackpot winner."}{" "}
            {!historyComplete
              ? "Rankings are partial while history loads."
              : ""}
          </p>
          {(hallTab === "Highest scores" ? top : jackpots).length ? (
            <div className="fame-grid">
              {(hallTab === "Highest scores"
                ? top
                : jackpots.slice(0, hallCount)
              ).map((a, i) => (
                <div className="fame-entry" key={a.id}>
                  <span className="rank mono">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Message attempt={a} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                historyComplete
                  ? "Immortality is still available."
                  : "The legends are loading."
              }
            >
              {hallTab === "Highest scores"
                ? "The highest scores will live here after the swarm grades a batch."
                : "Jackpot winners appear here when their batch is revealed."}
            </Empty>
          )}
          {hallTab === "Jackpot winners" && jackpots.length > hallCount && (
            <button
              className="button load-more"
              onClick={() => setHallCount((n) => n + 10)}
            >
              Show more jackpot winners
            </button>
          )}
        </section>
        <section
          id="mine"
          className="section mine-section"
          aria-labelledby="mine-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="mine-title">Your corner of the swarm</h2>
              <p className="muted">
                Your attempts, winnings, and second chances.
              </p>
            </div>
            {wallet.address && (
              <span className="mono small">{short(wallet.address)}</span>
            )}
          </div>
          {!wallet.address ? (
            <div className="connect-prompt">
              <span className="corner-icon" aria-hidden="true">
                <Eye />
              </span>
              <div>
                <h3>Put a wallet to those words.</h3>
                <p className="muted">
                  Connect to see your attempts and claim what’s yours.
                </p>
              </div>
              <button className="button" onClick={openWallet}>
                Connect wallet <Arrow />
              </button>
            </div>
          ) : (
            <>
              <div className="claim-row">
                <div>
                  <span className="muted">Claimable tokens</span>
                  <strong className="mono">{amount(user?.tokens)} BEG</strong>
                </div>
                <div>
                  <span className="muted">Claimable ETH</span>
                  <strong className="mono gold">
                    {amount(user?.eth, 6)} ETH
                  </strong>
                </div>
                <button
                  className="button"
                  disabled={
                    !canWrite ||
                    !user ||
                    !!userError ||
                    user.tokens + user.eth === 0n
                  }
                  onClick={() => void run({ name: "claim" })}
                >
                  Claim rewards <Arrow />
                </button>
              </div>
              <p className="small muted">
                Refunds become claimable ETH. Use Claim rewards to withdraw.{" "}
                {cooldown > 0 ? `Next beg in ${duration(cooldown)}.` : ""}
              </p>
              {userError && (
                <p className="error-text" role="status">
                  {userError}
                </p>
              )}
              {mine.length ? (
                <div className="my-messages">
                  {mine.slice(0, mineCount).map((a) => (
                    <Message
                      key={a.id}
                      attempt={a}
                      disabled={!canWrite}
                      onRefund={(id) =>
                        void run({ name: "refund", id: BigInt(id) })
                      }
                    />
                  ))}
                </div>
              ) : (
                <Empty title="Your story starts with a beg.">
                  {historyComplete
                    ? "Your connected wallet has no indexed attempts yet."
                    : "Your attempts will appear as event history loads."}
                </Empty>
              )}
              {mine.length > mineCount && (
                <button
                  className="button load-more"
                  onClick={() => setMineCount((n) => n + 10)}
                >
                  Show more of my attempts
                </button>
              )}
            </>
          )}
        </section>
        <section
          id="keepers"
          className="section keepers-section"
          aria-labelledby="keepers-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="keepers-title">Keep the swarm moving.</h2>
              <p className="muted">
                No gatekeepers. Anyone can advance a batch.
              </p>
            </div>
          </div>
          <div className="keeper-grid">
            <div className="batch-panel">
              <h3>Batch controls</h3>
              <p className="bounty-note small">
                Revealer bounty{" "}
                <span className="mono gold">{formatEther(BOUNTY)} ETH</span>
              </p>
              <p className="small muted">
                Close after 30 minutes. Reveal after the roll block. Expire an
                unanswered request after 24 hours.
              </p>
              {state?.oracle === 0n && (
                <p className="small muted">
                  The oracle needs IMD before a batch can close.
                </p>
              )}
              {!batches.length ? (
                <div className="keeper-empty">
                  <span className="small muted">
                    {state
                      ? "No active batch needs a keeper yet."
                      : "Batch availability will appear when Ethereum responds."}
                  </span>
                  <div className="keeper-actions">
                    <button className="button" disabled>
                      Close batch
                    </button>
                    <button className="button" disabled>
                      Reveal
                    </button>
                    <button className="button" disabled>
                      Expire
                    </button>
                  </div>
                </div>
              ) : (
                batches.slice(0, batchCount).map((b) => {
                  const a = batchActions(
                    b,
                    state?.timestamp ?? 0,
                    state?.block ?? 0n,
                  );
                  return (
                    <div className="batch-row" key={b.id}>
                      <div className="batch-row-top">
                        <strong>Batch #{b.id}</strong>
                        <span className="small muted">
                          {b.size}/20 · {STATUSES[b.status]}
                        </span>
                      </div>
                      <p className="small muted">
                        {b.status === 0
                          ? `Closes ${a.close ? "now" : `in ${duration(a.closeAt - now / 1000)}`}. Refund timeout in ${duration(a.expireAt - now / 1000)}.`
                          : b.status === 1
                            ? `Oracle timeout in ${duration(a.expireAt - now / 1000)}.`
                            : `Reveal after block ${b.rollBlock.toLocaleString()}. Current block ${state?.block.toLocaleString()}.`}
                      </p>
                      {b.missedWindows > 0 && (
                        <p className="small error-text">
                          {b.missedWindows} missed window(s). Best possible
                          tier: {TIERS[Math.max(0, 4 - b.missedWindows)]}.
                        </p>
                      )}
                      {a.rearm && (
                        <p className="small error-text">
                          The reveal window was missed. Reveal rearms the roll
                          for two blocks later and forfeits the highest
                          remaining tier.
                        </p>
                      )}
                      <div className="keeper-actions">
                        <button
                          className="button"
                          disabled={
                            !canWrite || !a.close || state?.oracle === 0n
                          }
                          onClick={() =>
                            void run({ name: "closeBatch", id: BigInt(b.id) })
                          }
                        >
                          Close batch
                        </button>
                        <button
                          className="button"
                          disabled={!canWrite || !a.reveal}
                          onClick={() =>
                            void run({ name: "reveal", id: BigInt(b.id) })
                          }
                        >
                          {a.rearm ? "Rearm reveal" : "Reveal"}
                        </button>
                        <button
                          className="button"
                          disabled={!canWrite || !a.expire}
                          onClick={() =>
                            void run({ name: "expireBatch", id: BigInt(b.id) })
                          }
                        >
                          Expire
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {batches.length > batchCount && (
                <button
                  className="text-button"
                  onClick={() => setBatchCount((n) => n + 10)}
                >
                  Show more batches
                </button>
              )}
              <p className="small muted">
                {!wallet.address
                  ? "Connect a wallet to use available controls. "
                  : !fresh
                    ? "Waiting for fresh chain state. "
                    : ""}
                Bounty is credited on a successful roll when its ETH budget is
                funded. Available:{" "}
                <span className="mono">
                  {amount(state?.bountyBudget, 5)} ETH
                </span>
                .
              </p>
            </div>
            <div className="fund-panel">
              <h3>Fund the oracle</h3>
              <p className="muted">
                Even an all-seeing swarm has running costs.
              </p>
              <label htmlFor="imd-amount" className="small">
                Amount to donate
              </label>
              <div className="amount-input">
                <input
                  id="imd-amount"
                  type="text"
                  inputMode="decimal"
                  value={fund}
                  onChange={(e) => {
                    setFund(e.target.value);
                    setFundError("");
                  }}
                  aria-describedby="fund-hint fund-error"
                  aria-invalid={!!fundError}
                />
                <span className="mono muted">IMD</span>
              </div>
              <p id="fund-hint" className="small muted">
                0.5 IMD funds one batch at the quoted launch fee. The oracle’s
                current fee may change. Donations cannot be withdrawn.
              </p>
              {wallet.address && (
                <p className="small muted">
                  Your balance:{" "}
                  <span className="mono">{amount(user?.imd)} IMD</span>
                </p>
              )}
              <div className="fund-actions">
                <button
                  className="button"
                  disabled={!canWrite || !needsApproval || fundAmount <= 0n}
                  onClick={() => funding("approve")}
                >
                  {!needsApproval ? "IMD approved" : "1. Approve IMD"}
                </button>
                <button
                  className="button"
                  disabled={!canWrite || needsApproval || fundAmount <= 0n}
                  onClick={() => funding("fundOracle")}
                >
                  2. Fund oracle <Arrow />
                </button>
              </div>
              <p id="fund-error" role="alert" className="error-text">
                {fundError}
              </p>
              {!wallet.address && (
                <button className="text-button" onClick={openWallet}>
                  Connect to donate <Arrow />
                </button>
              )}
            </div>
          </div>
        </section>
        <section
          id="how"
          className="section how-section"
          aria-labelledby="how-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="how-title">How to beg the swarm</h2>
              <p className="muted">Five steps from a plea to a payout.</p>
            </div>
          </div>
          <ol className="steps">
            <li>
              <span className="step-number mono">01</span>
              <h3>Make your case</h3>
              <p>
                Write up to 280 bytes. Pay 0.005 ETH. Every message is public
                and unique, with a 10-minute wallet cooldown.
              </p>
            </li>
            <li>
              <span className="step-number mono">02</span>
              <h3>Meet your panel</h3>
              <p>
                At 20 messages, or after a 30-minute window, a batch goes to the
                IMD oracle for a score from 0 to 100.
              </p>
            </li>
            <li>
              <span className="step-number mono">03</span>
              <h3>Let fate roll</h3>
              <p>
                Higher scores improve your odds. Anyone can reveal after the
                roll block to settle the five prize tiers.
              </p>
            </li>
            <li>
              <span className="step-number mono">04</span>
              <h3>Collect the spoils</h3>
              <p>
                Claim your BEG and any ETH. A jackpot takes 1% of the remaining
                free vault and half the ETH bank.
              </p>
            </li>
            <li>
              <span className="step-number mono">05</span>
              <h3>Or get a refund</h3>
              <p>
                If the oracle fails, expire the batch after its timeout, refund
                your attempt, then claim your entry fee. Gas is not refunded.
              </p>
            </li>
          </ol>
          <div className="eth-split">
            <div>
              <h3>Where your ETH goes</h3>
              <p className="small muted">
                After grading. Entry fees stay in escrow until then.
              </p>
            </div>
            <div className="split-piece">
              <strong className="mono gold">80%+</strong>
              <span>Jackpot bank</span>
            </div>
            <div className="split-piece">
              <strong className="mono violet">≤10%</strong>
              <span>Oracle & revealer bounties</span>
            </div>
            <div className="split-piece">
              <strong className="mono">10%</strong>
              <span>Team</span>
            </div>
          </div>
          <p className="small muted split-explainer">
            The nominal split is 80 / 10 / 10. The contract caps the ETH bounty
            allocation at 0.001 ETH per batch and puts the excess in the jackpot
            bank. Oracle requests are paid separately in donated IMD.
          </p>
          <div className="immutable">
            <span className="immutable-mark" aria-hidden="true">
              ◇
            </span>
            <div>
              <h3>No owner. No admin. Immutable rules.</h3>
              <p className="muted">
                The vault started with 80% of the token supply. Nobody can pause
                it, change the rules, or sweep the prize pool.
              </p>
            </div>
            <div className="source-links">
              <a href={EXPLORER} target="_blank" rel="noreferrer">
                Read the contract <Arrow />
              </a>
              <a href={REPO} target="_blank" rel="noreferrer">
                Explore the source <Arrow />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer wrap">
        <div className="footer-top">
          <a className="wordmark" href="#">
            <Eye />
            <span>beg.</span>
          </a>
          <p className="muted">
            Dignity is temporary. The blockchain is forever.
          </p>
          <div>
            <a href="https://x.com/imdplace" target="_blank" rel="noreferrer">
              X <Arrow />
            </a>
            <a href={EXPLORER} target="_blank" rel="noreferrer">
              Blockscout <Arrow />
            </a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub <Arrow />
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="small muted">
            $BEG on Ethereum · No analytics. No trackers.
          </span>
          <button
            className="copy-address small"
            onClick={() => void copyAddress()}
          >
            <span>Token</span>
            <span className="mono">{BEG}</span>
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </footer>
      <div
        className={`transaction-notice ${txStage || txError ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {(txStage || txError) && (
          <>
            <div>
              <strong>
                {txError
                  ? "Transaction not sent"
                  : txStatus === "success"
                    ? "You’re onchain."
                    : txStatus === "reverted"
                      ? "Transaction reverted"
                      : "A word with Ethereum…"}
              </strong>
              <p className={txError ? "error-text" : ""}>
                {txError || txStage}
              </p>
              {txHash && (
                <a
                  href={`https://eth.blockscout.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction <Arrow />
                </a>
              )}
            </div>
            {!busy && (
              <button
                className="icon-button"
                aria-label="Dismiss transaction notice"
                onClick={() => {
                  setTxStage("");
                  setTxError("");
                  setTxStatus(undefined);
                }}
              >
                ×
              </button>
            )}
          </>
        )}
      </div>
      <WalletSheet wallet={wallet} open={picker} onClose={closePicker} />
    </>
  );
}
