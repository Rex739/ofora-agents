import { deterministicAwardVerification, runReceiptWriter, type ReceiptWriterInput } from "../../lib/agents/award-verifier";
import { demoTender } from "../../lib/demo/case";
import { runBidNormalizer } from "../../lib/agents/bid-normalizer";
import { runPolicyLock } from "../../lib/agents/policy-lock";
import { runSupplierRisk } from "../../lib/agents/supplier-risk";
import {
  AwardVerifierOutputSchema,
  BidNormalizerOutputSchema,
  PolicyLockOutputSchema,
  SupplierRiskOutputSchema,
  TenderPacketInputSchema
} from "../../lib/schemas/ofora";
import { runProviderLoop } from "./shared";

async function buildFallbackInput(): Promise<ReceiptWriterInput> {
  const policyLock = runPolicyLock(demoTender);
  const bidNormalizer = await runBidNormalizer(demoTender);
  const supplierRisk = await runSupplierRisk(demoTender);
  const awardVerifier = deterministicAwardVerification({ tenderPacket: demoTender, policyLock, bidNormalizer, supplierRisk });
  return { tenderPacket: demoTender, policyLock, bidNormalizer, supplierRisk, awardVerifier };
}

async function parseReceiptInput(requirements: Record<string, unknown>): Promise<ReceiptWriterInput> {
  const candidate = requirements.receiptInput;
  if (!candidate || typeof candidate !== "object") return buildFallbackInput();
  const input = candidate as Record<string, unknown>;
  return {
    tenderPacket: TenderPacketInputSchema.parse(input.tenderPacket),
    policyLock: PolicyLockOutputSchema.parse(input.policyLock),
    bidNormalizer: BidNormalizerOutputSchema.parse(input.bidNormalizer),
    supplierRisk: SupplierRiskOutputSchema.parse(input.supplierRisk),
    awardVerifier: AwardVerifierOutputSchema.parse(input.awardVerifier)
  };
}

void runProviderLoop("ReceiptWriter", "RECEIPT_WRITER_SDK_KEY", async (requirements) => JSON.stringify(runReceiptWriter(await parseReceiptInput(requirements))));
