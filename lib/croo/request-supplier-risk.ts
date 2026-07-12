import "server-only";
import { createCoordinatorClient, getCrooSdkConstants } from "@/lib/croo/client";
import { getCapOrderTimeoutMs, getSupplierRiskServiceId } from "@/lib/croo/config";
import {
  mapLiveAgentUpdateToAgentRun,
  requestLiveSupplierRiskCore,
  type LiveSupplierRiskResult,
  type RequestSupplierRiskDeps,
  type SupplierRiskLifecycleUpdate
} from "@/lib/croo/request-supplier-risk-core";
import type { TenderPacketInput } from "@/lib/schemas/ofora";

type RequestDeps = Partial<RequestSupplierRiskDeps>;

export async function requestLiveSupplierRisk(
  tender: TenderPacketInput,
  onStatus: (update: SupplierRiskLifecycleUpdate) => void,
  deps: RequestDeps = {}
): Promise<LiveSupplierRiskResult> {
  const constants = deps.constants ?? await getCrooSdkConstants();
  return requestLiveSupplierRiskCore(tender, onStatus, {
    createClient: deps.createClient ?? createCoordinatorClient,
    constants,
    serviceId: deps.serviceId ?? getSupplierRiskServiceId(),
    timeoutMs: deps.timeoutMs ?? getCapOrderTimeoutMs(),
    reconciliationIntervalMs: deps.reconciliationIntervalMs
  });
}

export { mapLiveAgentUpdateToAgentRun, type LiveSupplierRiskResult, type SupplierRiskLifecycleUpdate };
