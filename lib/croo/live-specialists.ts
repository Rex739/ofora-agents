import type { AgentName } from "@/lib/schemas/ofora";

export type LiveSpecialist = "policy" | "bids" | "risk" | "award" | "receipt";

const aliases: Record<string, LiveSpecialist> = {
  policy: "policy",
  policylock: "policy",
  bids: "bids",
  bid: "bids",
  bidnormalizer: "bids",
  risk: "risk",
  supplierrisk: "risk",
  award: "award",
  awardverifier: "award",
  receipt: "receipt",
  receiptwriter: "receipt"
};

export const liveSpecialistAgentNames: Record<LiveSpecialist, AgentName> = {
  policy: "PolicyLock",
  bids: "BidNormalizer",
  risk: "SupplierRisk",
  award: "AwardVerifier",
  receipt: "ReceiptWriter"
};

export function resolveLiveSpecialists(value?: string): LiveSpecialist[] {
  const resolved: LiveSpecialist[] = [];
  for (const rawEntry of (value ?? "").split(",")) {
    const normalized = rawEntry.trim().toLowerCase();
    if (!normalized) continue;
    const specialist = aliases[normalized];
    if (!specialist) {
      throw new Error(`Unknown LIVE_SPECIALISTS entry: ${rawEntry.trim()}`);
    }
    if (!resolved.includes(specialist)) resolved.push(specialist);
  }
  return resolved;
}

export function getLiveSpecialistAgentNames(value?: string) {
  return resolveLiveSpecialists(value).map((specialist) => liveSpecialistAgentNames[specialist]);
}
