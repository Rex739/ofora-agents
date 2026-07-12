import {
  mapLiveAgentUpdateToAgentRun,
  parseLiveAgentDelivery,
  requestLiveAgentCore,
  type LiveAgentLifecycleUpdate,
  type LiveAgentResult,
  type RequestLiveAgentDeps
} from "@/lib/croo/request-live-agent-core";
import { BidNormalizerOutputSchema, type BidNormalizerOutput, type TenderPacketInput } from "@/lib/schemas/ofora";

export type BidNormalizerLifecycleUpdate = LiveAgentLifecycleUpdate;
export type LiveBidNormalizerResult = LiveAgentResult<BidNormalizerOutput>;
export type RequestBidNormalizerDeps = RequestLiveAgentDeps;

export function createBidNormalizerRequirements(tender: TenderPacketInput) {
  return {
    tenderRef: tender.tenderId,
    managedValueUsd: tender.managedValueUsd,
    lockedPolicy: tender.lockedPolicy,
    tenderPacket: {
      tenderId: tender.tenderId,
      title: tender.title,
      buyer: tender.buyer,
      managedValueUsd: tender.managedValueUsd,
      selectedSupplier: tender.selectedSupplier,
      status: tender.status,
      purpose: tender.purpose,
      lockedPolicy: tender.lockedPolicy,
      suppliers: tender.suppliers.map((supplier) => ({
        name: supplier.name,
        submittedAt: supplier.submittedAt,
        bidAmountUsd: supplier.bidAmountUsd,
        deliveryDays: supplier.deliveryDays,
        documents: supplier.documents.map((document, index) => `synthetic_doc_${index + 1}_${document.replace(/\s+/g, "_").toLowerCase()}`),
        declaredConflicts: supplier.declaredConflicts,
        score: supplier.score
      }))
    }
  };
}

export async function requestLiveBidNormalizerCore(
  tender: TenderPacketInput,
  onStatus: (update: BidNormalizerLifecycleUpdate) => void,
  deps: RequestBidNormalizerDeps
): Promise<LiveBidNormalizerResult> {
  return requestLiveAgentCore({
    agentLabel: "BidNormalizer",
    requirements: createBidNormalizerRequirements(tender),
    parseDelivery: parseBidNormalizerDelivery,
    onStatus,
    deps
  });
}

export function parseBidNormalizerDelivery(deliverableText: string): BidNormalizerOutput {
  return parseLiveAgentDelivery(deliverableText, (value) => BidNormalizerOutputSchema.parse(value), "BidNormalizer");
}

export { mapLiveAgentUpdateToAgentRun };
