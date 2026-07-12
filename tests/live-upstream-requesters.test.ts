import assert from "node:assert/strict";
import test from "node:test";
import type { Event } from "@croo-network/sdk";
import { runBidNormalizer } from "@/lib/agents/bid-normalizer";
import { runPolicyLock } from "@/lib/agents/policy-lock";
import { runSupplierRisk } from "@/lib/agents/supplier-risk";
import { demoTender } from "@/lib/demo/case";
import { requestLiveBidNormalizerCore } from "@/lib/croo/request-bid-normalizer-core";
import { requestLivePolicyLockCore } from "@/lib/croo/request-policy-lock-core";
import { requestLiveSupplierRiskCore } from "@/lib/croo/request-supplier-risk-core";

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

function createMockClient({
  stream,
  negotiationId,
  orderId,
  deliverableText
}: {
  stream: MockStream;
  negotiationId: string;
  orderId: string;
  deliverableText: string;
}) {
  let payCount = 0;
  let negotiateCount = 0;
  let listenerCountAtNegotiate = 0;
  return {
    client: {
      connectWebSocket: async () => stream,
      negotiateOrder: async () => {
        negotiateCount += 1;
        listenerCountAtNegotiate = [...stream.handlers.values()].reduce((total, handlers) => total + handlers.length, 0);
        return { negotiationId };
      },
      getOrder: async () => ({
        orderId,
        negotiationId,
        status: "completed",
        payTxHash: `0xpay-${orderId}`,
        deliverTxHash: `0xdeliver-${orderId}`
      }),
      payOrder: async () => {
        payCount += 1;
        return { txHash: `0xpay-${orderId}`, order: { payTxHash: `0xpay-${orderId}` } };
      },
      getDelivery: async () => ({
        deliveryId: `delivery-${orderId}`,
        orderId,
        providerAgentId: `provider-${orderId}`,
        deliverableType: "text",
        deliverableSchema: "",
        deliverableText,
        contentHash: `content-${orderId}`,
        status: "accepted",
        submittedAt: "",
        verifiedAt: "",
        createdTime: "",
        updatedTime: "",
        txHash: `0xprovider-${orderId}`
      })
    },
    getPayCount: () => payCount,
    getNegotiateCount: () => negotiateCount,
    getListenerCountAtNegotiate: () => listenerCountAtNegotiate
  };
}

test("BidNormalizer live success validates output and pays at most once", async () => {
  const stream = new MockStream();
  const output = await runBidNormalizer(demoTender);
  const mock = createMockClient({ stream, negotiationId: "bid-neg-1", orderId: "bid-order-1", deliverableText: JSON.stringify(output) });
  const promise = requestLiveBidNormalizerCore(demoTender, () => undefined, {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "bid-service",
    timeoutMs: 200,
    reconciliationIntervalMs: 5
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "bid-neg-1", order_id: "bid-order-1", service_id: "bid-service" });
  stream.emit(EventType.OrderCreated, { negotiation_id: "bid-neg-1", order_id: "bid-order-1", service_id: "bid-service" });
  await tick();
  stream.emit(EventType.OrderCompleted, { order_id: "bid-order-1" });
  const result = await promise;

  assert.equal(result.output.agent, "BidNormalizer");
  assert.equal(result.output.normalizedSuppliers.length, demoTender.suppliers.length);
  assert.equal(result.orderId, "bid-order-1");
  assert.equal(result.rawDeliveryMetadata?.providerDeliveryTxHash, "0xdeliver-bid-order-1");
  assert.equal(mock.getPayCount(), 1);
  assert.ok(mock.getListenerCountAtNegotiate() >= 6);
});

