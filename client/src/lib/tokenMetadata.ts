import type { SolanaProvider } from "./meteora";

const IRYS_DEVNET_URL = "https://devnet.irys.xyz";
/** ~450 bytes covers {name, symbol, image, description} JSON. */
const METADATA_BYTES = 460;
const FUNDING_MARGIN = 1.15;

export type HostedMetadata = {
  uri: string;
  uploadCostSol: number;
};

/**
 * Wallet-pays storage upload on Irys devnet: the creator funds ~0.0001 SOL
 * of devnet storage and signs the upload with Phantom. Non-custodial, no
 * API keys. The SDK is dynamically imported so it never enters the main
 * bundle.
 */
export async function estimateMetadataUploadCost(): Promise<number> {
  const { WebIrys } = await import("@irys/sdk");
  const irys = new WebIrys({
    url: IRYS_DEVNET_URL,
    token: "solana",
    wallet: { provider: {} as object },
  });
  const price = await irys.getPrice(METADATA_BYTES);
  return Number(price.toString()) / 1_000_000_000;
}

export async function uploadTokenMetadata(params: {
  name: string;
  symbol: string;
  imageUrl: string;
  description?: string;
  provider: SolanaProvider;
}): Promise<HostedMetadata> {
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot sign the storage upload");
  }
  const { WebIrys } = await import("@irys/sdk");
  const irys = new WebIrys({
    url: IRYS_DEVNET_URL,
    token: "solana",
    wallet: { provider: params.provider },
  });
  const body = JSON.stringify({
    name: params.name,
    symbol: params.symbol,
    image: params.imageUrl.trim(),
    description:
      params.description?.trim() ||
      `${params.name} (${params.symbol}) launched on the AgentBond public devnet beta.`,
  });
  const price = await irys.getPrice(body.length);
  const fundAmount = price.multipliedBy(FUNDING_MARGIN).integerValue();
  await irys.fund(fundAmount);
  const receipt = await irys.upload(body, {
    tags: [{ name: "Content-Type", value: "application/json" }],
  });
  return {
    uri: `${IRYS_DEVNET_URL}/${receipt.id}`,
    uploadCostSol: Number(fundAmount.toString()) / 1_000_000_000,
  };
}
