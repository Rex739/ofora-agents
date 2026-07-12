import assert from "node:assert/strict";
import test from "node:test";
import { payCoordinatorOrder, resetCoordinatorPaymentQueueForTests } from "@/lib/croo/coordinator-payment-queue";

function createPaymentClient({
  initialStatus = "created",
  payError,
  delayMs = 0
}: {
  initialStatus?: string;
  payError?: Error;
  delayMs?: number;
} = {}) {
  let status = initialStatus;
  let payTxHash = initialStatus === "paid" || initialStatus === "paying" || initialStatus === "completed" ? "0xexisting" : "";
  let activePayments = 0;
  let maxActivePayments = 0;
  let payCount = 0;
  let getOrderCount = 0;
  let failedOnce = false;

  return {
    client: {
      getOrder: async () => {
        getOrderCount += 1;
        return { status, payTxHash };
      },
      payOrder: async () => {
        payCount += 1;
        activePayments += 1;
        maxActivePayments = Math.max(maxActivePayments, activePayments);
        if (delayMs > 0) await delay(delayMs);
        activePayments -= 1;
        if (payError && !failedOnce) {
          failedOnce = true;
          throw payError;
        }
        status = "paid";
        payTxHash = `0xpay-${payCount}`;
        return { txHash: payTxHash, order: { status, payTxHash } };
      },
      connectWebSocket: async () => ({ close() {}, on() {} }),
      negotiateOrder: async () => ({ negotiationId: "neg" }),
      getDelivery: async () => ({ deliverableText: "{}" })
    },
    getPayCount: () => payCount,
    getGetOrderCount: () => getOrderCount,
    getMaxActivePayments: () => maxActivePayments,
    setStatus(next: string, nextPayTxHash = payTxHash) {
      status = next;
      payTxHash = nextPayTxHash;
    }
  };
}

test("coordinator payment queue serializes concurrent payOrder calls", async () => {
  resetCoordinatorPaymentQueueForTests();
  const first = createPaymentClient({ delayMs: 25 });
  const second = createPaymentClient({ delayMs: 25 });
  const third = createPaymentClient({ delayMs: 25 });

  const order: string[] = [];
  await Promise.all([
    payCoordinatorOrder({ agentLabel: "PolicyLock", client: wrapClient(first.client, order, "policy"), orderId: "policy-order" }),
    payCoordinatorOrder({ agentLabel: "BidNormalizer", client: wrapClient(second.client, order, "bid"), orderId: "bid-order" }),
    payCoordinatorOrder({ agentLabel: "SupplierRisk", client: wrapClient(third.client, order, "risk"), orderId: "risk-order" })
  ]);

  assert.equal(first.getMaxActivePayments(), 1);
  assert.equal(second.getMaxActivePayments(), 1);
  assert.equal(third.getMaxActivePayments(), 1);
  assert.deepEqual(order, ["start-policy", "end-policy", "start-bid", "end-bid", "start-risk", "end-risk"]);
});

test("already-paying and already-paid orders are not paid again", async () => {
  resetCoordinatorPaymentQueueForTests();
  const paying = createPaymentClient({ initialStatus: "paying" });
  const paid = createPaymentClient({ initialStatus: "paid" });

  const payingResult = await payCoordinatorOrder({ agentLabel: "PolicyLock", client: paying.client as never, orderId: "paying-order" });
  const paidResult = await payCoordinatorOrder({ agentLabel: "BidNormalizer", client: paid.client as never, orderId: "paid-order" });

  assert.equal(paying.getPayCount(), 0);
  assert.equal(paid.getPayCount(), 0);
  assert.equal(payingResult.skippedPayment, true);
  assert.equal(paidResult.receiptReference, "0xexisting");
});

test("transient payment error reconciles before one retry", async () => {
  resetCoordinatorPaymentQueueForTests();
  const transient = createPaymentClient({ payError: new Error("bundler nonce temporarily unavailable") });

  const result = await payCoordinatorOrder({ agentLabel: "SupplierRisk", client: transient.client as never, orderId: "risk-order" });

  assert.equal(transient.getPayCount(), 2);
  assert.ok(transient.getGetOrderCount() >= 3);
  assert.equal(result.paymentTxHash, "0xpay-2");
});

test("no retry occurs when reconciliation finds a payment transaction", async () => {
  resetCoordinatorPaymentQueueForTests();
  const client = createPaymentClient({ payError: new Error("bundler timeout") });
  const original = client.client.payOrder;
  client.client.payOrder = async () => {
    try {
      return await original();
    } catch (error) {
      client.setStatus("paid", "0xsubmitted-despite-error");
      throw error;
    }
  };

  const result = await payCoordinatorOrder({ agentLabel: "PolicyLock", client: client.client as never, orderId: "policy-order" });

  assert.equal(client.getPayCount(), 1);
  assert.equal(result.receiptReference, "0xsubmitted-despite-error");
  assert.equal(result.skippedPayment, true);
});

test("one failed payment does not erase other successful payment metadata", async () => {
  resetCoordinatorPaymentQueueForTests();
  const ok = createPaymentClient();
  const failed = createPaymentClient({ initialStatus: "creating" });
  const anotherOk = createPaymentClient();

  const results = await Promise.allSettled([
    payCoordinatorOrder({ agentLabel: "PolicyLock", client: ok.client as never, orderId: "policy-order" }),
    payCoordinatorOrder({ agentLabel: "BidNormalizer", client: failed.client as never, orderId: "bid-order" }),
    payCoordinatorOrder({ agentLabel: "SupplierRisk", client: anotherOk.client as never, orderId: "risk-order" })
  ]);

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
  assert.equal(results[0].status === "fulfilled" ? results[0].value.paymentTxHash : undefined, "0xpay-1");
  assert.equal(results[2].status === "fulfilled" ? results[2].value.paymentTxHash : undefined, "0xpay-1");
});

test("queue logs redact SDK and websocket keys", async () => {
  resetCoordinatorPaymentQueueForTests();
  const client = createPaymentClient({ initialStatus: "creating" });
  const logs = await captureInfo(async () => {
    await assert.rejects(
      payCoordinatorOrder({ agentLabel: "croo_sk_secret", client: client.client as never, orderId: "order?key=secret" })
    );
  });

  assert.doesNotMatch(logs.join("\n"), /croo_sk_secret|key=secret/);
  assert.match(logs.join("\n"), /\[REDACTED\]/);
});

function wrapClient(client: ReturnType<typeof createPaymentClient>["client"], order: string[], label: string) {
  const original = client.payOrder;
  return {
    ...client,
    payOrder: async () => {
      order.push(`start-${label}`);
      const result = await original();
      order.push(`end-${label}`);
      return result;
    }
  } as never;
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
