import { AgentClient, DeliverableType, EventType, type Event, type EventStream } from "@croo-network/sdk";
import { createRedactedLogger } from "../../lib/croo/redacted-logger";
import { runPolicyLockRequirements, PolicyLockRequirementsSchema, type PolicyLockRequirements } from "../../lib/agents/policy-lock-requirements";
import { PolicyLockOutputSchema } from "../../lib/schemas/ofora";

type OrderContext = {
  negotiationId: string;
  orderId: string;
  requirements: PolicyLockRequirements;
};

const contextsByOrder = new Map<string, OrderContext>();
const acceptedNegotiations = new Set<string>();
const paidOrders = new Set<string>();
const completedOrders = new Set<string>();

async function main() {
  const client = new AgentClient(
    {
      baseURL: requireEnv("CROO_API_URL"),
      wsURL: requireEnv("CROO_WS_URL"),
      rpcURL: process.env.BASE_RPC_URL,
      logger: createRedactedLogger()
    },
    requireEnv("POLICY_LOCK_SDK_KEY")
  );
  const serviceId = process.env.POLICY_LOCK_SERVICE_ID;
  const stream = await client.connectWebSocket();

  stream.on(EventType.NegotiationCreated, (event) => {
    void handleNegotiationCreated(client, event, serviceId);
  });
  stream.on(EventType.OrderPaid, (event) => {
    void handleOrderPaid(client, event);
  });
  stream.on(EventType.OrderCompleted, (event) => {
    handleOrderCompleted(event);
  });
  stream.on(EventType.NegotiationExpired, (event) => {
    if (event.negotiation_id) log("Negotiation expired", event.negotiation_id);
  });
  stream.on(EventType.OrderRejected, (event) => {
    if (event.order_id) {
      log("Order rejected", event.order_id);
      contextsByOrder.delete(event.order_id);
    }
  });
  stream.on(EventType.OrderExpired, (event) => {
    if (event.order_id) {
      log("Order expired", event.order_id);
      contextsByOrder.delete(event.order_id);
    }
  });

  process.on("SIGINT", () => shutdown(stream));
  process.on("SIGTERM", () => shutdown(stream));
  log("Provider listening");
  await new Promise(() => undefined);
}

async function handleNegotiationCreated(client: AgentClient, event: Event, serviceId?: string) {
  const negotiationId = event.negotiation_id;
  if (!negotiationId || acceptedNegotiations.has(negotiationId)) return;
  if (serviceId && event.service_id && event.service_id !== serviceId) return;

  log("Negotiation received", negotiationId);
  acceptedNegotiations.add(negotiationId);

  try {
    const negotiation = await client.getNegotiation(negotiationId);
    if (serviceId && negotiation.serviceId !== serviceId) {
      log("Ignoring negotiation for another service", negotiationId);
      return;
    }
    const requirements = parseRequirements(negotiation.requirements);
    log("Requirements validated", negotiationId);
    const accepted = await client.acceptNegotiation(negotiationId);
    const orderId = accepted.order.orderId;
    contextsByOrder.set(orderId, { negotiationId, orderId, requirements });
    log("Negotiation accepted", negotiationId);
    log(`Order created: ${orderId}`);
  } catch (error) {
    const reason = getSafeErrorMessage(error);
    log(`Negotiation rejected: ${reason}`, negotiationId);
    await client.rejectNegotiation(negotiationId, reason).catch((rejectError: unknown) => {
      log(`Reject negotiation failed: ${getSafeErrorMessage(rejectError)}`, negotiationId);
    });
  }
}

async function handleOrderPaid(client: AgentClient, event: Event) {
  const orderId = event.order_id;
  if (!orderId || paidOrders.has(orderId)) return;
  const context = contextsByOrder.get(orderId);
  if (!context) {
    log("Order paid with no in-memory context", orderId);
    return;
  }
  paidOrders.add(orderId);
  log(`Payment confirmed: ${orderId}`);
  try {
    const output = PolicyLockOutputSchema.parse(runPolicyLockRequirements(context.requirements));
    log("Policy validation completed", orderId);
    await client.deliverOrder(orderId, {
      deliverableType: DeliverableType.Text,
      deliverableText: JSON.stringify(output)
    });
    log(`Delivery submitted: ${orderId}`);
  } catch (error) {
    log(`Delivery failure: ${getSafeErrorMessage(error)}`, orderId);
    await client.rejectOrder(orderId, "PolicyLock delivery failed safely.").catch((rejectError: unknown) => {
      log(`Reject order failed: ${getSafeErrorMessage(rejectError)}`, orderId);
    });
  }
}

function handleOrderCompleted(event: Event) {
  const orderId = event.order_id;
  if (!orderId || completedOrders.has(orderId)) return;
  completedOrders.add(orderId);
  contextsByOrder.delete(orderId);
  log("Order completed", orderId);
}

function parseRequirements(requirementsText: string) {
  try {
    return PolicyLockRequirementsSchema.parse(JSON.parse(requirementsText) as unknown);
  } catch {
    throw new Error("Invalid PolicyLock requirements schema.");
  }
}

function shutdown(stream: EventStream) {
  log("Provider shutting down");
  stream.close();
  process.exit(0);
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown provider error.";
}

function log(message: string, ref?: string) {
  console.log(`[PolicyLock] ${message}${ref ? `: ${ref}` : ""}`);
}

void main().catch((error: unknown) => {
  console.error(`[PolicyLock] Fatal provider error: ${getSafeErrorMessage(error)}`);
  process.exit(1);
});
