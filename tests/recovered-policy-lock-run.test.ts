import assert from "node:assert/strict";
import test from "node:test";
import { runPolicyLockRequirements, createPolicyLockRequirements } from "@/lib/agents/policy-lock-requirements";
import { createRecoveredPolicyLockRun } from "@/lib/agents/recovered-policy-lock-run";
import { demoTender } from "@/lib/demo/case";
import {
  containsUnsafeKey,
  createSafeRecoveredRunState,
  DEFAULT_RECOVERABLE_POLICY_LOCK_ORDER_ID,
  parseSafeRecoveredRunState,
  serializeSafeRecoveredRunState
} from "@/lib/workspace/recovered-run-state";

const recoveredPolicyLock = {
  mode: "live" as const,
  output: runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z")),
  orderId: DEFAULT_RECOVERABLE_POLICY_LOCK_ORDER_ID,
  paymentTxHash: "0xbf3cbb6a0979841ab473eb692795b32acb3baa14b78e94a47b47af0667f56fd5",
  receiptReference: "0xbf3cbb6a0979841ab473eb692795b32acb3baa14b78e94a47b47af0667f56fd5",
  deliveryReference: "759d3667-1e26-4838-9154-b707f849671c",
  providerDeliveryTxHash: "0xeaf5ade734111baf6b7912f43fcfcaba07b4c8bdd2887d561c8bb9b4473ec441",
  elapsedMs: 250,
  orderStatus: "completed"
};

test("recovered PolicyLock run completes mixed live/demo orchestration", async () => {
  const run = await createRecoveredPolicyLockRun(demoTender, recoveredPolicyLock);
  assert.equal(run.runId, "recovered-a4a3efe2");
  assert.equal(run.status, "completed");
  assert.equal(run.agents.filter((agent) => agent.status === "delivered").length, 5);
  assert.ok(run.outputs?.receiptWriter?.fairAwardReceiptSummary);

  const policyLock = run.agents.find((agent) => agent.name === "PolicyLock");
  assert.equal(policyLock?.orderId, DEFAULT_RECOVERABLE_POLICY_LOCK_ORDER_ID);
  assert.equal(policyLock?.price, "$0.05 USDC");
  assert.equal(policyLock?.actualOrderPrice, "$0.40 USDC");
  assert.equal(policyLock?.txHash, recoveredPolicyLock.paymentTxHash);
  assert.equal(policyLock?.resultHash, recoveredPolicyLock.deliveryReference);
  assert.equal(policyLock?.providerDeliveryTxHash, recoveredPolicyLock.providerDeliveryTxHash);

  const simulatedFallbackAgents = run.agents.filter((agent) => agent.name !== "PolicyLock");
  assert.equal(simulatedFallbackAgents.length, 4);
  assert.ok(simulatedFallbackAgents.every((agent) => agent.price === "$0.05 USDC"));
  assert.ok(simulatedFallbackAgents.every((agent) => !agent.actualOrderPrice));
  assert.ok(simulatedFallbackAgents.every((agent) => agent.orderId?.startsWith("demo_order_")));
  assert.ok(simulatedFallbackAgents.every((agent) => agent.txHash?.startsWith("demo_receipt_")));
  assert.ok(simulatedFallbackAgents.every((agent) => agent.resultHash?.startsWith("demo_delivery_")));
});

test("safe recovered state persists public run metadata without secrets", async () => {
  const run = await createRecoveredPolicyLockRun(demoTender, recoveredPolicyLock);
  const state = createSafeRecoveredRunState(run, "2026-07-12T00:00:00.000Z");
  assert.ok(state);
  assert.equal(state.orderId, DEFAULT_RECOVERABLE_POLICY_LOCK_ORDER_ID);
  assert.equal(state.runStatus, "completed");
  assert.equal(state.policyLockOutput?.policyIntegrity, "confirmed");

  const serialized = serializeSafeRecoveredRunState(state);
  assert.equal(serialized.includes("SDK"), false);
  assert.equal(serialized.includes("authentication"), false);
  assert.equal(serialized.includes("sdkKey"), false);
  assert.equal(serialized.includes("apiKey"), false);

  const restored = parseSafeRecoveredRunState(serialized);
  assert.equal(restored?.run.runId, "recovered-a4a3efe2");
});

test("safe recovered state rejects secret-shaped keys", () => {
  assert.equal(containsUnsafeKey({ sdkKey: "should-not-persist" }), true);
  assert.equal(containsUnsafeKey({ nested: { authorizationHeader: "bearer" } }), true);
});
