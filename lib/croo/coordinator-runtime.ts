import type { Event, EventStream } from "@croo-network/sdk";
import { payCoordinatorOrder } from "@/lib/croo/coordinator-payment-queue";
import { CrooDeliveryError, CrooTimeoutError, normalizeCrooError } from "@/lib/croo/errors";
import { redactValue } from "@/lib/croo/redacted-logger";
import type { CrooAgentClient, PolicyLockLifecycleStatus } from "@/lib/croo/types";

type CoordinatorRuntimeConstants = {
  EventType: {
    OrderCreated: string;
    NegotiationRejected: string;
    NegotiationExpired: string;
    OrderRejected: string;
    OrderExpired: string;
    OrderCompleted: string;
  };
};

export type CoordinatorLifecycleUpdate = {
  status: PolicyLockLifecycleStatus;
  orderId?: string;
  paymentTxHash?: string;
  receiptReference?: string;
  deliveryReference?: string;
  providerDeliveryTxHash?: string;
  elapsedMs?: number;
  error?: string;
};

export type CoordinatorAgentResult<TOutput> = {
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

type CoordinatorRuntimeOptions = {
  createClient: () => Promise<CrooAgentClient>;
  constants: CoordinatorRuntimeConstants;
};

type CoordinatorRequest<TOutput> = {
  agentLabel: string;
  serviceId: string;
  requirements: Record<string, unknown>;
  parseDelivery: (deliverableText: string) => TOutput;
  onStatus: (update: CoordinatorLifecycleUpdate) => void;
  timeoutMs: number;
  reconciliationIntervalMs?: number;
};

type ActiveRequest = Omit<CoordinatorRequest<unknown>, "parseDelivery"> & {
  id: number;
  started: number;
  timeout?: NodeJS.Timeout;
  reconcileInterval?: NodeJS.Timeout;
  settled: boolean;
  paymentStarted: boolean;
  completing: boolean;
  paymentSucceeded: boolean;
  negotiationId?: string;
  orderId?: string;
  paymentTxHash?: string;
  receiptReference?: string;
  providerDeliveryTxHash?: string;
  lastOrderStatus?: string;
  parseDelivery: (deliverableText: string) => unknown;
  resolve: (value: CoordinatorAgentResult<unknown>) => void;
  reject: (reason?: unknown) => void;
};

let sharedRuntime: CoordinatorRuntime | undefined;

export function getSharedCoordinatorRuntime(options: CoordinatorRuntimeOptions) {
  if (!sharedRuntime) sharedRuntime = new CoordinatorRuntime(options);
  return sharedRuntime;
}

export function resetSharedCoordinatorRuntimeForTests() {
  sharedRuntime = undefined;
}

export class CoordinatorRuntime {
  private client?: CrooAgentClient;
  private stream?: EventStream;
  private connectionPromise?: Promise<CrooAgentClient>;
  private nextRequestId = 1;
  private readonly byNegotiationId = new Map<string, ActiveRequest>();
  private readonly byOrderId = new Map<string, ActiveRequest>();
  private readonly activeRequests = new Set<ActiveRequest>();

  constructor(private readonly options: CoordinatorRuntimeOptions) {}

  async request<TOutput>(request: CoordinatorRequest<TOutput>): Promise<CoordinatorAgentResult<TOutput>> {
    const started = Date.now();
    const state: ActiveRequest = {
      ...request,
      id: this.nextRequestId++,
      started,
      settled: false,
      paymentStarted: false,
      completing: false,
      paymentSucceeded: false,
      resolve: () => undefined,
      reject: () => undefined
    };

    this.activeRequests.add(state);
    this.emit(state, { status: "connecting" });

    try {
      const client = await this.ensureConnected();
      return await new Promise<CoordinatorAgentResult<unknown>>((resolve, reject) => {
        state.resolve = resolve;
        state.reject = reject;
        this.armTimeout(state, () => {
          if (state.paymentSucceeded) {
            return `${state.agentLabel} payment succeeded, but delivery confirmation was not received before timeout. Last order status: ${state.lastOrderStatus ?? "unknown"}.`;
          }
          return `${state.agentLabel} did not accept the CAP negotiation before timeout. Last order status: ${state.lastOrderStatus ?? "unknown"}.`;
        });

        this.emit(state, { status: "negotiating" });
        console.info(`[${state.agentLabel}] stage=negotiation status=started`);
        void client.negotiateOrder({
          serviceId: state.serviceId,
          requirements: JSON.stringify(state.requirements)
        })
          .then((negotiation) => {
            if (state.settled) return;
            state.negotiationId = negotiation.negotiationId;
            this.byNegotiationId.set(negotiation.negotiationId, state);
            console.info(`[${state.agentLabel}] stage=negotiation status=created`);
          })
          .catch((error: unknown) => this.fail(state, error));
      }) as CoordinatorAgentResult<TOutput>;
    } catch (error) {
      this.fail(state, error);
      throw error;
    }
  }

  closeForTests() {
    this.stream?.close();
    this.stream = undefined;
    this.client = undefined;
    this.connectionPromise = undefined;
    for (const request of this.activeRequests) this.cleanupRequest(request);
    this.activeRequests.clear();
    this.byNegotiationId.clear();
    this.byOrderId.clear();
  }

  private async ensureConnected() {
    if (this.client) return this.client;
    if (!this.connectionPromise) {
      this.connectionPromise = this.options.createClient().then(async (client) => {
        this.stream = await client.connectWebSocket();
        this.client = client;
        this.attachListeners(this.stream);
        console.info("[CoordinatorRuntime] shared websocket ready");
        return client;
      });
    }
    return this.connectionPromise;
  }

  private attachListeners(stream: EventStream) {
    const { EventType } = this.options.constants;
    stream.on(EventType.OrderCreated, (event) => this.handleOrderCreated(event));
    stream.on(EventType.NegotiationRejected, (event) => this.handleNegotiationFailure(event, "rejected"));
    stream.on(EventType.NegotiationExpired, (event) => this.handleNegotiationFailure(event, "expired"));
    stream.on(EventType.OrderRejected, (event) => this.handleOrderFailure(event, "rejected"));
    stream.on(EventType.OrderExpired, (event) => this.handleOrderFailure(event, "expired"));
    stream.on(EventType.OrderCompleted, (event) => this.handleOrderCompleted(event));
  }

  private handleOrderCreated(event: Event) {
    const request = this.findByNegotiation(event);
    if (!request || !event.order_id) {
      this.logIgnored("order_created", event);
      return;
    }
    if (request.paymentStarted) return;
    request.paymentStarted = true;
    request.orderId = event.order_id;
    this.byOrderId.set(event.order_id, request);
    console.info(`[${request.agentLabel}] stage=order status=created`);
    this.emit(request, { status: "order_created", orderId: request.orderId });
    this.emit(request, { status: "payment_pending", orderId: request.orderId });
    if (request.timeout) clearTimeout(request.timeout);

    void payCoordinatorOrder({ agentLabel: request.agentLabel, client: this.requireClient(), orderId: request.orderId })
      .then((payment) => {
        if (request.settled) return;
        request.paymentSucceeded = true;
        request.paymentTxHash = payment.paymentTxHash || undefined;
        request.lastOrderStatus = payment.orderStatus || request.lastOrderStatus;
        request.receiptReference = payment.receiptReference || request.paymentTxHash;
        console.info(`[${request.agentLabel}] stage=payment status=submitted`);
        this.emit(request, {
          status: "paid",
          orderId: request.orderId,
          paymentTxHash: request.paymentTxHash,
          receiptReference: request.receiptReference
        });
        this.emit(request, {
          status: "awaiting_delivery",
          orderId: request.orderId,
          paymentTxHash: request.paymentTxHash,
          receiptReference: request.receiptReference
        });
        this.armTimeout(request, () => `${request.agentLabel} payment succeeded, but delivery confirmation was not received before timeout. Last order status: ${request.lastOrderStatus ?? "unknown"}.`);
        this.startReconciliation(request);
      })
      .catch((error: unknown) => this.fail(request, error));
  }

  private handleNegotiationFailure(event: Event, failure: "rejected" | "expired") {
    const request = this.findByNegotiation(event);
    if (!request) {
      this.logIgnored(`negotiation_${failure}`, event);
      return;
    }
    if (failure === "expired") {
      this.fail(request, new CrooTimeoutError(`${request.agentLabel} negotiation expired before an order was created.`));
      return;
    }
    this.fail(request, new Error(event.reason || `${request.agentLabel} rejected the CAP negotiation.`));
  }

  private handleOrderFailure(event: Event, failure: "rejected" | "expired") {
    const request = this.findByOrder(event);
    if (!request) {
      this.logIgnored(`order_${failure}`, event);
      return;
    }
    if (failure === "expired") {
      this.fail(request, new CrooTimeoutError(`${request.agentLabel} order expired before delivery.`));
      return;
    }
    this.fail(request, new Error(event.reason || `${request.agentLabel} order was rejected.`));
  }

  private handleOrderCompleted(event: Event) {
    const request = this.findByOrder(event);
    if (!request) {
      this.logIgnored("order_completed", event);
      return;
    }
    void this.completeFromDelivery(request);
  }

  private startReconciliation(request: ActiveRequest) {
    if (request.reconcileInterval || !request.orderId) return;
    this.emit(request, {
      status: "confirming_delivery",
      orderId: request.orderId,
      paymentTxHash: request.paymentTxHash,
      receiptReference: request.receiptReference
    });
    console.info(`[${request.agentLabel}] stage=delivery status=confirming`);
    const reconcile = () => {
      if (request.settled || !request.orderId) return;
      void this.requireClient().getOrder(request.orderId)
        .then((order) => {
          if (request.settled) return;
          request.lastOrderStatus = order.status || request.lastOrderStatus;
          request.paymentTxHash = request.paymentTxHash ?? (order.payTxHash || undefined);
          request.receiptReference = request.receiptReference ?? (order.payTxHash || undefined);
          request.providerDeliveryTxHash = request.providerDeliveryTxHash ?? (order.deliverTxHash || undefined);
          if (isTerminalFailureStatus(order.status)) {
            this.fail(request, new Error(`${request.agentLabel} order did not complete. Last order status: ${order.status}.`));
            return;
          }
          if (deliveryMayExist(order.status)) {
            void this.completeFromDelivery(request, true);
          }
        })
        .catch(() => {
          // Transient reconciliation failures are bounded by the active request timeout.
        });
    };
    reconcile();
    request.reconcileInterval = setInterval(reconcile, request.reconciliationIntervalMs ?? 2500);
  }

  private async completeFromDelivery(request: ActiveRequest, tolerateNotReady = false) {
    if (request.settled || request.completing || !request.orderId) return;
    request.completing = true;
    const activeOrderId = request.orderId;
    try {
      const delivery = await this.requireClient().getDelivery(activeOrderId);
      const output = request.parseDelivery(delivery.deliverableText);
      if (request.settled) return;
      request.settled = true;
      const deliveryReference = delivery.deliveryId || delivery.contentHash || undefined;
      const deliveryTxHash = request.providerDeliveryTxHash ?? ("txHash" in delivery && typeof delivery.txHash === "string" ? delivery.txHash : undefined);
      console.info(`[${request.agentLabel}] stage=delivery status=completed`);
      this.emit(request, {
        status: "completed",
        orderId: activeOrderId,
        paymentTxHash: request.paymentTxHash,
        receiptReference: request.receiptReference,
        deliveryReference,
        providerDeliveryTxHash: deliveryTxHash
      });
      this.cleanupRequest(request);
      request.resolve({
        mode: "live",
        output,
        negotiationId: request.negotiationId,
        orderId: activeOrderId,
        paymentTxHash: request.paymentTxHash,
        receiptReference: request.receiptReference,
        deliveryReference,
        elapsedMs: Date.now() - request.started,
        rawDeliveryMetadata: {
          deliveryId: delivery.deliveryId || undefined,
          contentHash: delivery.contentHash || undefined,
          status: delivery.status || undefined,
          providerDeliveryTxHash: deliveryTxHash
        }
      });
    } catch (error) {
      request.completing = false;
      if (tolerateNotReady && isDeliveryNotReady(error)) return;
      this.fail(request, error);
    }
  }

  private findByNegotiation(event: Event) {
    if (!event.negotiation_id) return undefined;
    const request = this.byNegotiationId.get(event.negotiation_id);
    if (request && event.service_id && event.service_id !== request.serviceId) return undefined;
    return request;
  }

  private findByOrder(event: Event) {
    if (!event.order_id) return undefined;
    return this.byOrderId.get(event.order_id);
  }

  private armTimeout(request: ActiveRequest, message: () => string) {
    if (request.timeout) clearTimeout(request.timeout);
    request.timeout = setTimeout(() => this.fail(request, new CrooTimeoutError(message())), request.timeoutMs);
  }

  private fail(request: ActiveRequest, error: unknown) {
    if (request.settled) return;
    request.settled = true;
    const safeMessage = normalizeCrooError(error);
    console.info(`[${request.agentLabel}] stage=failure status=failed hasOrderId=${Boolean(request.orderId)} paymentSubmitted=${Boolean(request.paymentTxHash)} lastOrderStatus=${request.lastOrderStatus ?? "unknown"}`);
    this.emit(request, {
      status: "failed",
      orderId: request.orderId,
      paymentTxHash: request.paymentTxHash,
      receiptReference: request.receiptReference,
      providerDeliveryTxHash: request.providerDeliveryTxHash,
      error: safeMessage
    });
    this.cleanupRequest(request);
    request.reject(error);
  }

  private cleanupRequest(request: ActiveRequest) {
    if (request.timeout) clearTimeout(request.timeout);
    if (request.reconcileInterval) clearInterval(request.reconcileInterval);
    if (request.negotiationId) this.byNegotiationId.delete(request.negotiationId);
    if (request.orderId) this.byOrderId.delete(request.orderId);
    this.activeRequests.delete(request);
  }

  private emit(request: ActiveRequest, update: Omit<CoordinatorLifecycleUpdate, "elapsedMs">) {
    request.onStatus({ ...update, elapsedMs: Date.now() - request.started });
  }

  private requireClient() {
    if (!this.client) throw new Error("Coordinator runtime is not connected.");
    return this.client;
  }

  private logIgnored(stage: string, event: Event) {
    console.info(
      `[CoordinatorRuntime] ignored unrelated event stage=${stage} orderId=${String(redactValue(event.order_id || "none"))} negotiationId=${String(redactValue(event.negotiation_id || "none"))}`
    );
  }
}

export function parseCoordinatorDelivery<TOutput>(deliverableText: string, parse: (value: unknown) => TOutput, agentLabel: string): TOutput {
  try {
    return parse(JSON.parse(deliverableText) as unknown);
  } catch {
    throw new CrooDeliveryError(`${agentLabel} returned a delivery that did not match the required output schema.`);
  }
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
