import { z } from "zod";
import { SAFETY_DISCLAIMER } from "@/lib/constants";
import { PolicyLockOutputSchema, type PolicyLockOutput, type TenderPacketInput } from "@/lib/schemas/ofora";

export const PolicyLockRequirementsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  task: z.literal("validate_locked_policy"),
  tenderReference: z.string().min(1),
  policy: z.object({
    lockedAt: z.string().min(1),
    validationRequestedAt: z.string().min(1),
    criteria: z.array(z.object({
      name: z.string(),
      weight: z.number(),
      description: z.string()
    }))
  }),
  requestedOutput: z.literal("PolicyLockOutput")
});

export type PolicyLockRequirements = z.infer<typeof PolicyLockRequirementsSchema>;

export function createPolicyLockRequirements(tender: TenderPacketInput, validationRequestedAt = new Date().toISOString()): PolicyLockRequirements {
  return PolicyLockRequirementsSchema.parse({
    schemaVersion: "1.0",
    task: "validate_locked_policy",
    tenderReference: tender.tenderId,
    policy: {
      lockedAt: tender.lockedPolicy.lockedAt,
      validationRequestedAt,
      criteria: tender.lockedPolicy.criteria.map((criterion) => ({
        name: criterion.name,
        weight: criterion.weight,
        description: criterion.description
      }))
    },
    requestedOutput: "PolicyLockOutput"
  });
}

export function runPolicyLockRequirements(requirements: PolicyLockRequirements): PolicyLockOutput {
  const parsed = PolicyLockRequirementsSchema.parse(requirements);
  const totalWeight = parsed.policy.criteria.reduce((total, criterion) => total + criterion.weight, 0);
  const lockedAt = parseTimestamp(parsed.policy.lockedAt);
  const validationRequestedAt = parseTimestamp(parsed.policy.validationRequestedAt);
  const normalizedNames = parsed.policy.criteria.map((criterion) => criterion.name.trim().toLowerCase());
  const duplicateNames = normalizedNames.filter((name, index) => name && normalizedNames.indexOf(name) !== index);
  const checks = [
    {
      check: "Criteria weights total 100",
      status: totalWeight === 100 ? "passed" : "flagged",
      summary: `Locked evaluation criteria total ${totalWeight}.`
    },
    {
      check: "Policy lock timestamp is valid",
      status: lockedAt.valid ? "passed" : "flagged",
      summary: lockedAt.valid ? `Policy lock timestamp is valid: ${parsed.policy.lockedAt}.` : "Policy lock timestamp is invalid."
    },
    {
      check: "Validation request timestamp is valid",
      status: validationRequestedAt.valid ? "passed" : "flagged",
      summary: validationRequestedAt.valid ? `Validation request timestamp is valid: ${parsed.policy.validationRequestedAt}.` : "Validation request timestamp is invalid."
    },
    {
      check: "Policy locked before validation request",
      status: lockedAt.date && validationRequestedAt.date && lockedAt.date.getTime() < validationRequestedAt.date.getTime() ? "passed" : "flagged",
      summary: lockedAt.date && validationRequestedAt.date && lockedAt.date.getTime() < validationRequestedAt.date.getTime()
        ? "Locked policy timestamp precedes the validation request."
        : "Locked policy timestamp must precede the validation request."
    },
    {
      check: "At least one evaluation criterion exists",
      status: parsed.policy.criteria.length > 0 ? "passed" : "flagged",
      summary: `${parsed.policy.criteria.length} evaluation criterion/criteria supplied.`
    },
    {
      check: "Each criterion weight is greater than 0",
      status: parsed.policy.criteria.every((criterion) => criterion.weight > 0) ? "passed" : "flagged",
      summary: parsed.policy.criteria.every((criterion) => criterion.weight > 0)
        ? "All criterion weights are greater than 0."
        : "One or more criterion weights are zero or negative."
    },
    {
      check: "Each criterion name is non-empty",
      status: parsed.policy.criteria.every((criterion) => criterion.name.trim().length > 0) ? "passed" : "flagged",
      summary: parsed.policy.criteria.every((criterion) => criterion.name.trim().length > 0)
        ? "All criterion names are present."
        : "One or more criterion names are empty."
    },
    {
      check: "Criterion names are unique",
      status: duplicateNames.length === 0 ? "passed" : "flagged",
      summary: duplicateNames.length === 0
        ? "No duplicate criterion names were detected."
        : `Duplicate criterion name(s) detected: ${Array.from(new Set(duplicateNames)).join(", ")}.`
    }
  ] as const;

  return PolicyLockOutputSchema.parse({
    agent: "PolicyLock",
    policyIntegrity: checks.every((check) => check.status === "passed") ? "confirmed" : "flagged",
    checks,
    disclaimer: SAFETY_DISCLAIMER
  });
}

function parseTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { valid: false, date: null };
  return { valid: true, date };
}
