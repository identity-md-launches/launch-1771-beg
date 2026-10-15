import type { Abi, Address } from "viem";
import vault from "./contracts/BegVault.json";
import token from "./contracts/LaunchToken.json";
export const VAULT: Address = "0x5c0a76dff019df3a3a118080ae3f073dc02bad13";
export const BEG: Address = "0x99e176e02691be327a3a00637d4a893c58264d0c";
export const IMD: Address = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
export const DEPLOY_BLOCK = 26193895n;
export const DEPLOY_TX =
  "0x62c5da78abeb12e9c90fe49dea664ec4d402d112b7000e997b0d3561dc0da284";
export const RUNTIME_HASH =
  "0xf699b3f7f88186815e72ce400e3da2c951fc0247bf710d2f061674215d366d4c";
export const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
];
export const vaultAbi = vault as Abi;
export const tokenAbi = token as Abi;
export const EXPLORER = `https://eth.blockscout.com/address/${VAULT}?tab=contract`;
export const REPO =
  "https://github.com/identity-md-launches/launch-1771-beg/tree/c97ea8b9742a756ef19a451d2170870a2df32371";
export const TRADE = `https://app.uniswap.org/explore/tokens/ethereum/${BEG}`;
export const PRICE = 5_000_000_000_000_000n;
export const BATCH_WINDOW = 1800;
export const ORACLE_TIMEOUT = 86400;
export const MAX_BATCH = 20;
export const BOUNTY = 1_000_000_000_000_000n;
export const CACHE_KEY = "beg:1:5c0a76df:v1";
export const CHAIN = {
  chainId: "0x1",
  chainName: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: RPC_URLS.slice(0, 1),
  blockExplorerUrls: ["https://etherscan.io"],
};
