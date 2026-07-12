import { demoTender } from "../../lib/demo/case";
import { deterministicAwardVerification, runAwardVerifier, type AwardVerifierInput } from "../../lib/agents/award-verifier";
import { runBidNormalizer } from "../../lib/agents/bid-normalizer";
import { runPolicyLock } from "../../lib/agents/policy-lock";
import { runSupplierRisk } from "../../lib/agents/supplier-risk";
import {
  BidNormalizerOutputSchema,
  PolicyLockOutputSchema,
  SupplierRiskOutputSchema,
  TenderPacketInputSchema
} from "../../lib/schemas/ofora";
import { runProviderLoop } from "./shared";

async function buildFallbackInput(): Promise<AwardVerifierInput> {
  const policyLock = runPolicyLock(demoTender);
  const bidNormalizer = await runBidNormalizer(demoTender);
  const supplierRisk = await runSupplierRisk(demoTender);
  return { tenderPacket: demoTender, policyLock, bidNormalizer, supplierRisk };
}

async function parseAwardInput(requirements: Record<string, unknown>): Promise<AwardVerifierInput> {
  const candidate = requirements.awardInput;
  if (!candidate || typeof candidate !== "object") return buildFallbackInput();
  const input = candidate as Record<string, unknown>;
  return {
    tenderPacket: TenderPacketInputSchema.parse(input.tenderPacket),
    policyLock: PolicyLockOutputSchema.parse(input.policyLock),
    bidNormalizer: BidNormalizerOutputSchema.parse(input.bidNormalizer),
    supplierRisk: SupplierRiskOutputSchema.parse(input.supplierRisk)
  };
}

void runProviderLoop("AwardVerifier", "AWARD_VERIFIER_SDK_KEY", async (requirements) => {
  const input = await parseAwardInput(requirements);
  const output = process.env.OPENAI_API_KEY ? await runAwardVerifier(input) : deterministicAwardVerification(input);
  return JSON.stringify(output);
});
