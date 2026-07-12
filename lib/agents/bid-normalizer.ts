import { SAFETY_DISCLAIMER } from "@/lib/constants";
import { BidNormalizerOutputSchema, type BidNormalizerOutput, type TenderPacketInput } from "@/lib/schemas/ofora";

export interface BidNormalizationAdapter {
  summarizeSubmission(supplier: string): Promise<string | null>;
}

export class DeterministicBidAdapter implements BidNormalizationAdapter {
  async summarizeSubmission(): Promise<string | null> {
    return null;
  }
}

export async function runBidNormalizer(
  input: TenderPacketInput,
  adapter?: BidNormalizationAdapter
): Promise<BidNormalizerOutput> {
  const normalizedSuppliers = await Promise.all(
    input.suppliers.map(async (supplier) => {
      await adapter?.summarizeSubmission(supplier.name).catch(() => null);
      return {
        supplier: supplier.name,
        bidBand: getBidBand(supplier.bidAmountUsd, input.managedValueUsd),
        deliveryBand: getDeliveryBand(supplier.deliveryDays),
        documentCompleteness: getDocumentCompleteness(supplier.documents),
        normalizedScore: supplier.score
      };
    })
  );

  return BidNormalizerOutputSchema.parse({
    agent: "BidNormalizer",
    normalizedSuppliers,
    withheldFields: [
      "Raw supplier proposals",
      "Line-item commercial pricing",
      "Supplier-confidential attachments"
    ],
    disclaimer: SAFETY_DISCLAIMER
  });
}

function getBidBand(bidAmountUsd: number, managedValueUsd: number) {
  const ratio = bidAmountUsd / managedValueUsd;
  if (ratio <= 0.98) return "below managed value";
  if (ratio <= 1.03) return "near managed value";
  return "above managed value";
}

function getDeliveryBand(deliveryDays: number) {
  if (deliveryDays <= 21) return "emergency-ready";
  if (deliveryDays <= 30) return "extended timeline";
  return "long timeline";
}

function getDocumentCompleteness(documents: string[]) {
  if (documents.length >= 4) return "complete";
  if (documents.length > 0) return "partial";
  return "missing";
}
