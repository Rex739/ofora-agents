import { setTimeout as delay } from "node:timers/promises";
import { redactValue } from "@/lib/croo/redacted-logger";
import type { CrooAgentClient } from "@/lib/croo/types";

type PaymentResult = {
  orderStatus?: string;
  paymentTxHash?: string;
  receiptReference?: string;
  skippedPayment: boolean;
};

type QueueTask<T> = () => Promise<T>;

let tail: Promise<unknown> = Promise.resolve();

export function resetCoordinatorPaymentQueueForTests() {
  tail = Promise.resolve();
}

export async function payCoordinatorOrder({
  agentLabel,
  client,
  orderId
}: {
  agentLabel: string;
  client: CrooAgentClient;
  orderId: string;
}): Promise<PaymentResult> {
  return enqueue(async () => {
    log("paying", agentLabel, orderId);
    try {
      const result = await payCoordinatorOrderInsideLock({ agentLabel, client, orderId });
      log("submitted", agentLabel, orderId);
      return result;
    } finally {
      log("released", agentLabel, orderId);
    }
  }, agentLabel, orderId);
}

async function enqueue<T>(task: QueueTask<T>, agentLabel: string, orderId: string) {
  log("waiting", agentLabel, orderId);
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

async function payCoordinatorOrderInsideLock({
  agentLabel,
  client,
  orderId
}: {
  agentLabel: string;
  client: CrooAgentClient;
  orderId: string;
}): Promise<PaymentResult> {
  const before = await client.getOrder(orderId);
  if (isAlreadySubmittedStatus(before.status)) return resultFromOrder(before, true);
  if (!isPayableStatus(before.status)) {
    throw new Error(`${agentLabel} order is not safely payable. Current status: ${before.status || "unknown"}.`);
  }
  if (before.payTxHash) return resultFromOrder(before, true);

  try {
    const payment = await client.payOrder(orderId);
    return {
      orderStatus: payment.order?.status,
      paymentTxHash: payment.txHash || undefined,
      receiptReference: payment.order?.payTxHash || payment.txHash || undefined,
      skippedPayment: false
    };
  } catch (error) {
    const reconciled = await client.getOrder(orderId);
    if (isAlreadySubmittedStatus(reconciled.status) || reconciled.payTxHash) return resultFromOrder(reconciled, true);
    if (!isPayableStatus(reconciled.status) || !isTransientPaymentError(error)) throw error;

    await delay(1500);
    const afterDelay = await client.getOrder(orderId);
    if (isAlreadySubmittedStatus(afterDelay.status) || afterDelay.payTxHash) return resultFromOrder(afterDelay, true);
    if (!isPayableStatus(afterDelay.status)) {
      throw new Error(`${agentLabel} payment retry stopped because order status advanced to ${afterDelay.status || "unknown"}.`);
    }

    const retry = await client.payOrder(orderId);
    return {
      orderStatus: retry.order?.status,
      paymentTxHash: retry.txHash || undefined,
      receiptReference: retry.order?.payTxHash || retry.txHash || undefined,
      skippedPayment: false
    };
  }
}

function resultFromOrder(order: { status?: string; payTxHash?: string }, skippedPayment: boolean): PaymentResult {
  return {
    orderStatus: order.status,
    paymentTxHash: order.payTxHash || undefined,
    receiptReference: order.payTxHash || undefined,
    skippedPayment
  };
}

function isPayableStatus(status: string) {
  return status === "created";
}

function isAlreadySubmittedStatus(status: string) {
  return status === "paying" || status === "paid" || status === "delivering" || status === "completed";
}

function isTransientPaymentError(error: unknown) {
  const message = String(redactValue(error instanceof Error ? error.message : String(error))).toLowerCase();
  return ["nonce", "bundler", "paymaster", "timeout", "temporar", "network", "rate", "429", "503"].some((token) => message.includes(token));
}

function log(stage: "waiting" | "paying" | "submitted" | "released", agentLabel: string, orderId: string) {
  console.info(`[CoordinatorPaymentQueue] ${stage} agent=${String(redactValue(agentLabel))} orderId=${String(redactValue(orderId))}`);
}
