import {
  mapLiveAgentUpdateToAgentRun,
  parseLiveAgentDelivery,
  requestLiveAgentCore,
  type LiveAgentLifecycleUpdate,
  type LiveAgentResult,
  type RequestLiveAgentDeps
} from "@/lib/croo/request-live-agent-core";
import { SupplierRiskOutputSchema, type SupplierRiskOutput, type TenderPacketInput } from "@/lib/schemas/ofora";

export type SupplierRiskLifecycleUpdate = LiveAgentLifecycleUpdate;
export type LiveSupplierRiskResult = LiveAgentResult<SupplierRiskOutput>;
export type RequestSupplierRiskDeps = RequestLiveAgentDeps;

export function createSupplierRiskRequirements(tender: TenderPacketInput) {
  return {
    tenderRef: tender.tenderId,
    lockedRequirements: tender.lockedPolicy.criteria.map((criterion) => ({
      name: criterion.name,
      weight: criterion.weight,
      description: criterion.description
    })),
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
        bidAmountUsd: 0,
        deliveryDays: supplier.deliveryDays,
        documents: Array.from({ length: supplier.documents.length }, (_, index) => `synthetic_document_present_${index + 1}`),
        declaredConflicts: supplier.declaredConflicts,
        score: supplier.score
      }))
    },
    supplierScreening: tender.suppliers.map((supplier) => ({
      supplier: supplier.name,
      documentationCount: supplier.documents.length,
      deliveryDays: supplier.deliveryDays,
      declaredConflicts: supplier.declaredConflicts
    }))
  };
}

export async function requestLiveSupplierRiskCore(
  tender: TenderPacketInput,
  onStatus: (update: SupplierRiskLifecycleUpdate) => void,
  deps: RequestSupplierRiskDeps
): Promise<LiveSupplierRiskResult> {
  return requestLiveAgentCore({
    agentLabel: "SupplierRisk",
    requirements: createSupplierRiskRequirements(tender),
    parseDelivery: parseSupplierRiskDelivery,
    onStatus,
    deps
  });
}

export function parseSupplierRiskDelivery(deliverableText: string): SupplierRiskOutput {
  return parseLiveAgentDelivery(deliverableText, (value) => SupplierRiskOutputSchema.parse(value), "SupplierRisk");
}

export { mapLiveAgentUpdateToAgentRun };
