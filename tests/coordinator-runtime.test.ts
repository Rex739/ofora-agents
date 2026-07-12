import assert from "node:assert/strict";
import test from "node:test";
import type { Event } from "@croo-network/sdk";
import { resetCoordinatorPaymentQueueForTests } from "@/lib/croo/coordinator-payment-queue";
import { CoordinatorRuntime } from "@/lib/croo/coordinator-runtime";

const EventType = {
  OrderCreated: "order_created",
  NegotiationRejected: "order_negotiation_rejected",
  NegotiationExpired: "order_negotiation_expired",
  OrderRejected: "order_rejected",
  OrderExpired: "order_expired",
  OrderCompleted: "order_completed"
};

class MockStream {
  handlers = new Map<string, Array<(event: Event) => void>>();
  closed = false;

  on(type: string, handler: (event: Event) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  emit(type: string, event: Partial<Event>) {
    for (const handler of this.handlers.get(type) ?? []) {
      handler({ type, raw: {}, ...event } as Event);
    }
  }

  close() {
    this.closed = true;
  }
}

type Plan = {
  serviceId: string;
  negotiationId: string;
  orderId: string;
  deliverableText: string;
  payDelayMs?: number;
  status?: string;
};

function createSharedRuntimeHarness(plans: Plan[]) {
  const stream = new MockStream();
  let createClientCount = 0;
  let connectCount = 0;
  let negotiateCount = 0;
  let payCount = 0;
  let activePayments = 0;
  let maxActivePayments = 0;
  let getDeliveryActive = 0;
  let maxGetDeliveryActive = 0;
  const orders = new Map(plans.map((plan) => [plan.orderId, {
    status: plan.status ?? "created",
    payTxHash: "",
    deliverTxHash: "",
    plan
  }]));
  const byService = new Map(plans.map((plan) => [plan.serviceId, plan]));

  const client = {
    connectWebSocket: async () => {
      connectCount += 1;
      return stream;
    },
    negotiateOrder: async ({ serviceId }: { serviceId: string }) => {
      negotiateCount += 1;
      const plan = byService.get(serviceId);
      if (!plan) throw new Error(`No plan for ${serviceId}`);
      return { negotiationId: plan.negotiationId };
    },
    getOrder: async (orderId: string) => {
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown order ${orderId}`);
      return {
        orderId,
        negotiationId: order.plan.negotiationId,
        status: order.status,
        payTxHash: order.payTxHash,
        deliverTxHash: order.deliverTxHash
      };
    },
    payOrder: async (orderId: string) => {
      payCount += 1;
      activePayments += 1;
      maxActivePayments = Math.max(maxActivePayments, activePayments);
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown order ${orderId}`);
      if (order.plan.payDelayMs) await delay(order.plan.payDelayMs);
      order.status = "paid";
      order.payTxHash = `0xpay-${orderId}`;
      order.deliverTxHash = `0xdeliver-${orderId}`;
      activePayments -= 1;
      return { txHash: order.payTxHash, order: { status: order.status, payTxHash: order.payTxHash } };
    },
    getDelivery: async (orderId: string) => {
      getDeliveryActive += 1;
      maxGetDeliveryActive = Math.max(maxGetDeliveryActive, getDeliveryActive);
      await delay(10);
      getDeliveryActive -= 1;
      const order = orders.get(orderId);
      if (!order) throw new Error(`Unknown order ${orderId}`);
      return {
        deliveryId: `delivery-${orderId}`,
        orderId,
        providerAgentId: `provider-${orderId}`,
        deliverableType: "text",
        deliverableSchema: "",
        deliverableText: order.plan.deliverableText,
        contentHash: `content-${orderId}`,
        status: "accepted",
        submittedAt: "",
        verifiedAt: "",
        createdTime: "",
        updatedTime: "",
        txHash: `0xprovider-${orderId}`
      };
    }
  };
  const runtime = new CoordinatorRuntime({
    createClient: async () => {
      createClientCount += 1;
      return client as never;
    },
    constants: { EventType }
  });

  return {
    runtime,
    stream,
    getCreateClientCount: () => createClientCount,
    getConnectCount: () => connectCount,
    getNegotiateCount: () => negotiateCount,
    getPayCount: () => payCount,
    getMaxActivePayments: () => maxActivePayments,
    getMaxGetDeliveryActive: () => maxGetDeliveryActive,
    getOrderStatus: (orderId: string) => orders.get(orderId)?.status
  };
}

