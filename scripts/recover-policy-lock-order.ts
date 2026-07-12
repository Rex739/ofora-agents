import { AgentClient } from "@croo-network/sdk";
import { recoverLivePolicyLockOrder } from "../lib/croo/request-policy-lock-core";
import { createRedactedLogger, redactValue } from "../lib/croo/redacted-logger";

const logger = createRedactedLogger();

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    logger.error("Usage: npm run recover:policy -- <order-id>");
    process.exit(1);
  }

  const result = await recoverLivePolicyLockOrder(orderId, {
    createClient: async () => new AgentClient(
      {
        baseURL: requireEnv("CROO_API_URL"),
        wsURL: requireEnv("CROO_WS_URL"),
        rpcURL: process.env.BASE_RPC_URL,
        logger
      },
      requireEnv("CROO_COORDINATOR_SDK_KEY")
    )
  });
  logger.info("PolicyLock order recovered", redactValue({
    orderId: result.orderId,
    status: result.orderStatus,
    paymentTxHash: result.paymentTxHash,
    deliveryReference: result.deliveryReference,
    deliveryId: result.rawDeliveryMetadata?.deliveryId,
    contentHash: result.rawDeliveryMetadata?.contentHash,
    providerDeliveryTxHash: result.providerDeliveryTxHash,
    elapsedMs: result.elapsedMs
  }));
  logger.info("Validated PolicyLock output", redactValue(result.output));
}

void main().catch((error: unknown) => {
  logger.error("PolicyLock recovery failed", error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
