import type { Event, EventStream } from "@croo-network/sdk";
import { createPolicyLockRequirements } from "@/lib/agents/policy-lock-requirements";
import { payCoordinatorOrder } from "@/lib/croo/coordinator-payment-queue";
import { CrooDeliveryError, CrooTimeoutError, normalizeCrooError } from "@/lib/croo/errors";
import { PolicyLockOutputSchema, type AgentRun, type PolicyLockOutput, type TenderPacketInput } from "@/lib/schemas/ofora";
import type { CrooAgentClient, PolicyLockLifecycleStatus } from "@/lib/croo/types";

export type PolicyLockLifecycleUpdate = {
  status: PolicyLockLifecycleStatus;
  orderId?: string;
  paymentTxHash?: string;
  receiptReference?: string;
  deliveryReference?: string;
  providerDeliveryTxHash?: string;
  elapsedMs?: number;
  error?: string;
};

export type LivePolicyLockResult = {
  mode: "live";
  output: PolicyLockOutput;
  negotiationId?: string;
  orderId: string;
  paymentTxHash?: string;
  receiptReference?: string;
  deliveryReference?: string;
  elapsedMs: number;
  rawDeliveryMetadata?: {
    deliveryId?: string;
    contentHash?: string;
    status?: string;
    providerDeliveryTxHash?: string;
  };
};

export type RequestPolicyLockDeps = {
  createClient: () => Promise<CrooAgentClient>;
  constants: {
    EventType: {
      OrderCreated: string;
      NegotiationRejected: string;
      NegotiationExpired: string;
      OrderRejected: string;
      OrderExpired: string;
      OrderCompleted: string;
    };
  };
  serviceId: string;
  timeoutMs: number;
  reconciliationIntervalMs?: number;
};

