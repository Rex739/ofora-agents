import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AGENT_PRICES, ORCHESTRATION_MARGIN, SPECIALIST_SPEND, USER_PRICE } from "@/lib/constants";
import { resolveLiveSpecialists, getLiveSpecialistAgentNames } from "@/lib/croo/live-specialists";

test("LIVE_SPECIALISTS resolves aliases, whitespace, lowercase, and duplicates", () => {
  assert.deepEqual(resolveLiveSpecialists(" policy, BIDS, risk, bids "), ["policy", "bids", "risk"]);
  assert.deepEqual(getLiveSpecialistAgentNames("policy,bids,risk"), ["PolicyLock", "BidNormalizer", "SupplierRisk"]);
});

test("LIVE_SPECIALISTS rejects unknown values", () => {
  assert.throws(() => resolveLiveSpecialists("policy,unknown"));
});

test("current pricing comes from centralized constants", () => {
  assert.equal(USER_PRICE, "$0.30 USDC");
  assert.equal(SPECIALIST_SPEND, "$0.25 USDC");
  assert.equal(ORCHESTRATION_MARGIN, "$0.05 USDC");
  assert.deepEqual(Object.values(AGENT_PRICES), ["$0.05 USDC", "$0.05 USDC", "$0.05 USDC", "$0.05 USDC", "$0.05 USDC"]);
});

test("dependency graph uses responsive flow instead of fixed-width horizontal layout", async () => {
  const source = await readFile(new URL("../app/workspace/workspace-client.tsx", import.meta.url), "utf8");
  assert.match(source, /xl:grid-cols-\[minmax\(0,1\.15fr\)_auto_minmax\(0,0\.95fr\)_auto_minmax\(0,0\.95fr\)\]/);
  assert.match(source, /PipelineConnector/);
  assert.doesNotMatch(source, /lg:grid-cols-\[minmax\(0,1fr\)_2rem_minmax\(0,0\.9fr\)_2rem_minmax\(0,0\.9fr\)\]/);
});
