import assert from "node:assert/strict";
import test from "node:test";
import { createPolicyLockRequirements, runPolicyLockRequirements, type PolicyLockRequirements } from "@/lib/agents/policy-lock-requirements";
import { demoTender } from "@/lib/demo/case";

const validRequirements = createPolicyLockRequirements(demoTender, "2026-07-10T10:00:00.000Z");

function runWith(patch: (requirements: PolicyLockRequirements) => PolicyLockRequirements) {
  return runPolicyLockRequirements(patch(structuredClone(validRequirements)));
}

test("PolicyLock confirms valid criteria totaling 100", () => {
  const output = runPolicyLockRequirements(validRequirements);
  assert.equal(output.policyIntegrity, "confirmed");
});

test("PolicyLock flags criteria totals that are not 100", () => {
  const output = runWith((requirements) => {
    requirements.policy.criteria[0].weight = 30;
    return requirements;
  });
  assert.equal(output.policyIntegrity, "flagged");
});

test("PolicyLock flags invalid lockedAt timestamps", () => {
  const output = runWith((requirements) => {
    requirements.policy.lockedAt = "not-a-date";
    return requirements;
  });
  assert.equal(output.policyIntegrity, "flagged");
});

test("PolicyLock flags lockedAt after validationRequestedAt", () => {
  const output = runWith((requirements) => {
    requirements.policy.lockedAt = "2026-07-10T11:00:00.000Z";
    requirements.policy.validationRequestedAt = "2026-07-10T10:00:00.000Z";
    return requirements;
  });
  assert.equal(output.policyIntegrity, "flagged");
});

test("PolicyLock flags duplicate criterion names", () => {
  const output = runWith((requirements) => {
    requirements.policy.criteria[1].name = requirements.policy.criteria[0].name;
    return requirements;
  });
  assert.equal(output.policyIntegrity, "flagged");
});

test("PolicyLock flags zero or negative weights", () => {
  const output = runWith((requirements) => {
    requirements.policy.criteria[0].weight = 0;
    return requirements;
  });
  assert.equal(output.policyIntegrity, "flagged");
});
