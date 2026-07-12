import { setTimeout as delay } from "node:timers/promises";
import { createRedactedLogger, redactValue } from "../../lib/croo/redacted-logger";

type RawEvent = {
  type?: string;
  negotiation_id?: string;
  order_id?: string;
  service_id?: string;
  reason?: string;
};

type Negotiation = {
  negotiationId: string;
  serviceId: string;
  requirements: string;
};

type AcceptedNegotiation = {
  orderId: string;
};

type DeliveryResult = {
  resultHash?: string;
  deliveryId?: string;
  txHash?: string;
};

type ProviderRuntime = {
  getNegotiation(negotiationId: string): Promise<Negotiation>;
  acceptNegotiation(negotiationId: string): Promise<AcceptedNegotiation>;
  rejectNegotiation(negotiationId: string, reason: string): Promise<void>;
  deliverOrder(orderId: string, deliverable: string): Promise<DeliveryResult>;
  rejectOrder(orderId: string, reason: string): Promise<void>;
  listen(handlers: ProviderEventHandlers): Promise<void>;
};

type ProviderEventHandlers = {
  onNegotiationCreated(event: RawEvent): void;
  onOrderPaid(event: RawEvent): void;
  onOrderCompleted(event: RawEvent): void;
  onOrderRejected(event: RawEvent): void;
  onOrderExpired(event: RawEvent): void;
  onNegotiationExpired(event: RawEvent): void;
};

type RuntimeCandidate = {
  acceptNegotiation?: (negotiationId: string) => Promise<{ orderId: string } | { order: { orderId: string } }>;
  rejectNegotiation?: (negotiationId: string, reason: string) => Promise<void>;
  getNegotiation?: (negotiationId: string) => Promise<Negotiation>;
  connectWebSocket?: () => Promise<{ close?: () => void; on?: (eventName: string, handler: (event: RawEvent) => void) => void }>;
  deliverOrder?: (orderId: string, input: { deliverableType: string; deliverableText: string }) => Promise<{ delivery?: { contentHash?: string; deliveryId?: string }; txHash?: string }>;
  rejectOrder?: (orderId: string, reason: string) => Promise<void>;
};

type CrooSdk = {
  AgentClient?: new (config: Record<string, unknown>, sdkKey: string) => RuntimeCandidate;
  DeliverableType?: { Text?: string };
  EventType?: Record<string, string>;
  default?: {
    AgentClient?: new (config: Record<string, unknown>, sdkKey: string) => RuntimeCandidate;
    DeliverableType?: { Text?: string };
    EventType?: Record<string, string>;
  };
};

type RunProviderLoopOptions = {
  serviceName: string;
  sdkKeyEnvName: string;
  handlePaidOrder: (requirements: Record<string, unknown>) => Promise<string>;
  serviceIdEnvName?: string;
  runtime?: ProviderRuntime;
  validateRequirements?: (requirements: Record<string, unknown>) => void;
};

type ProviderState = {
  acceptedNegotiations: Set<string>;
  completedOrders: Set<string>;
  contextsByOrder: Map<string, { negotiationId: string; orderId: string; requirements: Record<string, unknown> }>;
  paidOrders: Set<string>;
};

