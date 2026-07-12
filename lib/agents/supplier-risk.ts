import { SAFETY_DISCLAIMER } from "@/lib/constants";
import { SupplierRiskOutputSchema, type SupplierRiskOutput, type TenderPacketInput } from "@/lib/schemas/ofora";

export interface SupplierRiskAdapter {
  review(input: TenderPacketInput): Promise<SupplierRiskOutput["riskFlags"]>;
}

export class DeterministicSupplierRiskAdapter implements SupplierRiskAdapter {
  async review(input: TenderPacketInput): Promise<SupplierRiskOutput["riskFlags"]> {
    return fallbackRiskFlags(input);
  }
}

export function fallbackRiskFlags(input: TenderPacketInput): SupplierRiskOutput["riskFlags"] {
  return input.suppliers.flatMap((supplier) => {
    const flags: SupplierRiskOutput["riskFlags"] = [];
    if (supplier.documents.length < 4) {
      flags.push({
        supplier: supplier.name,
        severity: supplier.documents.length < 3 ? "high" : "medium",
        issue: "Supplier submission has missing documentation.",
        reviewRequired: true
      });
    }
    if (supplier.declaredConflicts) {
      flags.push({
        supplier: supplier.name,
        severity: "high",
        issue: "Supplier declared a potential conflict requiring procurement review.",
        reviewRequired: true
      });
    }
    if (supplier.deliveryDays > 21) {
      flags.push({
        supplier: supplier.name,
        severity: supplier.deliveryDays > 30 ? "high" : "medium",
        issue: "Delivery timeline exceeds the locked emergency-readiness threshold.",
        reviewRequired: true
      });
    }
    if (flags.length === 0) {
      flags.push({
        supplier: supplier.name,
        severity: "low",
        issue: "No material supplier risk signal in the supplied demo packet.",
        reviewRequired: false
      });
    }
    return flags;
  });
}

export async function runSupplierRisk(
  input: TenderPacketInput,
  adapter?: SupplierRiskAdapter
): Promise<SupplierRiskOutput> {
  const riskFlags = adapter ? await adapter.review(input).catch(() => fallbackRiskFlags(input)) : fallbackRiskFlags(input);
  const reviewRequiredCount = riskFlags.filter((flag) => flag.reviewRequired).length;
  return SupplierRiskOutputSchema.parse({
    agent: "SupplierRisk",
    riskFlags,
    summary:
      reviewRequiredCount === 0
        ? "No material supplier risk signals require procurement review in the supplied demo packet."
        : `${reviewRequiredCount} supplier risk signal(s) require procurement review before award finalization.`,
    disclaimer: SAFETY_DISCLAIMER
  });
}
