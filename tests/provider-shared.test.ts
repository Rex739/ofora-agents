import assert from "node:assert/strict";
import test from "node:test";
import { runBidNormalizer } from "@/lib/agents/bid-normalizer";
import { runSupplierRisk } from "@/lib/agents/supplier-risk";
import { createBidNormalizerRequirements } from "@/lib/croo/request-bid-normalizer-core";
import { createSupplierRiskRequirements } from "@/lib/croo/request-supplier-risk-core";
import { demoTender } from "@/lib/demo/case";
import { BidNormalizerOutputSchema, SupplierRiskOutputSchema, TenderPacketInputSchema } from "@/lib/schemas/ofora";
import { createProviderEventHandlers } from "@/scripts/providers/shared";

type NegotiationRecord = {
  negotiationId: string;
  serviceId: string;
  requirements: string;
};

type MockRuntime = ReturnType<typeof createMockRuntime>;

function createMockRuntime(negotiations: Record<string, NegotiationRecord>, orderByNegotiation: Record<string, string> = {}) {
  return {
    accepted: [] as string[],
    delivered: [] as { orderId: string; deliverable: string }[],
    fetched: [] as string[],
    rejectedNegotiations: [] as { negotiationId: string; reason: string }[],
    rejectedOrders: [] as { orderId: string; reason: string }[],
    async getNegotiation(negotiationId: string) {
      this.fetched.push(negotiationId);
      const negotiation = negotiations[negotiationId];
      if (!negotiation) throw new Error("missing negotiation croo_sk_secret");
      return negotiation;
    },
    async acceptNegotiation(negotiationId: string) {
      this.accepted.push(negotiationId);
      return { orderId: orderByNegotiation[negotiationId] ?? `${negotiationId}-order` };
    },
    async rejectNegotiation(negotiationId: string, reason: string) {
      this.rejectedNegotiations.push({ negotiationId, reason });
    },
    async deliverOrder(orderId: string, deliverable: string) {
      this.delivered.push({ orderId, deliverable });
      return { deliveryId: `${orderId}-delivery`, resultHash: `${orderId}-hash`, txHash: "0xdeliver" };
    },
    async rejectOrder(orderId: string, reason: string) {
      this.rejectedOrders.push({ orderId, reason });
    },
    async listen() {
      return undefined;
    }
  };
}

