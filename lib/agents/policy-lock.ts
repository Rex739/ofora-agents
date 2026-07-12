import { SAFETY_DISCLAIMER } from "@/lib/constants";
import { PolicyLockOutputSchema, type PolicyLockOutput, type TenderPacketInput } from "@/lib/schemas/ofora";
import { createPolicyLockRequirements, runPolicyLockRequirements } from "@/lib/agents/policy-lock-requirements";

export function runPolicyLock(input: TenderPacketInput): PolicyLockOutput {
  const lockedAt = new Date(input.lockedPolicy.lockedAt);
  const validationRequestedAt = Number.isNaN(lockedAt.getTime())
    ? "invalid-validation-request"
    : new Date(lockedAt.getTime() + 1000).toISOString();
  const output = runPolicyLockRequirements(createPolicyLockRequirements(input, validationRequestedAt));
  return PolicyLockOutputSchema.parse({
    ...output,
    disclaimer: SAFETY_DISCLAIMER
  });
}
