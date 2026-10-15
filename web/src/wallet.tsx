import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress, type Address, type Hex } from "viem";
import { CHAIN } from "./config";
import { humanError } from "./errors";
export interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: (value: unknown) => void): void;
  removeListener?(event: string, callback: (value: unknown) => void): void;
}
export type Wallet = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Provider;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
const STORAGE = "beg:wallet";
let smartProvider: Promise<Provider> | undefined;
function getSmartProvider() {
  return (smartProvider ??= (async () => {
    const { createCoinbaseWalletSDK } = await import("@coinbase/wallet-sdk");
    const sdk = createCoinbaseWalletSDK({
      appName: "Beg the Swarm",
      appLogoUrl: new URL("favicon.svg", document.baseURI).href,
      appChainIds: [1],
      preference: { options: "smartWalletOnly" },
    });
    return sdk.getProvider() as unknown as Provider;
  })());
}

export function useWallet() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [address, setAddress] = useState<Address>();
  const [chain, setChain] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const current = useRef<Provider | undefined>(undefined);
  const bind = useCallback(async (p: Provider, prompt: boolean) => {
    const accounts = (await p.request({
      method: prompt ? "eth_requestAccounts" : "eth_accounts",
    })) as string[];
    if (!accounts.length) return;
    const chainId = (await p.request({ method: "eth_chainId" })) as string;
    current.current = p;
    setProvider(p);
    setAddress(getAddress(accounts[0]));
    setChain(chainId);
  }, []);
  useEffect(() => {
    const discover = (event: Event) => {
      const detail = (event as CustomEvent<Wallet>).detail;
      if (!detail?.provider?.request || !detail.info?.uuid) return;
      setWallets((w) =>
        w.some((x) => x.info.uuid === detail.info.uuid) ? w : [...w, detail],
      );
      try {
        if (
          localStorage.getItem(STORAGE) === detail.info.rdns &&
          !current.current
        )
          void bind(detail.provider, false).catch(() => {});
      } catch {
        /* no storage */
      }
    };
    window.addEventListener("eip6963:announceProvider", discover);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum) {
      try {
        if (localStorage.getItem(STORAGE) === "browser")
          void bind(window.ethereum, false).catch(() => {});
      } catch {
        /* no storage */
      }
    }
    try {
      if (localStorage.getItem(STORAGE) === "coinbase")
        void getSmartProvider()
          .then((p) => bind(p, false))
          .catch(() => {});
    } catch {
      /* no storage */
    }
    return () =>
      window.removeEventListener("eip6963:announceProvider", discover);
  }, [bind]);
  useEffect(() => {
    if (!provider) return;
    const accounts = (v: unknown) => {
      const a = v as string[];
      setAddress(a?.[0] ? getAddress(a[0]) : undefined);
    };
    const network = (v: unknown) => setChain(String(v));
    const disconnect = () => {
      setAddress(undefined);
      setProvider(undefined);
      current.current = undefined;
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", network);
    provider.on?.("disconnect", disconnect);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", network);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider]);
  async function switchChain(p = provider) {
    if (!p) throw new Error("Connect your wallet first.");
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1" }],
      });
    } catch (e) {
      if ((e as { code?: number }).code === 4902)
        await p.request({ method: "wallet_addEthereumChain", params: [CHAIN] });
      else throw e;
    }
    const id = String(await p.request({ method: "eth_chainId" }));
    setChain(id);
    if (id !== "0x1")
      throw new Error("Switch your wallet to Ethereum mainnet to continue.");
  }
  async function connect(wallet?: Wallet) {
    const key = wallet?.info.rdns || "browser";
    setPending(key);
    setError("");
    try {
      const p = wallet?.provider || window.ethereum;
      if (!p)
        throw new Error(
          "No browser wallet was found. Open this page in a wallet browser or choose Coinbase Smart Wallet.",
        );
      await bind(p, true);
      try {
        localStorage.setItem(STORAGE, key);
      } catch {
        /* no storage */
      }
      if ((await p.request({ method: "eth_chainId" })) !== "0x1")
        await switchChain(p);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setPending("");
    }
  }
  async function coinbase() {
    setPending("coinbase");
    setError("");
    try {
      const p = await getSmartProvider();
      await bind(p, true);
      try {
        localStorage.setItem(STORAGE, "coinbase");
      } catch {
        /* no storage */
      }
      if ((await p.request({ method: "eth_chainId" })) !== "0x1")
        await switchChain(p);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setPending("");
    }
  }
  function disconnect() {
    current.current = undefined;
    setAddress(undefined);
    setProvider(undefined);
    setChain("");
    try {
      localStorage.removeItem(STORAGE);
    } catch {
      /* no storage */
    }
  }
  return {
    wallets,
    provider,
    address,
    chain,
    pending,
    error,
    connect,
    coinbase,
    disconnect,
    switchChain,
    clearError: () => setError(""),
  };
}
export async function assertWallet(provider: Provider, address: Address) {
  const [chain, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  if (chain !== "0x1")
    throw new Error("Switch your wallet to Ethereum mainnet to continue.");
  if (
    !(accounts as string[]).some(
      (a) => a.toLowerCase() === address.toLowerCase(),
    )
  )
    throw new Error("Your wallet account changed. Reconnect and try again.");
}
export type WalletState = ReturnType<typeof useWallet>;
export type TransactionHash = Hex;
