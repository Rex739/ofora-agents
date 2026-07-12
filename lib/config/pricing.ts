import type { AgentName } from "@/lib/schemas/ofora";

export const OFORA_PRICING = {
  coordinator: {
    priceCents: 30
  },
  specialists: {
    PolicyLock: 5,
    BidNormalizer: 5,
    SupplierRisk: 5,
    AwardVerifier: 5,
    ReceiptWriter: 5
  } satisfies Record<AgentName, number>,
  historicalOrders: {
    "a4a3efe2-4de6-4836-9454-cd96d727faf8": {
      actualOrderPriceCents: 40
    }
  }
} as const;

export const SPECIALIST_SPEND_CENTS = Object.values(OFORA_PRICING.specialists).reduce((total, cents) => total + cents, 0);
export const COORDINATOR_MARGIN_CENTS = OFORA_PRICING.coordinator.priceCents - SPECIALIST_SPEND_CENTS;

export const AGENT_PRICE_CENTS = OFORA_PRICING.specialists;
export const AGENT_PRICES = Object.fromEntries(
  Object.entries(AGENT_PRICE_CENTS).map(([agent, cents]) => [agent, formatUsdcCents(cents)])
) as Record<AgentName, string>;

export const USER_PRICE = formatUsdcCents(OFORA_PRICING.coordinator.priceCents);
export const SPECIALIST_SPEND = formatUsdcCents(SPECIALIST_SPEND_CENTS);
export const ORCHESTRATION_MARGIN = formatUsdcCents(COORDINATOR_MARGIN_CENTS);

export function formatUsdcCents(cents: number) {
  return `$${(cents / 100).toFixed(2)} USDC`;
}

export function getHistoricalOrderPrice(orderId?: string) {
  if (!orderId) return undefined;
  const historical = OFORA_PRICING.historicalOrders[orderId as keyof typeof OFORA_PRICING.historicalOrders];
  return historical ? formatUsdcCents(historical.actualOrderPriceCents) : undefined;
}
