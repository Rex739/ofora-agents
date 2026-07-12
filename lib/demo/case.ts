import { SYNTHETIC_CASE_NOTICE } from "@/lib/constants";
import { TenderPacketInputSchema, type TenderPacketInput } from "@/lib/schemas/ofora";

export const demoTender: TenderPacketInput = TenderPacketInputSchema.parse({
  tenderId: "OFR-2026-041",
  title: "Emergency Solar Lantern Procurement",
  buyer: "Global Relief & Infrastructure Network",
  managedValueUsd: 10000,
  selectedSupplier: "Nova Relief Systems",
  status: "award_pending_validation",
  purpose:
    "Validate that the selected supplier follows the locked evaluation policy without publishing raw supplier proposals.",
  lockedPolicy: {
    lockedAt: "2026-07-10T09:00:00.000Z",
    criteria: [
      {
        name: "Price competitiveness",
        weight: 35,
        description: "Evaluate total cost against the managed value and responsive emergency procurement requirements."
      },
      {
        name: "Delivery readiness",
        weight: 25,
        description: "Confirm the supplier can deliver emergency solar lanterns within the required response window."
      },
      {
        name: "Technical compliance",
        weight: 25,
        description: "Confirm supplied lantern specifications align with locked technical requirements."
      },
      {
        name: "Documentation completeness",
        weight: 15,
        description: "Confirm required warranty, product, tax, and sanctions documentation is present."
      }
    ]
  },
  suppliers: [
    {
      name: "Nova Relief Systems",
      submittedAt: "2026-07-10T11:30:00.000Z",
      bidAmountUsd: 9820,
      deliveryDays: 18,
      documents: ["Warranty letter", "Product specification", "Tax attestation", "Sanctions attestation"],
      declaredConflicts: false,
      score: 91
    },
    {
      name: "HelioAid Supply Co.",
      submittedAt: "2026-07-10T11:45:00.000Z",
      bidAmountUsd: 9650,
      deliveryDays: 28,
      documents: ["Product specification", "Tax attestation"],
      declaredConflicts: false,
      score: 78
    },
    {
      name: "BrightBridge Logistics",
      submittedAt: "2026-07-10T12:05:00.000Z",
      bidAmountUsd: 10140,
      deliveryDays: 20,
      documents: ["Warranty letter", "Product specification", "Tax attestation"],
      declaredConflicts: true,
      score: 83
    }
  ]
});

export const demoTenderLabel = SYNTHETIC_CASE_NOTICE;
