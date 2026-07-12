import assert from "node:assert/strict";
import test from "node:test";
import type { Event } from "@croo-network/sdk";
import { requestLivePolicyLockCore, parsePolicyLockDelivery, recoverLivePolicyLockOrder } from "@/lib/croo/request-policy-lock-core";
import { runPolicyLockRequirements, createPolicyLockRequirements } from "@/lib/agents/policy-lock-requirements";
import { demoTender } from "@/lib/demo/case";

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

function createMockClient(stream: MockStream, deliverableText: string, options: { deliveryFailuresBeforeSuccess?: number; orderStatus?: string } = {}) {
  let payCount = 0;
  let deliveryAttempts = 0;
  let orderStatus = options.orderStatus ?? "created";
  let payTxHash = orderStatus === "created" ? "" : "0xpay";
  let deliverTxHash = orderStatus === "created" ? "" : "0xdeliver";
  return {
    client: {
      connectWebSocket: async () => stream,
      negotiateOrder: async () => ({ negotiationId: "neg-1" }),
      getOrder: async () => ({
        orderId: "order-1",
        negotiationId: "neg-1",
        status: orderStatus,
        payTxHash,
        deliverTxHash
      }),
      payOrder: async () => {
        payCount += 1;
        orderStatus = "paid";
        payTxHash = "0xpay";
        deliverTxHash = "0xdeliver";
        return { txHash: "0xpay", order: { status: orderStatus, payTxHash } };
      },
      getDelivery: async () => ({
        ...getMockDelivery()
      })
    },
    getPayCount: () => payCount,
    getDeliveryAttempts: () => deliveryAttempts
  };

  function getMockDelivery() {
    deliveryAttempts += 1;
    if (deliveryAttempts <= (options.deliveryFailuresBeforeSuccess ?? 0)) {
      throw new Error("delivery not found");
    }
    return {
      deliveryId: "delivery-1",
      orderId: "order-1",
      providerAgentId: "provider-1",
      deliverableType: "text",
      deliverableSchema: "",
      deliverableText,
      contentHash: "content-1",
      status: "accepted",
      submittedAt: "",
      verifiedAt: "",
      createdTime: "",
      updatedTime: ""
    };
  }
}

test("valid PolicyLock delivery parses successfully", () => {
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  assert.equal(parsePolicyLockDelivery(JSON.stringify(output)).policyIntegrity, "confirmed");
});

test("invalid JSON delivery fails", () => {
  assert.throws(() => parsePolicyLockDelivery("{bad json"));
});

test("schema-invalid delivery fails", () => {
  assert.throws(() => parsePolicyLockDelivery(JSON.stringify({ agent: "PolicyLock" })));
});

test("requester pays once and leaves absent optional references undefined", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output));
  const updates: string[] = [];
  const promise = requestLivePolicyLockCore(demoTender, (update) => updates.push(update.status), {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "policy-service",
    timeoutMs: 200,
    reconciliationIntervalMs: 10
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "neg-1", order_id: "order-1", service_id: "policy-service" });
  stream.emit(EventType.OrderCreated, { negotiation_id: "neg-1", order_id: "order-1", service_id: "policy-service" });
  await tick();
  stream.emit(EventType.OrderCompleted, { order_id: "order-1" });
  const result = await promise;

  assert.equal(mock.getPayCount(), 1);
  assert.equal(result.orderId, "order-1");
  assert.equal(result.paymentTxHash, "0xpay");
  assert.equal(result.receiptReference, "0xpay");
  assert.equal(result.deliveryReference, "delivery-1");
  assert.equal(stream.closed, true);
  assert.ok(updates.includes("completed"));
});

test("timeout closes the websocket stream", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output));
  await assert.rejects(
    requestLivePolicyLockCore(demoTender, () => undefined, {
      createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "policy-service",
      timeoutMs: 5,
      reconciliationIntervalMs: 10
    })
  );
  assert.equal(stream.closed, true);
});

test("missed OrderCompleted event is recovered through polling", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output));
  const promise = requestLivePolicyLockCore(demoTender, () => undefined, {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "policy-service",
    timeoutMs: 200,
    reconciliationIntervalMs: 5
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "neg-1", order_id: "order-1", service_id: "policy-service" });
  const result = await promise;
  assert.equal(result.deliveryReference, "delivery-1");
  assert.equal(mock.getPayCount(), 1);
});

test("event and polling race resolves only once", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output));
  let completedUpdates = 0;
  const promise = requestLivePolicyLockCore(demoTender, (update) => {
    if (update.status === "completed") completedUpdates += 1;
  }, {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "policy-service",
    timeoutMs: 200,
    reconciliationIntervalMs: 5
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "neg-1", order_id: "order-1", service_id: "policy-service" });
  await tick();
  stream.emit(EventType.OrderCompleted, { order_id: "order-1" });
  const result = await promise;
  assert.equal(result.orderId, "order-1");
  assert.equal(completedUpdates, 1);
});

test("recovery function never invokes payOrder", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output));
  const result = await recoverLivePolicyLockOrder("order-1", {
    createClient: async () => mock.client as never
  });
  assert.equal(result.output.policyIntegrity, "confirmed");
  assert.equal(mock.getPayCount(), 0);
});

test("recovery function fails safely on invalid recovered JSON", async () => {
  const stream = new MockStream();
  const mock = createMockClient(stream, "{not-json");
  await assert.rejects(
    recoverLivePolicyLockOrder("order-1", {
      createClient: async () => mock.client as never
    })
  );
  assert.equal(mock.getPayCount(), 0);
});

test("getDelivery not-ready state retries during reconciliation", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output), { deliveryFailuresBeforeSuccess: 1 });
  const promise = requestLivePolicyLockCore(demoTender, () => undefined, {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "policy-service",
    timeoutMs: 200,
    reconciliationIntervalMs: 5
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "neg-1", order_id: "order-1", service_id: "policy-service" });
  const result = await promise;
  assert.equal(result.deliveryReference, "delivery-1");
  assert.equal(mock.getDeliveryAttempts(), 2);
});

test("payment success followed by timeout preserves payment metadata in failure update", async () => {
  const stream = new MockStream();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z"));
  const mock = createMockClient(stream, JSON.stringify(output), { orderStatus: "paying" });
  const updates: Array<{ status: string; paymentTxHash?: string; error?: string }> = [];
  const promise = requestLivePolicyLockCore(demoTender, (update) => updates.push(update), {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "policy-service",
    timeoutMs: 25,
    reconciliationIntervalMs: 5
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "neg-1", order_id: "order-1", service_id: "policy-service" });
  await assert.rejects(promise, /payment succeeded/);
  const failed = updates.find((update) => update.status === "failed");
  assert.equal(failed?.paymentTxHash, "0xpay");
  assert.match(failed?.error ?? "", /Last order status: paying/);
});

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
