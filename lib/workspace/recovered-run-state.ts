import { OrchestrationRunSchema, type OrchestrationRun } from "@/lib/schemas/ofora";

export const SAFE_RECOVERED_RUN_STORAGE_KEY = "ofora-agents:recovered-policy-lock-run:v1";
export const DEFAULT_RECOVERABLE_POLICY_LOCK_ORDER_ID = "a4a3efe2-4de6-4836-9454-cd96d727faf8";

const unsafeKeyPattern = /(sdk|secret|auth|authorization|header|token|api[_-]?key|private[_-]?key)/i;

export type SafeRecoveredRunState = {
  version: 1;
  persistedAt: string;
  orderId: string;
  paymentTxHash?: string;
  deliveryId?: string;
  providerDeliveryTxHash?: string;
  runStatus: OrchestrationRun["status"];
  policyLockOutput: NonNullable<OrchestrationRun["outputs"]>["policyLock"];
  run: OrchestrationRun;
};

export function createSafeRecoveredRunState(run: OrchestrationRun | null, persistedAt = new Date().toISOString()): SafeRecoveredRunState | null {
  if (!run) return null;
  if (!isRecoveredPolicyLockRun(run)) return null;
  const policyLock = run.agents.find((agent) => agent.name === "PolicyLock");
  const policyLockOutput = run.outputs?.policyLock;
  if (!policyLock?.orderId || !policyLockOutput) return null;
  const state: SafeRecoveredRunState = {
    version: 1,
    persistedAt,
    orderId: policyLock.orderId,
    paymentTxHash: policyLock.txHash,
    deliveryId: policyLock.resultHash,
    providerDeliveryTxHash: policyLock.providerDeliveryTxHash,
    runStatus: run.status,
    policyLockOutput,
    run
  };
  return containsUnsafeKey(state) ? null : state;
}

export function serializeSafeRecoveredRunState(state: SafeRecoveredRunState) {
  if (containsUnsafeKey(state)) throw new Error("Recovered run state contains an unsafe key.");
  return JSON.stringify(state);
}

export function parseSafeRecoveredRunState(value: string | null): SafeRecoveredRunState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SafeRecoveredRunState>;
    if (parsed.version !== 1 || containsUnsafeKey(parsed)) return null;
    const run = OrchestrationRunSchema.parse(parsed.run);
    if (!isRecoveredPolicyLockRun(run)) return null;
    const state = createSafeRecoveredRunState(run, typeof parsed.persistedAt === "string" ? parsed.persistedAt : undefined);
    if (!state || state.orderId !== parsed.orderId) return null;
    return state;
  } catch {
    return null;
  }
}

export function isRecoveredPolicyLockRun(run: OrchestrationRun) {
  const policyLock = run.agents.find((agent) => agent.name === "PolicyLock");
  return Boolean(
    run.runId.startsWith("recovered-") &&
      run.status === "completed" &&
      run.outputs?.policyLock &&
      policyLock?.status === "delivered" &&
      policyLock.orderId &&
      policyLock.txHash &&
      !policyLock.txHash.startsWith("demo_")
  );
}

export function containsUnsafeKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsUnsafeKey);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => unsafeKeyPattern.test(key) || containsUnsafeKey(nested));
}
