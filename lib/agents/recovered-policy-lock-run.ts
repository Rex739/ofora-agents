import { AGENT_PRICES, getHistoricalOrderPrice } from "@/lib/constants";
import { runAwardVerifier, runReceiptWriter } from "@/lib/agents/award-verifier";
import { runBidNormalizer } from "@/lib/agents/bid-normalizer";
import { runSupplierRisk } from "@/lib/agents/supplier-risk";
import type { LivePolicyLockResult } from "@/lib/croo/request-policy-lock-core";
import { OrchestrationRunSchema, type OrchestrationRun, type TenderPacketInput } from "@/lib/schemas/ofora";

export async function createRecoveredPolicyLockRun(
  input: TenderPacketInput,
  recovered: LivePolicyLockResult & { orderStatus?: string; providerDeliveryTxHash?: string }
): Promise<OrchestrationRun> {
  const policyLock = recovered.output;
  const [bidNormalizer, supplierRisk] = await Promise.all([
    runBidNormalizer(input),
    runSupplierRisk(input)
  ]);
  const awardVerifier = await runAwardVerifier({ tenderPacket: input, policyLock, bidNormalizer, supplierRisk });
  const receiptWriter = runReceiptWriter({ tenderPacket: input, policyLock, bidNormalizer, supplierRisk, awardVerifier });
  const recoveredSuffix = recovered.orderId.slice(0, 8);
  return OrchestrationRunSchema.parse({
    runId: `recovered-${recoveredSuffix}`,
    status: "completed",
    startedAt: new Date().toISOString(),
    agents: [
      {
        name: "PolicyLock",
        price: AGENT_PRICES.PolicyLock,
        actualOrderPrice: getHistoricalOrderPrice(recovered.orderId),
        status: "delivered",
        orderId: recovered.orderId,
        txHash: recovered.receiptReference ?? recovered.paymentTxHash,
        resultHash: recovered.deliveryReference,
        providerDeliveryTxHash: recovered.providerDeliveryTxHash ?? recovered.rawDeliveryMetadata?.providerDeliveryTxHash,
        elapsedMs: recovered.elapsedMs
      },
      ...(["BidNormalizer", "SupplierRisk", "AwardVerifier", "ReceiptWriter"] as const).map((name, index) => ({
        name,
        price: AGENT_PRICES[name],
        status: "delivered" as const,
        orderId: `demo_order_${name.toLowerCase()}_recovered`,
        txHash: `demo_receipt_${name.toLowerCase()}_recovered`,
        resultHash: `demo_delivery_${name.toLowerCase()}_recovered`,
        elapsedMs: 1000 + index * 180
      }))
    ],
    outputs: { policyLock, bidNormalizer, supplierRisk, awardVerifier, receiptWriter }
  });
}
