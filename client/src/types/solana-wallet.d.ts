type SolanaWallet = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: "utf8") => Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    solana?: SolanaWallet;
    phantom?: { solana?: SolanaWallet };
  }
}

export type { SolanaWallet };
