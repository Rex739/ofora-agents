import { z } from "zod";

export const ProcurementCriterionSchema = z.object({
  name: z.string().min(1),
  weight: z.number(),
  description: z.string().min(1)
});

export const SupplierSubmissionSchema = z.object({
  name: z.string().min(1),
  submittedAt: z.string().min(1),
  bidAmountUsd: z.number(),
  deliveryDays: z.number().int(),
  documents: z.array(z.string().min(1)),
  declaredConflicts: z.boolean(),
  score: z.number().optional()
});

export const TenderPacketInputSchema = z.object({
  tenderId: z.string().min(1),
  title: z.string().min(1),
  buyer: z.string().min(1),
  managedValueUsd: z.number(),
  selectedSupplier: z.string().min(1),
  status: z.enum(["award_pending_validation", "validated", "flagged"]),
  purpose: z.string().min(1).optional(),
  lockedPolicy: z.object({
    lockedAt: z.string().min(1),
    criteria: z.array(ProcurementCriterionSchema).min(1)
  }),
  suppliers: z.array(SupplierSubmissionSchema).min(1)
});

export const PolicyLockOutputSchema = z.object({
  agent: z.literal("PolicyLock"),
  policyIntegrity: z.enum(["confirmed", "flagged"]),
  checks: z.array(
    z.object({
      check: z.string(),
      status: z.enum(["passed", "flagged"]),
      summary: z.string()
    })
  ),
  disclaimer: z.string()
});

export const BidNormalizerOutputSchema = z.object({
  agent: z.literal("BidNormalizer"),
  normalizedSuppliers: z.array(
    z.object({
      supplier: z.string(),
      bidBand: z.string(),
      deliveryBand: z.string(),
      documentCompleteness: z.enum(["complete", "partial", "missing"]),
      normalizedScore: z.number().optional()
    })
  ),
  withheldFields: z.array(z.string()),
  disclaimer: z.string()
});

export const SupplierRiskOutputSchema = z.object({
  agent: z.literal("SupplierRisk"),
  riskFlags: z.array(
    z.object({
      supplier: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      issue: z.string(),
      reviewRequired: z.boolean()
    })
  ),
  summary: z.string(),
  disclaimer: z.string()
});

export const AwardVerifierOutputSchema = z.object({
  agent: z.literal("AwardVerifier"),
  awardStatus: z.enum(["validated", "flagged"]),
  selectedSupplier: z.string(),
  validationSummary: z.string(),
  policyMatch: z.boolean(),
  reviewNotes: z.array(z.string()),
  disclaimer: z.string()
});

export const ReceiptWriterOutputSchema = z.object({
  agent: z.literal("ReceiptWriter"),
  receiptId: z.string(),
  tenderId: z.string(),
  selectedSupplier: z.string(),
  awardStatus: z.enum(["validated", "flagged"]),
  fairAwardReceiptSummary: z.string(),
  provenance: z.array(
    z.object({
      agent: z.string(),
      outputRef: z.string()
    })
  ),
  disclaimer: z.string()
});

export const AgentRunSchema = z.object({
  name: z.enum(["PolicyLock", "BidNormalizer", "SupplierRisk", "AwardVerifier", "ReceiptWriter"]),
  price: z.string(),
  actualOrderPrice: z.string().optional(),
  status: z.enum(["waiting", "connecting", "negotiating", "order_created", "payment_pending", "paid", "awaiting_delivery", "confirming_delivery", "processing", "delivered", "failed", "not_run", "blocked"]),
  orderId: z.string().optional(),
  txHash: z.string().optional(),
  resultHash: z.string().optional(),
  providerDeliveryTxHash: z.string().optional(),
  elapsedMs: z.number().optional(),
  error: z.string().optional()
});

export const OrchestrationRunSchema = z.object({
  runId: z.string(),
  status: z.enum(["idle", "running", "completed", "failed"]),
  startedAt: z.string(),
  agents: z.array(AgentRunSchema),
  outputs: z
    .object({
      policyLock: PolicyLockOutputSchema.optional(),
      bidNormalizer: BidNormalizerOutputSchema.optional(),
      supplierRisk: SupplierRiskOutputSchema.optional(),
      awardVerifier: AwardVerifierOutputSchema.optional(),
      receiptWriter: ReceiptWriterOutputSchema.optional()
    })
    .optional()
});

export type TenderPacketInput = z.infer<typeof TenderPacketInputSchema>;
export type PolicyLockOutput = z.infer<typeof PolicyLockOutputSchema>;
export type BidNormalizerOutput = z.infer<typeof BidNormalizerOutputSchema>;
export type SupplierRiskOutput = z.infer<typeof SupplierRiskOutputSchema>;
export type AwardVerifierOutput = z.infer<typeof AwardVerifierOutputSchema>;
export type ReceiptWriterOutput = z.infer<typeof ReceiptWriterOutputSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type OrchestrationRun = z.infer<typeof OrchestrationRunSchema>;
export type AgentName = AgentRun["name"];