export async function requestLivePolicyLockCore(
  tender: TenderPacketInput,
  onStatus: (update: PolicyLockLifecycleUpdate) => void,
  deps: RequestPolicyLockDeps
): Promise<LivePolicyLockResult> {
  const started = Date.now();
  const emit = (update: Omit<PolicyLockLifecycleUpdate, "elapsedMs">) => onStatus({ ...update, elapsedMs: Date.now() - started });
  let stream: EventStream | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let reconcileInterval: NodeJS.Timeout | undefined;
  let settled = false;
  let paid = false;
  let completing = false;
  let paymentSucceeded = false;
  let negotiationId: string | undefined;
  let orderId: string | undefined;
  let paymentTxHash: string | undefined;
  let receiptReference: string | undefined;
  let providerDeliveryTxHash: string | undefined;
  let lastOrderStatus: string | undefined;

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    if (reconcileInterval) clearInterval(reconcileInterval);
    stream?.close();
  };

  const fail = (reject: (reason?: unknown) => void, error: unknown) => {
    if (settled) return;
    settled = true;
    const safeMessage = normalizeCrooError(error);
    emit({ status: "failed", orderId, paymentTxHash, receiptReference, providerDeliveryTxHash, error: safeMessage });
    cleanup();
    reject(error);
  };

  try {
    emit({ status: "connecting" });
    const client = await deps.createClient();
    const requirements = createPolicyLockRequirements(tender);
    stream = await client.connectWebSocket();

    return await new Promise<LivePolicyLockResult>((resolve, reject) => {
      const armTimeout = (message: () => string) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => fail(reject, new CrooTimeoutError(message())), deps.timeoutMs);
      };

      armTimeout(() => {
        const message = paymentSucceeded
          ? `PolicyLock payment succeeded, but delivery confirmation was not received before timeout. Last order status: ${lastOrderStatus ?? "unknown"}.`
          : `PolicyLock did not accept the CAP negotiation before timeout. Last order status: ${lastOrderStatus ?? "unknown"}.`;
        return message;
      });

      stream?.on(deps.constants.EventType.OrderCreated, (event) => {
        if (!matchesNegotiation(event, negotiationId, deps.serviceId) || !event.order_id || paid) return;
        paid = true;
        orderId = event.order_id;
        emit({ status: "order_created", orderId });
        emit({ status: "payment_pending", orderId });
        if (timeout) clearTimeout(timeout);
        void payCoordinatorOrder({ agentLabel: "PolicyLock", client, orderId })
          .then((payment) => {
            paymentSucceeded = true;
            paymentTxHash = payment.paymentTxHash || undefined;
            lastOrderStatus = payment.orderStatus || lastOrderStatus;
            receiptReference = payment.receiptReference || paymentTxHash;
            emit({ status: "paid", orderId, paymentTxHash, receiptReference });
            emit({ status: "awaiting_delivery", orderId, paymentTxHash, receiptReference });
            armTimeout(() => `PolicyLock payment succeeded, but delivery confirmation was not received before timeout. Last order status: ${lastOrderStatus ?? "unknown"}.`);
            startReconciliation(client, resolve, reject, emit);
          })
          .catch((error: unknown) => fail(reject, error));
      });

      stream?.on(deps.constants.EventType.NegotiationRejected, (event) => {
        if (matchesNegotiation(event, negotiationId, deps.serviceId)) fail(reject, new Error(event.reason || "PolicyLock rejected the CAP negotiation."));
      });

      stream?.on(deps.constants.EventType.NegotiationExpired, (event) => {
        if (matchesNegotiation(event, negotiationId, deps.serviceId)) fail(reject, new CrooTimeoutError("PolicyLock negotiation expired before an order was created."));
      });

      stream?.on(deps.constants.EventType.OrderRejected, (event) => {
        if (matchesOrder(event, orderId)) fail(reject, new Error(event.reason || "PolicyLock order was rejected."));
      });

      stream?.on(deps.constants.EventType.OrderExpired, (event) => {
        if (matchesOrder(event, orderId)) fail(reject, new CrooTimeoutError("PolicyLock order expired before delivery."));
      });

      stream?.on(deps.constants.EventType.OrderCompleted, (event) => {
        if (!matchesOrder(event, orderId)) return;
        void completeFromDelivery(client, resolve, reject, emit);
      });

      emit({ status: "negotiating" });
      void client.negotiateOrder({
        serviceId: deps.serviceId,
        requirements: JSON.stringify(requirements)
      })
        .then((negotiation) => {
          negotiationId = negotiation.negotiationId;
        })
        .catch((error: unknown) => fail(reject, error));
    });
  } catch (error) {
    cleanup();
    emit({ status: "failed", orderId, paymentTxHash, receiptReference, providerDeliveryTxHash, error: normalizeCrooError(error) });
    throw error;
  }

  function startReconciliation(
    client: CrooAgentClient,
    resolve: (value: LivePolicyLockResult) => void,
    reject: (reason?: unknown) => void,
    emit: (update: Omit<PolicyLockLifecycleUpdate, "elapsedMs">) => void
  ) {
    if (reconcileInterval || !orderId) return;
    emit({ status: "confirming_delivery", orderId, paymentTxHash, receiptReference });
    const reconcile = () => {
      if (settled || !orderId) return;
      void client.getOrder(orderId)
        .then((order) => {
          if (settled) return;
          lastOrderStatus = order.status || lastOrderStatus;
          paymentTxHash = paymentTxHash ?? (order.payTxHash || undefined);
          receiptReference = receiptReference ?? (order.payTxHash || undefined);
          providerDeliveryTxHash = providerDeliveryTxHash ?? (order.deliverTxHash || undefined);
          if (isTerminalFailureStatus(order.status)) {
            fail(reject, new Error(`PolicyLock order did not complete. Last order status: ${order.status}.`));
            return;
          }
          if (deliveryMayExist(order.status)) {
            void completeFromDelivery(client, resolve, reject, emit, true);
          }
        })
        .catch(() => {
          // Transient reconciliation failures are bounded by the overall CAP timeout.
        });
    };
    reconcile();
    reconcileInterval = setInterval(reconcile, deps.reconciliationIntervalMs ?? 2500);
  }

  function completeFromDelivery(
    client: CrooAgentClient,
    resolve: (value: LivePolicyLockResult) => void,
    reject: (reason?: unknown) => void,
    emit: (update: Omit<PolicyLockLifecycleUpdate, "elapsedMs">) => void,
    tolerateNotReady = false
  ) {
    if (settled || completing || !orderId) return;
    completing = true;
    const activeOrderId = orderId;
    void client.getDelivery(activeOrderId)
      .then((delivery) => {
        const output = parsePolicyLockDelivery(delivery.deliverableText);
        if (settled) return;
        settled = true;
        const deliveryReference = delivery.deliveryId || delivery.contentHash || undefined;
        const deliveryTxHash = providerDeliveryTxHash ?? ("txHash" in delivery && typeof delivery.txHash === "string" ? delivery.txHash : undefined);
        emit({ status: "completed", orderId: activeOrderId, paymentTxHash, receiptReference, deliveryReference, providerDeliveryTxHash: deliveryTxHash });
        cleanup();
        resolve({
          mode: "live",
          output,
          negotiationId,
          orderId: activeOrderId,
          paymentTxHash,
          receiptReference,
          deliveryReference,
          elapsedMs: Date.now() - started,
          rawDeliveryMetadata: {
            deliveryId: delivery.deliveryId || undefined,
            contentHash: delivery.contentHash || undefined,
            status: delivery.status || undefined,
            providerDeliveryTxHash: deliveryTxHash
          }
        });
      })
      .catch((error: unknown) => {
        completing = false;
        if (tolerateNotReady && isDeliveryNotReady(error)) return;
        fail(reject, error);
      });
  }
}

