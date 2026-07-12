import type { Event, EventStream } from "@croo-network/sdk";
import { CrooDeliveryError, CrooTimeoutError, normalizeCrooError } from "@/lib/croo/errors";
import type { AgentRun } from "@/lib/schemas/ofora";
import type { CrooAgentClient, PolicyLockLifecycleStatus } from "@/lib/croo/types";

export type LiveAgentLifecycleUpdate = {
  status: PolicyLockLifecycleStatus;
  orderId?: string;
  paymentTxHash?: string;
  receiptReference?: string;
  deliveryReference?: string;
  providerDeliveryTxHash?: string;
  elapsedMs?: number;
  error?: string;
};

export type LiveAgentResult<TOutput> = {
  mode: "live";
  output: TOutput;
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

export type RequestLiveAgentDeps = {
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

export async function requestLiveAgentCore<TOutput>({
  agentLabel,
  requirements,
  parseDelivery,
  onStatus,
  deps
}: {
  agentLabel: string;
  requirements: Record<string, unknown>;
  parseDelivery: (deliverableText: string) => TOutput;
  onStatus: (update: LiveAgentLifecycleUpdate) => void;
  deps: RequestLiveAgentDeps;
}): Promise<LiveAgentResult<TOutput>> {
  const started = Date.now();
  const emit = (update: Omit<LiveAgentLifecycleUpdate, "elapsedMs">) => onStatus({ ...update, elapsedMs: Date.now() - started });
  const logStage = (stage: string, status: string) => console.info(`[${agentLabel}] stage=${stage} status=${status}`);
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
    console.info(`[${agentLabel}] stage=failure status=failed hasOrderId=${Boolean(orderId)} paymentSubmitted=${Boolean(paymentTxHash)} lastOrderStatus=${lastOrderStatus ?? "unknown"}`);
    emit({ status: "failed", orderId, paymentTxHash, receiptReference, providerDeliveryTxHash, error: safeMessage });
    cleanup();
    reject(error);
  };

  try {
    emit({ status: "connecting" });
    const client = await deps.createClient();
    stream = await client.connectWebSocket();
    logStage("connection", "ready");

    return await new Promise<LiveAgentResult<TOutput>>((resolve, reject) => {
      timeout = setTimeout(() => {
        const message = paymentSucceeded
          ? `${agentLabel} payment succeeded, but delivery confirmation was not received before timeout. Last order status: ${lastOrderStatus ?? "unknown"}.`
          : `${agentLabel} did not accept the CAP negotiation before timeout. Last order status: ${lastOrderStatus ?? "unknown"}.`;
        fail(reject, new CrooTimeoutError(message));
      }, deps.timeoutMs);

      stream?.on(deps.constants.EventType.OrderCreated, (event) => {
        if (!matchesNegotiation(event, negotiationId, deps.serviceId) || !event.order_id || paid) return;
        paid = true;
        orderId = event.order_id;
        logStage("order", "created");
        emit({ status: "order_created", orderId });
        emit({ status: "payment_pending", orderId });
        void client.payOrder(orderId)
          .then((payment) => {
            paymentSucceeded = true;
            paymentTxHash = payment.txHash || undefined;
            lastOrderStatus = payment.order?.status || lastOrderStatus;
            receiptReference = payment.order?.payTxHash || paymentTxHash;
            logStage("payment", "submitted");
            emit({ status: "paid", orderId, paymentTxHash, receiptReference });
            emit({ status: "awaiting_delivery", orderId, paymentTxHash, receiptReference });
            startReconciliation(client, resolve, reject, emit);
          })
          .catch((error: unknown) => fail(reject, error));
      });

      stream?.on(deps.constants.EventType.NegotiationRejected, (event) => {
        if (matchesNegotiation(event, negotiationId, deps.serviceId)) fail(reject, new Error(event.reason || `${agentLabel} rejected the CAP negotiation.`));
      });

      stream?.on(deps.constants.EventType.NegotiationExpired, (event) => {
        if (matchesNegotiation(event, negotiationId, deps.serviceId)) fail(reject, new CrooTimeoutError(`${agentLabel} negotiation expired before an order was created.`));
      });

      stream?.on(deps.constants.EventType.OrderRejected, (event) => {
        if (matchesOrder(event, orderId)) fail(reject, new Error(event.reason || `${agentLabel} order was rejected.`));
      });

      stream?.on(deps.constants.EventType.OrderExpired, (event) => {
        if (matchesOrder(event, orderId)) fail(reject, new CrooTimeoutError(`${agentLabel} order expired before delivery.`));
      });

      stream?.on(deps.constants.EventType.OrderCompleted, (event) => {
        if (!matchesOrder(event, orderId)) return;
        void completeFromDelivery(client, resolve, reject, emit);
      });

      emit({ status: "negotiating" });
      logStage("negotiation", "started");
      void client.negotiateOrder({
        serviceId: deps.serviceId,
        requirements: JSON.stringify(requirements)
      })
        .then((negotiation) => {
          negotiationId = negotiation.negotiationId;
          logStage("negotiation", "created");
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
    resolve: (value: LiveAgentResult<TOutput>) => void,
    reject: (reason?: unknown) => void,
    activeEmit: (update: Omit<LiveAgentLifecycleUpdate, "elapsedMs">) => void
  ) {
    if (reconcileInterval || !orderId) return;
    activeEmit({ status: "confirming_delivery", orderId, paymentTxHash, receiptReference });
    logStage("delivery", "confirming");
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
            fail(reject, new Error(`${agentLabel} order did not complete. Last order status: ${order.status}.`));
            return;
          }
          if (deliveryMayExist(order.status)) {
            void completeFromDelivery(client, resolve, reject, activeEmit, true);
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
    resolve: (value: LiveAgentResult<TOutput>) => void,
    reject: (reason?: unknown) => void,
    activeEmit: (update: Omit<LiveAgentLifecycleUpdate, "elapsedMs">) => void,
    tolerateNotReady = false
  ) {
    if (settled || completing || !orderId) return;
    completing = true;
    const activeOrderId = orderId;
    void client.getDelivery(activeOrderId)
      .then((delivery) => {
        const output = parseDelivery(delivery.deliverableText);
        if (settled) return;
        settled = true;
        const deliveryReference = delivery.deliveryId || delivery.contentHash || undefined;
        const deliveryTxHash = providerDeliveryTxHash ?? ("txHash" in delivery && typeof delivery.txHash === "string" ? delivery.txHash : undefined);
        logStage("delivery", "completed");
        activeEmit({ status: "completed", orderId: activeOrderId, paymentTxHash, receiptReference, deliveryReference, providerDeliveryTxHash: deliveryTxHash });
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

export function mapLiveAgentUpdateToAgentRun(update: LiveAgentLifecycleUpdate): Partial<AgentRun> {
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

export function parseLiveAgentDelivery<TOutput>(deliverableText: string, parse: (value: unknown) => TOutput, agentLabel: string): TOutput {
  try {
    return parse(JSON.parse(deliverableText) as unknown);
  } catch {
    throw new CrooDeliveryError(`${agentLabel} returned a delivery that did not match the required output schema.`);
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
