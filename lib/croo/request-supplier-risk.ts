import "server-only";
import { createCoordinatorClient, getCrooSdkConstants } from "@/lib/croo/client";
import { getCapOrderTimeoutMs, getSupplierRiskServiceId } from "@/lib/croo/config";
import { getSharedCoordinatorRuntime } from "@/lib/croo/coordinator-runtime";
import {
  createSupplierRiskRequirements,
  mapLiveAgentUpdateToAgentRun,
  parseSupplierRiskDelivery,
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
  const serviceId = deps.serviceId ?? getSupplierRiskServiceId();
  const timeoutMs = deps.timeoutMs ?? getCapOrderTimeoutMs();
  if (!deps.createClient) {
    return getSharedCoordinatorRuntime({ createClient: createCoordinatorClient, constants }).request({
      agentLabel: "SupplierRisk",
      serviceId,
      requirements: createSupplierRiskRequirements(tender),
      parseDelivery: parseSupplierRiskDelivery,
      onStatus,
      timeoutMs,
      reconciliationIntervalMs: deps.reconciliationIntervalMs
    });
  }
  return requestLiveSupplierRiskCore(tender, onStatus, {
    createClient: deps.createClient,
    constants,
    serviceId,
    timeoutMs,
    reconciliationIntervalMs: deps.reconciliationIntervalMs
  });
}

export { mapLiveAgentUpdateToAgentRun, type LiveSupplierRiskResult, type SupplierRiskLifecycleUpdate };
