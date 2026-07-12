import { setTimeout as delay } from "node:timers/promises";
import { createRedactedLogger } from "../../lib/croo/redacted-logger";

export type ProviderEvent =
  | { type: "NegotiationCreated"; negotiationId: string; orderId?: string; requirements: Record<string, unknown> }
  | { type: "OrderPaid"; orderId: string; requirements: Record<string, unknown> };

export type ProviderRuntime = {
  acceptNegotiation(negotiationId: string): Promise<{ orderId: string }>;
  waitForOrderPaid(orderId: string): Promise<ProviderEvent>;
  deliverOrder(orderId: string, deliverable: string): Promise<{ resultHash: string }>;
  listen(handler: (event: ProviderEvent) => Promise<void>): Promise<void>;
};

type RuntimeCandidate = {
  acceptNegotiation?: (negotiationId: string) => Promise<{ orderId: string } | { order: { orderId: string } }>;
  connectWebSocket?: () => Promise<{ on?: (eventName: string, handler: (event: ProviderEvent) => void) => void }>;
  waitForOrderPaid?: (orderId: string) => Promise<ProviderEvent>;
  deliverOrder?: (orderId: string, input: { deliverableType: string; deliverableText: string }) => Promise<{ delivery: { contentHash: string } }>;
  getOrder?: (orderId: string) => Promise<{ status: string }>;
  on?: (eventName: string, handler: (event: ProviderEvent) => void) => void;
};

type CrooSdk = {
  AgentClient?: new (config: Record<string, unknown>, sdkKey: string) => RuntimeCandidate;
  DeliverableType?: { Text?: string };
  default?: {
    AgentClient?: new (config: Record<string, unknown>) => RuntimeCandidate;
    DeliverableType?: { Text?: string };
  };
};

export async function createProviderRuntime(serviceName: string, sdkKeyEnvName: string): Promise<ProviderRuntime> {
  if (process.env.DEMO_MODE !== "false") return createDemoProviderRuntime(serviceName);
  const sdk = (await import("@croo-network/sdk") as unknown) as CrooSdk;
  const AgentClient = sdk.AgentClient ?? sdk.default?.AgentClient;
  const textType = sdk.DeliverableType?.Text ?? sdk.default?.DeliverableType?.Text ?? "Text";
  if (!AgentClient) throw new Error("@croo-network/sdk AgentClient is unavailable.");
  const client = new AgentClient(
    {
      baseURL: requireEnv("CROO_API_URL"),
      wsURL: requireEnv("CROO_WS_URL"),
      rpcURL: requireEnv("BASE_RPC_URL"),
      logger: createRedactedLogger()
    },
    requireEnv(sdkKeyEnvName)
  );

  return {
    async acceptNegotiation(negotiationId) {
      if (!client.acceptNegotiation) throw new Error("CROO runtime missing acceptNegotiation.");
      const accepted = await client.acceptNegotiation(negotiationId);
      return "order" in accepted ? { orderId: accepted.order.orderId } : accepted;
    },
    async waitForOrderPaid(orderId) {
      if (client.waitForOrderPaid) return client.waitForOrderPaid(orderId);
      if (!client.getOrder) throw new Error("CROO runtime missing getOrder.");
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const order = await client.getOrder(orderId);
        if (order.status === "paid" || order.status === "delivering") {
          return { type: "OrderPaid", orderId, requirements: {} };
        }
        await delay(1500);
      }
      throw new Error("Timed out waiting for OrderPaid.");
    },
    async deliverOrder(orderId, deliverable) {
      if (!client.deliverOrder) throw new Error("CROO runtime missing deliverOrder.");
      const result = await client.deliverOrder(orderId, { deliverableType: textType, deliverableText: deliverable });
      return { resultHash: result.delivery.contentHash };
    },
    async listen(handler) {
      const stream = client.connectWebSocket ? await client.connectWebSocket() : client;
      if (!stream.on) throw new Error("CROO runtime missing event subscription.");
      stream.on("order_negotiation_created", (event) => {
        void handler(event);
      });
      console.log(`${serviceName} provider listening for CROO events.`);
      await new Promise(() => undefined);
    }
  };
}

export async function runProviderLoop(
  serviceName: string,
  sdkKeyEnvName: string,
  handlePaidOrder: (requirements: Record<string, unknown>) => Promise<string>
) {
  const runtime = await createProviderRuntime(serviceName, sdkKeyEnvName);
  await runtime.listen(async (event) => {
    if (event.type !== "NegotiationCreated") return;
    console.log(`${serviceName}: negotiation ${event.negotiationId} received`);
    const accepted = await runtime.acceptNegotiation(event.negotiationId);
    const paid = await runtime.waitForOrderPaid(accepted.orderId);
    const deliverable = await handlePaidOrder(normalizeRequirements(Object.keys(paid.requirements).length > 0 ? paid.requirements : event.requirements));
    const delivery = await runtime.deliverOrder(accepted.orderId, deliverable);
    console.log(`${serviceName}: delivered ${accepted.orderId} as ${delivery.resultHash}`);
  });
}

function normalizeRequirements(requirements: unknown): Record<string, unknown> {
  if (typeof requirements === "string") {
    try {
      const parsed = JSON.parse(requirements) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return requirements && typeof requirements === "object" && !Array.isArray(requirements) ? requirements as Record<string, unknown> : {};
}

function createDemoProviderRuntime(serviceName: string): ProviderRuntime {
  return {
    async acceptNegotiation(negotiationId) {
      await delay(100);
      return { orderId: `demo-provider-order-${negotiationId}` };
    },
    async waitForOrderPaid(orderId) {
      await delay(100);
      return { type: "OrderPaid", orderId, requirements: {} };
    },
    async deliverOrder(orderId) {
      await delay(100);
      return { resultHash: `demo-provider-delivery-${orderId}` };
    },
    async listen() {
      console.log(`${serviceName} provider ready in DEMO_MODE. Set DEMO_MODE=false to listen for live CROO events.`);
      await new Promise(() => undefined);
    }
  };
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