test("BidNormalizer handles order_negotiation_created by fetching and accepting valid requirements", async () => {
  const requirements = createBidNormalizerRequirements(demoTender);
  const runtime = createMockRuntime({
    "bid-neg-1": { negotiationId: "bid-neg-1", serviceId: "bid-service", requirements: JSON.stringify(requirements) }
  });
  const handlers = createBidProviderHandlers(runtime, "bid-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "bid-neg-1", service_id: "bid-service" });
  await flushAsync();

  assert.deepEqual(runtime.fetched, ["bid-neg-1"]);
  assert.deepEqual(runtime.accepted, ["bid-neg-1"]);
  assert.equal(runtime.rejectedNegotiations.length, 0);
});

test("SupplierRisk handles order_negotiation_created by fetching and accepting valid requirements", async () => {
  const requirements = createSupplierRiskRequirements(demoTender);
  const runtime = createMockRuntime({
    "risk-neg-1": { negotiationId: "risk-neg-1", serviceId: "risk-service", requirements: JSON.stringify(requirements) }
  });
  const handlers = createRiskProviderHandlers(runtime, "risk-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "risk-neg-1", service_id: "risk-service" });
  await flushAsync();

  assert.deepEqual(runtime.fetched, ["risk-neg-1"]);
  assert.deepEqual(runtime.accepted, ["risk-neg-1"]);
  assert.equal(runtime.rejectedNegotiations.length, 0);
});

test("invalid requirements explicitly reject the negotiation before acceptance", async () => {
  const runtime = createMockRuntime({
    "bid-neg-invalid": { negotiationId: "bid-neg-invalid", serviceId: "bid-service", requirements: JSON.stringify({ tenderRef: demoTender.tenderId }) }
  });
  const handlers = createBidProviderHandlers(runtime, "bid-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "bid-neg-invalid", service_id: "bid-service" });
  await flushAsync();

  assert.deepEqual(runtime.fetched, ["bid-neg-invalid"]);
  assert.equal(runtime.accepted.length, 0);
  assert.deepEqual(runtime.rejectedNegotiations, [
    { negotiationId: "bid-neg-invalid", reason: "Invalid or unsupported BidNormalizer requirements." }
  ]);
});

test("payment confirmation generates and delivers BidNormalizer structured output", async () => {
  const requirements = createBidNormalizerRequirements(demoTender);
  const runtime = createMockRuntime({
    "bid-neg-paid": { negotiationId: "bid-neg-paid", serviceId: "bid-service", requirements: JSON.stringify(requirements) }
  }, { "bid-neg-paid": "bid-order-paid" });
  const handlers = createBidProviderHandlers(runtime, "bid-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "bid-neg-paid", service_id: "bid-service" });
  await flushAsync();
  handlers.onOrderPaid({ type: "order_paid", order_id: "bid-order-paid" });
  await flushAsync();

  assert.equal(runtime.delivered.length, 1);
  const delivered = BidNormalizerOutputSchema.parse(JSON.parse(runtime.delivered[0].deliverable) as unknown);
  assert.equal(delivered.agent, "BidNormalizer");
  assert.equal(delivered.normalizedSuppliers.length, demoTender.suppliers.length);
});

test("payment confirmation generates and delivers SupplierRisk structured output", async () => {
  const requirements = createSupplierRiskRequirements(demoTender);
  const runtime = createMockRuntime({
    "risk-neg-paid": { negotiationId: "risk-neg-paid", serviceId: "risk-service", requirements: JSON.stringify(requirements) }
  }, { "risk-neg-paid": "risk-order-paid" });
  const handlers = createRiskProviderHandlers(runtime, "risk-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "risk-neg-paid", service_id: "risk-service" });
  await flushAsync();
  handlers.onOrderPaid({ type: "order_paid", order_id: "risk-order-paid" });
  await flushAsync();

  assert.equal(runtime.delivered.length, 1);
  const delivered = SupplierRiskOutputSchema.parse(JSON.parse(runtime.delivered[0].deliverable) as unknown);
  assert.equal(delivered.agent, "SupplierRisk");
  assert.ok(delivered.riskFlags.length >= 1);
});

test("handler exceptions are logged safely and credentials are redacted", async () => {
  const runtime = createMockRuntime({});
  const handlers = createBidProviderHandlers(runtime, "bid-service");
  const logs = await captureLogs(async () => {
    handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "missing-neg", service_id: "bid-service" });
    await flushAsync();
  });

  assert.equal(runtime.accepted.length, 0);
  assert.equal(runtime.rejectedNegotiations.length, 1);
  assert.match(logs.join("\n"), /Requirements rejected/);
  assert.doesNotMatch(logs.join("\n"), /croo_sk_secret/);
  assert.match(logs.join("\n"), /\[REDACTED\]/);
});

test("one negotiation is accepted only once", async () => {
  const requirements = createBidNormalizerRequirements(demoTender);
  const runtime = createMockRuntime({
    "bid-neg-dup": { negotiationId: "bid-neg-dup", serviceId: "bid-service", requirements: JSON.stringify(requirements) }
  });
  const handlers = createBidProviderHandlers(runtime, "bid-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "bid-neg-dup", service_id: "bid-service" });
  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "bid-neg-dup", service_id: "bid-service" });
  await flushAsync();

  assert.deepEqual(runtime.fetched, ["bid-neg-dup"]);
  assert.deepEqual(runtime.accepted, ["bid-neg-dup"]);
});

test("unrelated negotiation and order events are ignored", async () => {
  const requirements = createSupplierRiskRequirements(demoTender);
  const runtime = createMockRuntime({
    "risk-neg-other": { negotiationId: "risk-neg-other", serviceId: "other-service", requirements: JSON.stringify(requirements) }
  });
  const handlers = createRiskProviderHandlers(runtime, "risk-service");

  handlers.onNegotiationCreated({ type: "order_negotiation_created", negotiation_id: "risk-neg-other", service_id: "other-service" });
  handlers.onOrderPaid({ type: "order_paid", order_id: "unrelated-order" });
  await flushAsync();

  assert.equal(runtime.fetched.length, 0);
  assert.equal(runtime.accepted.length, 0);
  assert.equal(runtime.delivered.length, 0);
});

function createBidProviderHandlers(runtime: MockRuntime, serviceId: string) {
  return createProviderEventHandlers({
    serviceName: "BidNormalizer",
    sdkKeyEnvName: "BID_NORMALIZER_SDK_KEY",
    runtime,
    async handlePaidOrder(requirements) {
      const tender = TenderPacketInputSchema.parse(requirements.tenderPacket);
      return JSON.stringify(BidNormalizerOutputSchema.parse(await runBidNormalizer(tender)));
    },
    validateRequirements(requirements) {
      if (requirements.tenderRef === undefined) throw new Error("Missing tenderRef.");
      if (requirements.managedValueUsd === undefined) throw new Error("Missing managedValueUsd.");
      if (requirements.lockedPolicy === undefined) throw new Error("Missing lockedPolicy.");
      TenderPacketInputSchema.parse(requirements.tenderPacket);
    }
  }, undefined, serviceId);
}

function createRiskProviderHandlers(runtime: MockRuntime, serviceId: string) {
  return createProviderEventHandlers({
    serviceName: "SupplierRisk",
    sdkKeyEnvName: "SUPPLIER_RISK_SDK_KEY",
    runtime,
    async handlePaidOrder(requirements) {
      const tender = TenderPacketInputSchema.parse(requirements.tenderPacket);
      return JSON.stringify(SupplierRiskOutputSchema.parse(await runSupplierRisk(tender)));
    },
    validateRequirements(requirements) {
      if (requirements.tenderRef === undefined) throw new Error("Missing tenderRef.");
      if (requirements.lockedRequirements === undefined) throw new Error("Missing lockedRequirements.");
      if (requirements.supplierScreening === undefined) throw new Error("Missing supplierScreening.");
      TenderPacketInputSchema.parse(requirements.tenderPacket);
    }
  }, undefined, serviceId);
}

async function captureLogs(run: () => Promise<void>) {
  const original = console.log;
  const logs: string[] = [];
  console.log = (message?: unknown, ...optional: unknown[]) => {
    logs.push([message, ...optional].map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console.log = original;
  }
  return logs;
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
