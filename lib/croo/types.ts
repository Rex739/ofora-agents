import type {
  AgentClient,
  APIError,
  DeliverableType,
  EventStream,
  EventType,
  isForbidden,
  isInsufficientBalance,
  isInvalidParams,
  isInvalidStatus,
  isNotFound,
  isUnauthorized
} from "@croo-network/sdk";
import type { LiveSpecialist } from "@/lib/croo/live-specialists";

export type CrooAgentClient = AgentClient;
export type CrooEventStream = EventStream;
export type CrooEventType = typeof EventType;
export type CrooDeliverableType = typeof DeliverableType;
export type CrooAPIError = APIError;

export type CrooErrorHelpers = {
  isForbidden: typeof isForbidden;
  isInsufficientBalance: typeof isInsufficientBalance;
  isInvalidParams: typeof isInvalidParams;
  isInvalidStatus: typeof isInvalidStatus;
  isNotFound: typeof isNotFound;
  isUnauthorized: typeof isUnauthorized;
};

export type CrooRuntimeStatus = {
  demoMode: boolean;
  allowLiveFallback: boolean;
  liveSpecialists: Set<LiveSpecialist>;
  policyLockLiveEnabled: boolean;
  bidNormalizerLiveEnabled: boolean;
  supplierRiskLiveEnabled: boolean;
  awardVerifierLiveEnabled: boolean;
  receiptWriterLiveEnabled: boolean;
  crooApiConfigured: boolean;
  coordinatorKeyConfigured: boolean;
  policyKeyConfigured: boolean;
  policyServiceConfigured: boolean;
  bidNormalizerKeyConfigured: boolean;
  bidNormalizerServiceConfigured: boolean;
  supplierRiskKeyConfigured: boolean;
  supplierRiskServiceConfigured: boolean;
};

export type PolicyLockLifecycleStatus =
  | "connecting"
  | "negotiating"
  | "order_created"
  | "payment_pending"
  | "paid"
  | "awaiting_delivery"
  | "confirming_delivery"
  | "completed"
  | "failed";
