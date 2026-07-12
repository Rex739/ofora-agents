import "server-only";
import { randomUUID } from "node:crypto";
import { AGENT_PRICES } from "@/lib/constants";
import { createRecoveredPolicyLockRun } from "@/lib/agents/recovered-policy-lock-run";
import { normalizeCrooError } from "@/lib/croo/errors";
import { recoverLivePolicyLockOrder } from "@/lib/croo/request-policy-lock";
import { requestSpecialistAgent, type SpecialistStatusEvent } from "@/lib/croo/request-specialist-agent";
import {
  OrchestrationRunSchema,
  type AgentName,
  type AgentRun,
  type OrchestrationRun,
  type TenderPacketInput
} from "@/lib/schemas/ofora";

const serviceIds: Record<AgentName, string> = {
  PolicyLock: "ofora.policy-lock.v1",
  BidNormalizer: "ofora.bid-normalizer.v1",
  SupplierRisk: "ofora.supplier-risk.v1",
  AwardVerifier: "ofora.award-verifier.v1",
  ReceiptWriter: "ofora.receipt-writer.v1"
};

const runs = new Map<string, OrchestrationRun>();

export function createInitialRun(): OrchestrationRun {
  return OrchestrationRunSchema.parse({
    runId: `run-${randomUUID().slice(0, 8)}`,
    status: "running",
    startedAt: new Date().toISOString(),
    agents: (Object.keys(AGENT_PRICES) as AgentName[]).map((name) => ({
      name,
      price: AGENT_PRICES[name],
      status: "waiting"
    }))
  });
}

export function getRun(runId: string) {
  return runs.get(runId);
}

export async function orchestrateTender(input: TenderPacketInput): Promise<OrchestrationRun> {
  const run = createInitialRun();
  runs.set(run.runId, run);

  const update = (event: SpecialistStatusEvent) => {
    const current = runs.get(run.runId);
    if (!current) return;
    current.status =
      event.status === "failed" ? "failed" : current.status === "completed" ? "completed" : "running";
    current.agents = current.agents.map((agent) =>
      agent.name === event.agent ? ({ ...agent, ...event, status: event.status } satisfies AgentRun) : agent
    );
    runs.set(run.runId, OrchestrationRunSchema.parse(current));
  };

  try {
    const upstreamRequests = [
      requestSpecialistAgent({
        agent: "PolicyLock",
        serviceId: serviceIds.PolicyLock,
        requirements: { tenderRef: input.tenderId, tenderPacket: input },
        onStatus: update
      }),
      requestSpecialistAgent({
        agent: "BidNormalizer",
        serviceId: serviceIds.BidNormalizer,
        requirements: { tenderRef: input.tenderId, supplierCount: input.suppliers.length, tenderPacket: input },
        onStatus: update
      }),
      requestSpecialistAgent({
        agent: "SupplierRisk",
        serviceId: serviceIds.SupplierRisk,
        requirements: { tenderRef: input.tenderId, suppliers: input.suppliers.map((supplier) => supplier.name), tenderPacket: input },
        onStatus: update
      })
    ] as const;
    const upstream = await Promise.allSettled(upstreamRequests);
    if (upstream.some((result) => result.status === "rejected")) {
      const failedAgents = upstream
        .map((result, index) => ({ result, agent: (["PolicyLock", "BidNormalizer", "SupplierRisk"] as const)[index] }))
        .filter((item): item is { result: PromiseRejectedResult; agent: "PolicyLock" | "BidNormalizer" | "SupplierRisk" } => item.result.status === "rejected");
      const message = failedAgents.map((item) => `${item.agent}: ${normalizeCrooError(item.result.reason)}`).join(" ");
      const current = runs.get(run.runId) ?? run;
      const failed = OrchestrationRunSchema.parse({
        ...current,
        status: "failed",
        agents: current.agents.map((agent) => markAgentAfterUpstreamFailure(agent, failedAgents.map((item) => item.agent), message))
      });
      runs.set(run.runId, failed);
      return failed;
    }

    const policyLock = getFulfilledValue(upstream[0]);
    const bidNormalizer = getFulfilledValue(upstream[1]);
    const supplierRisk = getFulfilledValue(upstream[2]);

    const awardVerifier = await requestSpecialistAgent({
      agent: "AwardVerifier",
      serviceId: serviceIds.AwardVerifier,
      requirements: {
        tenderRef: input.tenderId,
        awardInput: { tenderPacket: input, policyLock, bidNormalizer, supplierRisk }
      },
      onStatus: update
    });

    const receiptWriter = await requestSpecialistAgent({
      agent: "ReceiptWriter",
      serviceId: serviceIds.ReceiptWriter,
      requirements: {
        tenderRef: input.tenderId,
        receiptInput: { tenderPacket: input, policyLock, bidNormalizer, supplierRisk, awardVerifier }
      },
      onStatus: update
    });

    const completed = OrchestrationRunSchema.parse({
      ...runs.get(run.runId),
      status: "completed",
      outputs: { policyLock, bidNormalizer, supplierRisk, awardVerifier, receiptWriter }
    });
    runs.set(run.runId, completed);
    return completed;
  } catch (error) {
    const current = runs.get(run.runId) ?? run;
    const safeError = normalizeCrooError(error);
    const failed = OrchestrationRunSchema.parse({
      ...current,
      status: "failed",
      agents: current.agents.map((agent) => markAgentAfterFailure(agent, safeError))
    });
    runs.set(run.runId, failed);
    return failed;
  }
}

export const orchestrateCase = orchestrateTender;

export async function recoverPolicyLockOrderRun(input: TenderPacketInput, orderId: string): Promise<OrchestrationRun> {
  const recovered = await recoverLivePolicyLockOrder(orderId);
  const run = await createRecoveredPolicyLockRun(input, recovered);
  runs.set(run.runId, run);
  return run;
}

function markAgentAfterFailure(agent: AgentRun, error: string): AgentRun {
  if (agent.status === "delivered" || agent.status === "failed") return agent;
  if (agent.name === "PolicyLock") return { ...agent, status: "failed", error };
  if (agent.name === "BidNormalizer") return { ...agent, status: "failed", error };
  if (agent.name === "SupplierRisk") return { ...agent, status: "failed", error };
  if (agent.name === "AwardVerifier") return { ...agent, status: "blocked", error: "Blocked by PolicyLock." };
  if (agent.name === "ReceiptWriter") return { ...agent, status: "blocked", error: "Blocked by AwardVerifier." };
  return agent.status === "waiting" ? { ...agent, status: "not_run" } : agent;
}

function markAgentAfterUpstreamFailure(agent: AgentRun, failedAgents: AgentName[], error: string): AgentRun {
  if (agent.status === "delivered" || agent.status === "failed") return agent;
  if (failedAgents.includes(agent.name)) return { ...agent, status: "failed", error };
  if (agent.name === "AwardVerifier") return { ...agent, status: "blocked", error: "Blocked by upstream specialist failure." };
  if (agent.name === "ReceiptWriter") return { ...agent, status: "blocked", error: "Blocked by AwardVerifier." };
  return agent.status === "waiting" ? { ...agent, status: "not_run" } : agent;
}

function getFulfilledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "fulfilled") return result.value;
  throw result.reason;
}