test("SupplierRisk live success validates output and pays at most once", async () => {
  const stream = new MockStream();
  const output = await runSupplierRisk(demoTender);
  const mock = createMockClient({ stream, negotiationId: "risk-neg-1", orderId: "risk-order-1", deliverableText: JSON.stringify(output) });
  const promise = requestLiveSupplierRiskCore(demoTender, () => undefined, {
    createClient: async () => mock.client as never,
    constants: { EventType },
    serviceId: "risk-service",
    timeoutMs: 200,
    reconciliationIntervalMs: 5
  });

  await tick();
  stream.emit(EventType.OrderCreated, { negotiation_id: "risk-neg-1", order_id: "risk-order-1", service_id: "risk-service" });
  stream.emit(EventType.OrderCreated, { negotiation_id: "risk-neg-1", order_id: "risk-order-1", service_id: "risk-service" });
  await tick();
  stream.emit(EventType.OrderCompleted, { order_id: "risk-order-1" });
  const result = await promise;

  assert.equal(result.output.agent, "SupplierRisk");
  assert.ok(result.output.riskFlags.length > 0);
  assert.equal(result.orderId, "risk-order-1");
  assert.equal(result.rawDeliveryMetadata?.providerDeliveryTxHash, "0xdeliver-risk-order-1");
  assert.equal(mock.getPayCount(), 1);
  assert.ok(mock.getListenerCountAtNegotiate() >= 6);
});

test("three upstream live requesters can negotiate in parallel", async () => {
  const policyStream = new MockStream();
  const bidStream = new MockStream();
  const riskStream = new MockStream();
  const policy = createMockClient({ stream: policyStream, negotiationId: "policy-neg-1", orderId: "policy-order-1", deliverableText: JSON.stringify(runPolicyLock(demoTender)) });
  const bid = createMockClient({ stream: bidStream, negotiationId: "bid-neg-1", orderId: "bid-order-1", deliverableText: JSON.stringify(await runBidNormalizer(demoTender)) });
  const risk = createMockClient({ stream: riskStream, negotiationId: "risk-neg-1", orderId: "risk-order-1", deliverableText: JSON.stringify(await runSupplierRisk(demoTender)) });

  const policyPromise = requestLivePolicyLockCore(demoTender, () => undefined, {
    createClient: async () => policy.client as never,
    constants: { EventType },
    serviceId: "policy-service",
    timeoutMs: 300,
    reconciliationIntervalMs: 5
  });
  const bidPromise = requestLiveBidNormalizerCore(demoTender, () => undefined, {
    createClient: async () => bid.client as never,
    constants: { EventType },
    serviceId: "bid-service",
    timeoutMs: 300,
    reconciliationIntervalMs: 5
  });
  const riskPromise = requestLiveSupplierRiskCore(demoTender, () => undefined, {
    createClient: async () => risk.client as never,
    constants: { EventType },
    serviceId: "risk-service",
    timeoutMs: 300,
    reconciliationIntervalMs: 5
  });

  await tick();
  assert.equal(policy.getNegotiateCount(), 1);
  assert.equal(bid.getNegotiateCount(), 1);
  assert.equal(risk.getNegotiateCount(), 1);

  policyStream.emit(EventType.OrderCreated, { negotiation_id: "policy-neg-1", order_id: "policy-order-1", service_id: "policy-service" });
  bidStream.emit(EventType.OrderCreated, { negotiation_id: "bid-neg-1", order_id: "bid-order-1", service_id: "bid-service" });
  riskStream.emit(EventType.OrderCreated, { negotiation_id: "risk-neg-1", order_id: "risk-order-1", service_id: "risk-service" });
  await tick();
  policyStream.emit(EventType.OrderCompleted, { order_id: "policy-order-1" });
  bidStream.emit(EventType.OrderCompleted, { order_id: "bid-order-1" });
  riskStream.emit(EventType.OrderCompleted, { order_id: "risk-order-1" });

  const [policyResult, bidResult, riskResult] = await Promise.all([policyPromise, bidPromise, riskPromise]);
  assert.equal(policyResult.output.agent, "PolicyLock");
  assert.equal(bidResult.output.agent, "BidNormalizer");
  assert.equal(riskResult.output.agent, "SupplierRisk");
  assert.equal(policy.getPayCount() + bid.getPayCount() + risk.getPayCount(), 3);
});

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
