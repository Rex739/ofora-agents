import "server-only";
import { createCoordinatorClient, getCrooSdkConstants } from "@/lib/croo/client";
import { getCapOrderTimeoutMs, getPolicyLockServiceId } from "@/lib/croo/config";
import { createPolicyLockRequirements } from "@/lib/agents/policy-lock-requirements";
import { getSharedCoordinatorRuntime } from "@/lib/croo/coordinator-runtime";
import {
  mapPolicyLockUpdateToAgentRun,
  parsePolicyLockDelivery,
  recoverLivePolicyLockOrder as recoverLivePolicyLockOrderCore,
  requestLivePolicyLockCore,
  type LivePolicyLockResult,
  type PolicyLockLifecycleUpdate,
  type RequestPolicyLockDeps
} from "@/lib/croo/request-policy-lock-core";
import type { TenderPacketInput } from "@/lib/schemas/ofora";

type RequestDeps = Partial<RequestPolicyLockDeps>;

export async function requestLivePolicyLock(
  tender: TenderPacketInput,
  onStatus: (update: PolicyLockLifecycleUpdate) => void,
  deps: RequestDeps = {}
): Promise<LivePolicyLockResult> {
  const constants = deps.constants ?? await getCrooSdkConstants();
  const serviceId = deps.serviceId ?? getPolicyLockServiceId();
  const timeoutMs = deps.timeoutMs ?? getCapOrderTimeoutMs();
  if (!deps.createClient) {
    return getSharedCoordinatorRuntime({ createClient: createCoordinatorClient, constants }).request({
      agentLabel: "PolicyLock",
      serviceId,
      requirements: createPolicyLockRequirements(tender),
      parseDelivery: parsePolicyLockDelivery,
      onStatus,
      timeoutMs,
      reconciliationIntervalMs: deps.reconciliationIntervalMs
    });
  }
  return requestLivePolicyLockCore(tender, onStatus, {
    createClient: deps.createClient,
    constants,
    serviceId,
    timeoutMs,
    reconciliationIntervalMs: deps.reconciliationIntervalMs
  });
}

export async function recoverLivePolicyLockOrder(orderId: string): Promise<LivePolicyLockResult & { orderStatus?: string; providerDeliveryTxHash?: string }> {
  return recoverLivePolicyLockOrderCore(orderId, {
    createClient: createCoordinatorClient
  });
}

export { mapPolicyLockUpdateToAgentRun, type LivePolicyLockResult, type PolicyLockLifecycleUpdate };
