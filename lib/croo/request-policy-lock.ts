import "server-only";
import { createCoordinatorClient, getCrooSdkConstants } from "@/lib/croo/client";
import { getCapOrderTimeoutMs, getPolicyLockServiceId } from "@/lib/croo/config";
import {
  mapPolicyLockUpdateToAgentRun,
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
  return requestLivePolicyLockCore(tender, onStatus, {
    createClient: deps.createClient ?? createCoordinatorClient,
    constants,
    serviceId: deps.serviceId ?? getPolicyLockServiceId(),
    timeoutMs: deps.timeoutMs ?? getCapOrderTimeoutMs()
  });
}

export async function recoverLivePolicyLockOrder(orderId: string): Promise<LivePolicyLockResult & { orderStatus?: string; providerDeliveryTxHash?: string }> {
  return recoverLivePolicyLockOrderCore(orderId, {
    createClient: createCoordinatorClient
  });
}

export { mapPolicyLockUpdateToAgentRun, type LivePolicyLockResult, type PolicyLockLifecycleUpdate };