test("shared coordinator runtime creates only one websocket for three negotiations", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([
    plan("PolicyLock", "policy-service", "policy-neg", "policy-order"),
    plan("BidNormalizer", "bid-service", "bid-neg", "bid-order"),
    plan("SupplierRisk", "risk-service", "risk-neg", "risk-order")
  ]);

  const requests = startThreeRequests(harness.runtime);
  await tick();

  assert.equal(harness.getCreateClientCount(), 1);
  assert.equal(harness.getConnectCount(), 1);
  assert.equal(harness.getNegotiateCount(), 3);

  completePlan(harness.stream, "policy-service", "policy-neg", "policy-order");
  completePlan(harness.stream, "bid-service", "bid-neg", "bid-order");
  completePlan(harness.stream, "risk-service", "risk-neg", "risk-order");

  const results = await Promise.all(requests);
  assert.deepEqual(results.map((result) => result.output.agent).sort(), ["BidNormalizer", "PolicyLock", "SupplierRisk"]);
  assert.equal(harness.stream.closed, false);
});

test("runtime routes events by negotiation id and order id", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([
    plan("PolicyLock", "policy-service", "policy-neg", "policy-order"),
    plan("BidNormalizer", "bid-service", "bid-neg", "bid-order")
  ]);
  const policyUpdates: string[] = [];
  const bidUpdates: string[] = [];
  const policy = request(harness.runtime, "PolicyLock", "policy-service", policyUpdates);
  const bid = request(harness.runtime, "BidNormalizer", "bid-service", bidUpdates);

  await tick();
  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "bid-neg", order_id: "bid-order", service_id: "bid-service" });
  await tick();
  assert.equal(harness.getOrderStatus("bid-order"), "paid");
  assert.equal(harness.getOrderStatus("policy-order"), "created");
  assert.ok(bidUpdates.includes("paid"));
  assert.ok(!policyUpdates.includes("paid"));

  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "policy-neg", order_id: "policy-order", service_id: "policy-service" });
  harness.stream.emit(EventType.OrderCompleted, { order_id: "policy-order" });
  harness.stream.emit(EventType.OrderCompleted, { order_id: "bid-order" });

  const [policyResult, bidResult] = await Promise.all([policy, bid]);
  assert.equal(policyResult.orderId, "policy-order");
  assert.equal(bidResult.orderId, "bid-order");
});

test("unrelated stale completed event is ignored", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([plan("PolicyLock", "policy-service", "policy-neg", "policy-order")]);
  const logs = await captureInfo(async () => {
    const promise = request(harness.runtime, "PolicyLock", "policy-service");
    await tick();
    harness.stream.emit(EventType.OrderCompleted, { order_id: "old-order" });
    harness.stream.emit(EventType.OrderCreated, { negotiation_id: "policy-neg", order_id: "policy-order", service_id: "policy-service" });
    harness.stream.emit(EventType.OrderCompleted, { order_id: "policy-order" });
    const result = await promise;
    assert.equal(result.orderId, "policy-order");
  });

  assert.match(logs.join("\n"), /ignored unrelated event stage=order_completed/);
});

test("created order causes payOrder exactly once", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([plan("SupplierRisk", "risk-service", "risk-neg", "risk-order")]);
  const promise = request(harness.runtime, "SupplierRisk", "risk-service");
  await tick();

  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "risk-neg", order_id: "risk-order", service_id: "risk-service" });
  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "risk-neg", order_id: "risk-order", service_id: "risk-service" });
  harness.stream.emit(EventType.OrderCompleted, { order_id: "risk-order" });
  await promise;

  assert.equal(harness.getPayCount(), 1);
});

test("payment calls never overlap while delivery waits remain concurrent", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([
    plan("PolicyLock", "policy-service", "policy-neg", "policy-order", 1),
    plan("BidNormalizer", "bid-service", "bid-neg", "bid-order", 1),
    plan("SupplierRisk", "risk-service", "risk-neg", "risk-order", 1)
  ]);
  const requests = startThreeRequests(harness.runtime);
  await tick();

  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "policy-neg", order_id: "policy-order", service_id: "policy-service" });
  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "bid-neg", order_id: "bid-order", service_id: "bid-service" });
  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "risk-neg", order_id: "risk-order", service_id: "risk-service" });
  await delay(20);
  harness.stream.emit(EventType.OrderCompleted, { order_id: "policy-order" });
  harness.stream.emit(EventType.OrderCompleted, { order_id: "bid-order" });
  harness.stream.emit(EventType.OrderCompleted, { order_id: "risk-order" });
  await Promise.all(requests);

  assert.equal(harness.getPayCount(), 3);
  assert.equal(harness.getMaxActivePayments(), 1);
  assert.ok(harness.getMaxGetDeliveryActive() > 1);
});

