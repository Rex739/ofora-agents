import "server-only";
import { createCoordinatorClient, getCrooSdkConstants } from "@/lib/croo/client";
import { getBidNormalizerServiceId, getCapOrderTimeoutMs } from "@/lib/croo/config";
import { getSharedCoordinatorRuntime } from "@/lib/croo/coordinator-runtime";
import {
  createBidNormalizerRequirements,
  mapLiveAgentUpdateToAgentRun,
  parseBidNormalizerDelivery,
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
  const serviceId = deps.serviceId ?? getBidNormalizerServiceId();
  const timeoutMs = deps.timeoutMs ?? getCapOrderTimeoutMs();
  if (!deps.createClient) {
    return getSharedCoordinatorRuntime({ createClient: createCoordinatorClient, constants }).request({
      agentLabel: "BidNormalizer",
      serviceId,
      requirements: createBidNormalizerRequirements(tender),
      parseDelivery: parseBidNormalizerDelivery,
      onStatus,
      timeoutMs,
      reconciliationIntervalMs: deps.reconciliationIntervalMs
    });
  }
  return requestLiveBidNormalizerCore(tender, onStatus, {
    createClient: deps.createClient,
    constants,
    serviceId,
    timeoutMs,
    reconciliationIntervalMs: deps.reconciliationIntervalMs
  });
}

export { mapLiveAgentUpdateToAgentRun, type BidNormalizerLifecycleUpdate, type LiveBidNormalizerResult };
