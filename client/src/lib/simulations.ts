export const simulatedWallets = {
  phantom: {
    name: "Phantom",
    address: "7xKp4n…m4Q2",
    network: "Solana testnet",
  },
  metamask: {
    name: "MetaMask",
    address: "0xAGNT…B042",
    network: "Ethereum testnet",
  },
} as const;

export type SimulatedWallet = keyof typeof simulatedWallets;

export type TelemetryPeriod = "24H" | "7D" | "30D";

export function getTelemetryPeriodOffset(period: TelemetryPeriod) {
  return { "24H": 0, "7D": -3, "30D": -7 }[period];
}

export function calculateAgntReward(
  amount: number,
  durationDays: number,
  annualRate = 0.128
) {
  const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const safeDuration = Math.max(
    0,
    Number.isFinite(durationDays) ? durationDays : 0
  );
  return Number((safeAmount * annualRate * (safeDuration / 365)).toFixed(2));
}

export function calculateAgntApy(durationDays: number) {
  if (durationDays >= 90) return 15.4;
  if (durationDays >= 60) return 14.2;
  return 12.8;
}