test("already paying, paid, and completed orders are not paid again", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([
    { ...plan("PolicyLock", "policy-service", "policy-neg", "policy-order"), status: "paying" },
    { ...plan("BidNormalizer", "bid-service", "bid-neg", "bid-order"), status: "paid" },
    { ...plan("SupplierRisk", "risk-service", "risk-neg", "risk-order"), status: "completed" }
  ]);
  const requests = startThreeRequests(harness.runtime);
  await tick();

  completePlan(harness.stream, "policy-service", "policy-neg", "policy-order");
  completePlan(harness.stream, "bid-service", "bid-neg", "bid-order");
  completePlan(harness.stream, "risk-service", "risk-neg", "risk-order");
  await Promise.all(requests);

  assert.equal(harness.getPayCount(), 0);
});

test("one specialist failure does not fail successful specialists", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([
    plan("PolicyLock", "policy-service", "policy-neg", "policy-order"),
    plan("BidNormalizer", "bid-service", "bid-neg", "bid-order")
  ]);
  const policy = request(harness.runtime, "PolicyLock", "policy-service");
  const bid = request(harness.runtime, "BidNormalizer", "bid-service");
  await tick();

  harness.stream.emit(EventType.NegotiationRejected, { negotiation_id: "policy-neg", service_id: "policy-service", reason: "provider rejected" });
  harness.stream.emit(EventType.OrderCreated, { negotiation_id: "bid-neg", order_id: "bid-order", service_id: "bid-service" });
  harness.stream.emit(EventType.OrderCompleted, { order_id: "bid-order" });

  const [policyResult, bidResult] = await Promise.allSettled([policy, bid]);
  assert.equal(policyResult.status, "rejected");
  assert.equal(bidResult.status, "fulfilled");
});

test("runtime logs redact unrelated credential-shaped event values", async () => {
  resetCoordinatorPaymentQueueForTests();
  const harness = createSharedRuntimeHarness([plan("PolicyLock", "policy-service", "policy-neg", "policy-order")]);
  const logs = await captureInfo(async () => {
    const promise = request(harness.runtime, "PolicyLock", "policy-service");
    await tick();
    harness.stream.emit(EventType.OrderCompleted, { order_id: "order?key=secret", negotiation_id: "croo_sk_secret" });
    completePlan(harness.stream, "policy-service", "policy-neg", "policy-order");
    await promise;
  });

  assert.doesNotMatch(logs.join("\n"), /croo_sk_secret|key=secret/);
  assert.match(logs.join("\n"), /\[REDACTED\]/);
});

function startThreeRequests(runtime: CoordinatorRuntime) {
  return [
    request(runtime, "PolicyLock", "policy-service"),
    request(runtime, "BidNormalizer", "bid-service"),
    request(runtime, "SupplierRisk", "risk-service")
  ];
}

function request(runtime: CoordinatorRuntime, agentLabel: string, serviceId: string, updates: string[] = []) {
  return runtime.request({
    agentLabel,
    serviceId,
    requirements: { tenderId: "OFR-2026-041" },
    parseDelivery: (value) => JSON.parse(value) as { agent: string },
    onStatus: (update) => updates.push(update.status),
    timeoutMs: 250,
    reconciliationIntervalMs: 100
  });
}

function plan(agent: string, serviceId: string, negotiationId: string, orderId: string, payDelayMs = 0): Plan {
  return {
    serviceId,
    negotiationId,
    orderId,
    deliverableText: JSON.stringify({ agent }),
    payDelayMs
  };
}

function completePlan(stream: MockStream, serviceId: string, negotiationId: string, orderId: string) {
  stream.emit(EventType.OrderCreated, { negotiation_id: negotiationId, order_id: orderId, service_id: serviceId });
  stream.emit(EventType.OrderCompleted, { order_id: orderId });
}

async function captureInfo(run: () => Promise<void>) {
  const original = console.info;
  const logs: string[] = [];
  console.info = (message?: unknown, ...optional: unknown[]) => {
    logs.push([message, ...optional].map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console.info = original;
  }
  return logs;
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
