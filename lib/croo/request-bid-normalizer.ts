import "server-only";
import { createCoordinatorClient, getCrooSdkConstants } from "@/lib/croo/client";
import { getBidNormalizerServiceId, getCapOrderTimeoutMs } from "@/lib/croo/config";
import {
  mapLiveAgentUpdateToAgentRun,
  requestLiveBidNormalizerCore,
  type BidNormalizerLifecycleUpdate,
  type LiveBidNormalizerResult,
  type RequestBidNormalizerDeps
} from "@/lib/croo/request-bid-normalizer-core";
import type { TenderPacketInput } from "@/lib/schemas/ofora";

type RequestDeps = Partial<RequestBidNormalizerDeps>;

export async function requestLiveBidNormalizer(
  tender: TenderPacketInput,
  onStatus: (update: BidNormalizerLifecycleUpdate) => void,
  deps: RequestDeps = {}
): Promise<LiveBidNormalizerResult> {
  const constants = deps.constants ?? await getCrooSdkConstants();
  return requestLiveBidNormalizerCore(tender, onStatus, {
    createClient: deps.createClient ?? createCoordinatorClient,
    constants,
    serviceId: deps.serviceId ?? getBidNormalizerServiceId(),
    timeoutMs: deps.timeoutMs ?? getCapOrderTimeoutMs(),
    reconciliationIntervalMs: deps.reconciliationIntervalMs
  });
}

export { mapLiveAgentUpdateToAgentRun, type BidNormalizerLifecycleUpdate, type LiveBidNormalizerResult };
