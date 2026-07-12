import OpenAI from "openai";
import { SAFETY_DISCLAIMER } from "@/lib/constants";
import {
  AwardVerifierOutputSchema,
  ReceiptWriterOutputSchema,
  type AwardVerifierOutput,
  type BidNormalizerOutput,
  type PolicyLockOutput,
  type ReceiptWriterOutput,
  type SupplierRiskOutput,
  type TenderPacketInput
} from "@/lib/schemas/ofora";

export type AwardVerifierInput = {
  tenderPacket: TenderPacketInput;
  policyLock: PolicyLockOutput;
  bidNormalizer: BidNormalizerOutput;
  supplierRisk: SupplierRiskOutput;
};

export type ReceiptWriterInput = AwardVerifierInput & {
  awardVerifier: AwardVerifierOutput;
};

export async function runAwardVerifier(input: AwardVerifierInput): Promise<AwardVerifierOutput> {
  if (!process.env.OPENAI_API_KEY || process.env.DEMO_MODE !== "false") {
    return deterministicAwardVerification(input);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return concise procurement award validation JSON matching AwardVerifierOutput. Do not expose raw supplier proposals, guarantee legal compliance, or claim procurement officer replacement."
      },
      {
        role: "user",
        content: JSON.stringify(input)
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) return deterministicAwardVerification(input);
  return AwardVerifierOutputSchema.parse(JSON.parse(content) as unknown);
}

export function deterministicAwardVerification(input: AwardVerifierInput): AwardVerifierOutput {
  const selectedSupplier = input.tenderPacket.suppliers.find(
    (supplier) => supplier.name === input.tenderPacket.selectedSupplier
  );
  const selectedRiskFlags = input.supplierRisk.riskFlags.filter(
    (flag) => flag.supplier === input.tenderPacket.selectedSupplier && flag.reviewRequired
  );
  const policyConfirmed = input.policyLock.policyIntegrity === "confirmed";
  const selectedNormalized = input.bidNormalizer.normalizedSuppliers.find(
    (supplier) => supplier.supplier === input.tenderPacket.selectedSupplier
  );
  const policyMatch = Boolean(policyConfirmed && selectedSupplier && selectedRiskFlags.length === 0);
  const awardStatus = policyMatch ? "validated" : "flagged";

  return AwardVerifierOutputSchema.parse({
    agent: "AwardVerifier",
    awardStatus,
    selectedSupplier: input.tenderPacket.selectedSupplier,
    validationSummary: policyMatch
      ? `${input.tenderPacket.selectedSupplier} aligns with the locked evaluation policy for ${input.tenderPacket.title}.`
      : `${input.tenderPacket.selectedSupplier} requires procurement review before final award validation.`,
    policyMatch,
    reviewNotes: [
      policyConfirmed
        ? "Locked policy integrity was confirmed before award validation."
        : "Locked policy integrity was flagged by PolicyLock.",
      selectedNormalized
        ? `Selected supplier normalized profile: ${selectedNormalized.bidBand}, ${selectedNormalized.deliveryBand}, documentation ${selectedNormalized.documentCompleteness}.`
        : "Selected supplier was not found in normalized supplier outputs.",
      selectedRiskFlags.length === 0
        ? "No selected-supplier risk flag requires review in the supplied demo packet."
        : `${selectedRiskFlags.length} selected-supplier risk flag(s) require procurement review.`,
      "Raw commercial proposals remain withheld from the Fair Award Receipt."
    ],
    disclaimer: SAFETY_DISCLAIMER
  });
}

export function runReceiptWriter(input: ReceiptWriterInput): ReceiptWriterOutput {
  return ReceiptWriterOutputSchema.parse({
    agent: "ReceiptWriter",
    receiptId: `FAR-${input.tenderPacket.tenderId}-001`,
    tenderId: input.tenderPacket.tenderId,
    selectedSupplier: input.tenderPacket.selectedSupplier,
    awardStatus: input.awardVerifier.awardStatus,
    fairAwardReceiptSummary:
      input.awardVerifier.awardStatus === "validated"
        ? `${input.tenderPacket.selectedSupplier} followed the locked evaluation policy for ${input.tenderPacket.title}, subject to procurement officer review and listed audit boundaries.`
        : `${input.tenderPacket.selectedSupplier} requires procurement review before the Fair Award Receipt can be treated as validated.`,
    provenance: [
      { agent: "PolicyLock", outputRef: "policy-integrity-checks" },
      { agent: "BidNormalizer", outputRef: "normalized-supplier-bands" },
      { agent: "SupplierRisk", outputRef: "supplier-risk-flags" },
      { agent: "AwardVerifier", outputRef: "award-validation-summary" },
      { agent: "ReceiptWriter", outputRef: "fair-award-receipt" }
    ],
    disclaimer: SAFETY_DISCLAIMER
  });
}