export async function createProviderRuntime(serviceName: string, sdkKeyEnvName: string): Promise<ProviderRuntime> {
  if (process.env.DEMO_MODE !== "false") return createDemoProviderRuntime(serviceName);
  const sdk = (await import("@croo-network/sdk") as unknown) as CrooSdk;
  const AgentClient = sdk.AgentClient ?? sdk.default?.AgentClient;
  const textType = sdk.DeliverableType?.Text ?? sdk.default?.DeliverableType?.Text ?? "text";
  const eventType = {
    NegotiationCreated: sdk.EventType?.NegotiationCreated ?? sdk.default?.EventType?.NegotiationCreated ?? "order_negotiation_created",
    NegotiationExpired: sdk.EventType?.NegotiationExpired ?? sdk.default?.EventType?.NegotiationExpired ?? "order_negotiation_expired",
    OrderPaid: sdk.EventType?.OrderPaid ?? sdk.default?.EventType?.OrderPaid ?? "order_paid",
    OrderCompleted: sdk.EventType?.OrderCompleted ?? sdk.default?.EventType?.OrderCompleted ?? "order_completed",
    OrderRejected: sdk.EventType?.OrderRejected ?? sdk.default?.EventType?.OrderRejected ?? "order_rejected",
    OrderExpired: sdk.EventType?.OrderExpired ?? sdk.default?.EventType?.OrderExpired ?? "order_expired"
  };

  if (!AgentClient) throw new Error("@croo-network/sdk AgentClient is unavailable.");
  const client = new AgentClient(
    {
      baseURL: requireEnv("CROO_API_URL"),
      wsURL: requireEnv("CROO_WS_URL"),
      rpcURL: process.env.BASE_RPC_URL,
      logger: createRedactedLogger()
    },
    requireEnv(sdkKeyEnvName)
  );

  return {
    async getNegotiation(negotiationId) {
      if (!client.getNegotiation) throw new Error("CROO runtime missing getNegotiation.");
      return client.getNegotiation(negotiationId);
    },
    async acceptNegotiation(negotiationId) {
      if (!client.acceptNegotiation) throw new Error("CROO runtime missing acceptNegotiation.");
      const accepted = await client.acceptNegotiation(negotiationId);
      return "order" in accepted ? { orderId: accepted.order.orderId } : accepted;
    },
    async rejectNegotiation(negotiationId, reason) {
      if (!client.rejectNegotiation) throw new Error("CROO runtime missing rejectNegotiation.");
      await client.rejectNegotiation(negotiationId, reason);
    },
    async deliverOrder(orderId, deliverable) {
      if (!client.deliverOrder) throw new Error("CROO runtime missing deliverOrder.");
      const result = await client.deliverOrder(orderId, { deliverableType: textType, deliverableText: deliverable });
      return {
        deliveryId: result.delivery?.deliveryId,
        resultHash: result.delivery?.contentHash,
        txHash: result.txHash
      };
    },
    async rejectOrder(orderId, reason) {
      if (!client.rejectOrder) throw new Error("CROO runtime missing rejectOrder.");
      await client.rejectOrder(orderId, reason);
    },
    async listen(handlers) {
      const stream = client.connectWebSocket ? await client.connectWebSocket() : undefined;
      if (!stream?.on) throw new Error("CROO runtime missing event subscription.");
      stream.on(eventType.NegotiationCreated, handlers.onNegotiationCreated);
      stream.on(eventType.OrderPaid, handlers.onOrderPaid);
      stream.on(eventType.OrderCompleted, handlers.onOrderCompleted);
      stream.on(eventType.OrderRejected, handlers.onOrderRejected);
      stream.on(eventType.OrderExpired, handlers.onOrderExpired);
      stream.on(eventType.NegotiationExpired, handlers.onNegotiationExpired);
      process.on("SIGINT", () => shutdown(serviceName, stream));
      process.on("SIGTERM", () => shutdown(serviceName, stream));
      log(serviceName, "Provider listening");
      await new Promise(() => undefined);
    }
  };
}

export async function runProviderLoop(
  serviceName: string,
  sdkKeyEnvName: string,
  handlePaidOrder: (requirements: Record<string, unknown>) => Promise<string>,
  serviceIdEnvName?: string,
  validateRequirements?: (requirements: Record<string, unknown>) => void
) {
  const runtime = await createProviderRuntime(serviceName, sdkKeyEnvName);
  await runProviderLoopWithRuntime({
    serviceName,
    sdkKeyEnvName,
    handlePaidOrder,
    serviceIdEnvName,
    runtime,
    validateRequirements
  });
}

export async function runProviderLoopWithRuntime(options: RunProviderLoopOptions) {
  const state = createProviderState();
  const serviceId = options.serviceIdEnvName ? process.env[options.serviceIdEnvName] : undefined;
  await options.runtime?.listen(createProviderEventHandlers(options, state, serviceId));
}

export function createProviderEventHandlers(
  options: RunProviderLoopOptions,
  state: ProviderState = createProviderState(),
  serviceId = options.serviceIdEnvName ? process.env[options.serviceIdEnvName] : undefined
): ProviderEventHandlers {
  const runtime = options.runtime;
  if (!runtime) throw new Error("Provider runtime is required.");

  return {
    onNegotiationCreated(event) {
      void handleNegotiationCreated(options, state, runtime, serviceId, event);
    },
    onOrderPaid(event) {
      void handleOrderPaid(options, state, runtime, event);
    },
    onOrderCompleted(event) {
      const orderId = event.order_id;
      if (!orderId || state.completedOrders.has(orderId)) return;
      state.completedOrders.add(orderId);
      state.contextsByOrder.delete(orderId);
      log(options.serviceName, "Order completed", orderId);
    },
    onOrderRejected(event) {
      const orderId = event.order_id;
      if (!orderId) return;
      state.contextsByOrder.delete(orderId);
      log(options.serviceName, "Order rejected", orderId);
    },
    onOrderExpired(event) {
      const orderId = event.order_id;
      if (!orderId) return;
      state.contextsByOrder.delete(orderId);
      log(options.serviceName, "Order expired", orderId);
    },
    onNegotiationExpired(event) {
      if (event.negotiation_id) log(options.serviceName, "Negotiation expired", event.negotiation_id);
    }
  };
}