export async function recoverLivePolicyLockOrder(
  orderId: string,
  deps: Pick<RequestPolicyLockDeps, "createClient">
): Promise<LivePolicyLockResult & { orderStatus?: string; providerDeliveryTxHash?: string }> {
  const started = Date.now();
  const client = await deps.createClient();
  const order = await client.getOrder(orderId);
  const delivery = await client.getDelivery(orderId);
  const output = parsePolicyLockDelivery(delivery.deliverableText);
  const deliveryReference = delivery.deliveryId || delivery.contentHash || undefined;
  const providerDeliveryTxHash = order.deliverTxHash || ("txHash" in delivery && typeof delivery.txHash === "string" ? delivery.txHash : undefined);
  return {
    mode: "live",
    output,
    negotiationId: order.negotiationId,
    orderId,
    paymentTxHash: order.payTxHash || undefined,
    receiptReference: order.payTxHash || undefined,
    deliveryReference,
    elapsedMs: Date.now() - started,
    orderStatus: order.status,
    providerDeliveryTxHash,
    rawDeliveryMetadata: {
      deliveryId: delivery.deliveryId || undefined,
      contentHash: delivery.contentHash || undefined,
      status: delivery.status || undefined,
      providerDeliveryTxHash
    }
  };
}

export function mapPolicyLockUpdateToAgentRun(update: PolicyLockLifecycleUpdate): Partial<AgentRun> {
  return {
    status: update.status === "completed" ? "delivered" : update.status,
    orderId: update.orderId,
    txHash: update.receiptReference ?? update.paymentTxHash,
    resultHash: update.deliveryReference,
    providerDeliveryTxHash: update.providerDeliveryTxHash,
    elapsedMs: update.elapsedMs,
    error: update.error
  };
}

export function parsePolicyLockDelivery(deliverableText: string): PolicyLockOutput {
  try {
    return PolicyLockOutputSchema.parse(JSON.parse(deliverableText) as unknown);
  } catch {
    throw new CrooDeliveryError("PolicyLock returned a delivery that did not match the required output schema.");
  }
}

function matchesNegotiation(event: Event, negotiationId: string | undefined, serviceId: string) {
  if (event.service_id && event.service_id !== serviceId) return false;
  if (!negotiationId) return false;
  return event.negotiation_id === negotiationId;
}

function matchesOrder(event: Event, orderId: string | undefined) {
  return Boolean(orderId && event.order_id === orderId);
}

function deliveryMayExist(status: string) {
  return ["paid", "delivering", "completed"].includes(status);
}

function isTerminalFailureStatus(status: string) {
  return ["rejected", "expired", "create_failed", "pay_failed", "deliver_failed"].includes(status);
}

function isDeliveryNotReady(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("not ready") || message.includes("404") || message.includes("delivery");
}
