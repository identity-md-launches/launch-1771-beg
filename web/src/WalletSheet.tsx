import { useEffect, useRef } from "react";
import type { WalletState } from "./wallet";
const CoinbaseMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="7" fill="#2C5FF6" />
    <circle cx="14" cy="14" r="9.8" fill="white" />
    <rect x="10.8" y="10.8" width="6.4" height="6.4" rx=".7" fill="#2C5FF6" />
  </svg>
);
export function WalletSheet({
  wallet,
  open,
  onClose,
}: {
  wallet: WalletState;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (open && !d?.open) d?.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);
  useEffect(() => {
    if (wallet.address && wallet.chain === "0x1" && !wallet.pending) onClose();
  }, [wallet.address, wallet.chain, wallet.pending, onClose]);
  const url = location.href;
  return (
    <dialog
      ref={dialog}
      className="wallet-sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      aria-labelledby="wallet-title"
    >
      <div className="sheet-head">
        <h2 id="wallet-title">Connect a wallet</h2>
        <button
          onClick={onClose}
          aria-label="Close wallet picker"
          className="icon-button"
        >
          ×
        </button>
      </div>
      <p className="muted">Ethereum mainnet. Your wallet, your words.</p>
      <div className="wallet-options">
        {wallet.wallets.map((w) => (
          <button
            key={w.info.uuid}
            className="wallet-row"
            disabled={!!wallet.pending}
            onClick={() => void wallet.connect(w)}
          >
            {/^data:image\//.test(w.info.icon) ? (
              <img width="28" height="28" src={w.info.icon} alt="" />
            ) : (
              <span className="wallet-glyph" aria-hidden="true">
                ◈
              </span>
            )}
            <span>
              {w.info.name}
              {wallet.pending === w.info.rdns ? " · opening…" : ""}
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        ))}
        {!wallet.wallets.length && window.ethereum && (
          <button
            className="wallet-row"
            disabled={!!wallet.pending}
            onClick={() => void wallet.connect()}
          >
            <span className="wallet-glyph" aria-hidden="true">
              ◈
            </span>
            Browser wallet
          </button>
        )}
        {!wallet.wallets.length && !window.ethereum && (
          <>
            <a
              className="wallet-row"
              href={`https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`}
            >
              <img src="./wallet-metamask.svg" width="28" height="28" alt="" />
              <span>Open in MetaMask</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a
              className="wallet-row"
              href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`}
            >
              <CoinbaseMark />
              <span>Open in Coinbase Wallet</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a
              className="wallet-row"
              href={`https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`}
            >
              <img src="./wallet-rabby.svg" width="28" height="28" alt="" />
              <span>Open in Rabby</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a
              className="wallet-row"
              href={`https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}`}
            >
              <img src="./wallet-phantom.svg" width="28" height="28" alt="" />
              <span>Open in Phantom</span>
              <span aria-hidden="true">↗</span>
            </a>
          </>
        )}
        <button
          className="wallet-row"
          disabled={!!wallet.pending}
          onClick={() => void wallet.coinbase()}
        >
          <CoinbaseMark />
          <span>
            Coinbase Smart Wallet
            {wallet.pending === "coinbase" ? " · opening…" : ""}
          </span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p role="status" className="error-text">
        {wallet.error}
      </p>
      <p className="small muted">
        Connecting is free. You confirm every transaction in your wallet.
      </p>
    </dialog>
  );
}