function createProviderState(): ProviderState {
  return {
    acceptedNegotiations: new Set(),
    completedOrders: new Set(),
    contextsByOrder: new Map(),
    paidOrders: new Set()
  };
}

async function handleNegotiationCreated(
  options: RunProviderLoopOptions,
  state: ProviderState,
  runtime: ProviderRuntime,
  serviceId: string | undefined,
  event: RawEvent
) {
  const negotiationId = event.negotiation_id;
  if (!negotiationId || state.acceptedNegotiations.has(negotiationId)) return;
  if (serviceId && event.service_id && event.service_id !== serviceId) return;

  state.acceptedNegotiations.add(negotiationId);
  log(options.serviceName, "Negotiation received", negotiationId);

  try {
    log(options.serviceName, "GET negotiation", negotiationId);
    const negotiation = await runtime.getNegotiation(negotiationId);
    if (serviceId && negotiation.serviceId !== serviceId) {
      log(options.serviceName, "Ignoring negotiation for another service", negotiationId);
      return;
    }
    const requirements = parseRequirements(negotiation.requirements);
    options.validateRequirements?.(requirements);
    log(options.serviceName, "Requirements validated", negotiationId);
    const accepted = await runtime.acceptNegotiation(negotiationId);
    state.contextsByOrder.set(accepted.orderId, { negotiationId, orderId: accepted.orderId, requirements });
    log(options.serviceName, "Negotiation accepted", negotiationId);
    log(options.serviceName, "Order created", accepted.orderId);
  } catch (error) {
    const reason = `Invalid or unsupported ${options.serviceName} requirements.`;
    log(options.serviceName, `Requirements rejected: ${getSafeErrorMessage(error)}`, negotiationId);
    await runtime.rejectNegotiation(negotiationId, reason).catch((rejectError: unknown) => {
      log(options.serviceName, `Reject negotiation failed: ${getSafeErrorMessage(rejectError)}`, negotiationId);
    });
  }
}

async function handleOrderPaid(options: RunProviderLoopOptions, state: ProviderState, runtime: ProviderRuntime, event: RawEvent) {
  const orderId = event.order_id;
  if (!orderId || state.paidOrders.has(orderId)) return;
  const context = state.contextsByOrder.get(orderId);
  if (!context) {
    log(options.serviceName, "Ignoring payment for unrelated order", orderId);
    return;
  }

  state.paidOrders.add(orderId);
  log(options.serviceName, "Payment confirmed", orderId);

  try {
    const deliverable = await options.handlePaidOrder(context.requirements);
    const delivery = await runtime.deliverOrder(orderId, deliverable);
    const deliveryRef = delivery.deliveryId ?? delivery.resultHash ?? "delivery-submitted";
    log(options.serviceName, `Delivery submitted: ${deliveryRef}${delivery.txHash ? ` tx=${delivery.txHash}` : ""}`, orderId);
  } catch (error) {
    log(options.serviceName, `Delivery failure: ${getSafeErrorMessage(error)}`, orderId);
    await runtime.rejectOrder(orderId, `${options.serviceName} delivery failed safely.`).catch((rejectError: unknown) => {
      log(options.serviceName, `Reject order failed: ${getSafeErrorMessage(rejectError)}`, orderId);
    });
  }
}

function parseRequirements(requirementsText: string) {
  try {
    const parsed = JSON.parse(requirementsText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Requirements must be a JSON object.");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid requirements JSON.");
  }
}

function createDemoProviderRuntime(serviceName: string): ProviderRuntime {
  return {
    async getNegotiation(negotiationId) {
      return {
        negotiationId,
        serviceId: `demo-${serviceName.toLowerCase()}`,
        requirements: "{}"
      };
    },
    async acceptNegotiation(negotiationId) {
      await delay(100);
      return { orderId: `demo-provider-order-${negotiationId}` };
    },
    async rejectNegotiation() {
      await delay(100);
    },
    async deliverOrder(orderId) {
      await delay(100);
      return { resultHash: `demo-provider-delivery-${orderId}` };
    },
    async rejectOrder() {
      await delay(100);
    },
    async listen() {
      log(serviceName, "Provider ready in DEMO_MODE. Set DEMO_MODE=false to listen for live CROO events.");
      await new Promise(() => undefined);
    }
  };
}

function shutdown(serviceName: string, stream: { close?: () => void }) {
  log(serviceName, "Provider shutting down");
  stream.close?.();
  process.exit(0);
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function getSafeErrorMessage(error: unknown) {
  return String(redactValue(error instanceof Error ? error.message : "Unknown provider error."));
}

function log(serviceName: string, message: string, ref?: string) {
  console.log(`[${serviceName}] ${message}${ref ? `: ${String(redactValue(ref))}` : ""}`);
}
