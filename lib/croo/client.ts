import "server-only";
import { CrooConfigError } from "@/lib/croo/errors";
import { getCoordinatorSdkKey, getPolicyLockSdkKey, getProviderConfig, getRequesterConfig, type CrooClientConfig } from "@/lib/croo/config";
import { createRedactedLogger } from "@/lib/croo/redacted-logger";
import type { CrooAgentClient, CrooDeliverableType, CrooErrorHelpers, CrooEventType } from "@/lib/croo/types";

type CrooSdkModule = typeof import("@croo-network/sdk");

export async function loadCrooSdk() {
  const sdk = (await import("@croo-network/sdk")) as CrooSdkModule;
  if (!sdk.AgentClient) {
    throw new CrooConfigError("@croo-network/sdk did not expose AgentClient.");
  }
  return sdk;
}

export async function createCoordinatorClient(): Promise<CrooAgentClient> {
  return createClient(getRequesterConfig(), getCoordinatorSdkKey());
}

export async function createPolicyLockProviderClient(): Promise<CrooAgentClient> {
  return createClient(getProviderConfig(), getPolicyLockSdkKey());
}

export async function getCrooSdkConstants(): Promise<{ EventType: CrooEventType; DeliverableType: CrooDeliverableType; errors: CrooErrorHelpers }> {
  const sdk = await loadCrooSdk();
  return {
    EventType: sdk.EventType,
    DeliverableType: sdk.DeliverableType,
    errors: {
      isForbidden: sdk.isForbidden,
      isInsufficientBalance: sdk.isInsufficientBalance,
      isInvalidParams: sdk.isInvalidParams,
      isInvalidStatus: sdk.isInvalidStatus,
      isNotFound: sdk.isNotFound,
      isUnauthorized: sdk.isUnauthorized
    }
  };
}

async function createClient(config: CrooClientConfig, sdkKey: string): Promise<CrooAgentClient> {
  const { AgentClient } = await loadCrooSdk();
  if (!AgentClient) {
    throw new CrooConfigError("@croo-network/sdk did not expose AgentClient.");
  }
  return new AgentClient({ ...config, logger: createRedactedLogger() }, sdkKey);
}
