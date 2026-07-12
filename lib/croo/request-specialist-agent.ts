import "server-only";
import { randomUUID } from "node:crypto";
import { SAFETY_DISCLAIMER } from "@/lib/constants";
import { runAwardVerifier, runReceiptWriter, type AwardVerifierInput, type ReceiptWriterInput } from "@/lib/agents/award-verifier";
import { runBidNormalizer } from "@/lib/agents/bid-normalizer";
import { runPolicyLock } from "@/lib/agents/policy-lock";
import { runSupplierRisk } from "@/lib/agents/supplier-risk";
import { getCrooRuntimeStatus } from "@/lib/croo/config";
import { mapLiveAgentUpdateToAgentRun as mapBidNormalizerUpdateToAgentRun, requestLiveBidNormalizer } from "@/lib/croo/request-bid-normalizer";
import { mapPolicyLockUpdateToAgentRun, requestLivePolicyLock } from "@/lib/croo/request-policy-lock";
import { mapLiveAgentUpdateToAgentRun as mapSupplierRiskUpdateToAgentRun, requestLiveSupplierRisk } from "@/lib/croo/request-supplier-risk";
import {
  type AgentName,
  type AwardVerifierOutput,
  type BidNormalizerOutput,
  type PolicyLockOutput,
  type ReceiptWriterOutput,
  type SupplierRiskOutput,
  type TenderPacketInput
} from "@/lib/schemas/ofora";

export type SpecialistResultMap = {
  PolicyLock: PolicyLockOutput;
  BidNormalizer: BidNormalizerOutput;
  SupplierRisk: SupplierRiskOutput;
  AwardVerifier: AwardVerifierOutput;
  ReceiptWriter: ReceiptWriterOutput;
};

export type SpecialistStatus =
  | "connecting"
  | "negotiating"
  | "order_created"
  | "payment_pending"
  | "paid"
  | "awaiting_delivery"
  | "confirming_delivery"
  | "processing"
  | "delivered"
  | "failed";

export type SpecialistStatusEvent = {
  agent: AgentName;
  status: SpecialistStatus;
  orderId?: string;
  txHash?: string;
  resultHash?: string;
  providerDeliveryTxHash?: string;
  elapsedMs?: number;
  error?: string;
};

type SpecialistRequest<TAgent extends AgentName> = {
  agent: TAgent;
  serviceId: string;
  requirements: Record<string, unknown>;
  onStatus?: (event: SpecialistStatusEvent) => void;
};

export async function requestSpecialistAgent<TAgent extends AgentName>(
  request: SpecialistRequest<TAgent>
): Promise<SpecialistResultMap[TAgent]> {
  const started = Date.now();
  const emit = (event: Omit<SpecialistStatusEvent, "agent">) =>
    request.onStatus?.({ agent: request.agent, ...event, elapsedMs: Date.now() - started });

  if (process.env.DEMO_MODE !== "false") {
    return runDemoSpecialist(request, emit);
  }

  const runtime = getCrooRuntimeStatus();
  if (request.agent === "PolicyLock" && runtime.policyLockLiveEnabled) {
    try {
      const live = await requestLivePolicyLock(request.requirements.tenderPacket as TenderPacketInput, (update) => {
        emitMappedLiveUpdate(mapPolicyLockUpdateToAgentRun(update), emit);
      });
      return live.output as SpecialistResultMap[TAgent];
    } catch (error) {
      if (!runtime.allowLiveFallback) throw error;
      emit({ status: "failed", error: error instanceof Error ? error.message : "PolicyLock live CAP failed." });
      return runDemoSpecialist(request, emit);
    }
  }

  if (request.agent === "BidNormalizer" && runtime.bidNormalizerLiveEnabled) {
    try {
      const live = await requestLiveBidNormalizer(request.requirements.tenderPacket as TenderPacketInput, (update) => {
        emitMappedLiveUpdate(mapBidNormalizerUpdateToAgentRun(update), emit);
      });
      return live.output as SpecialistResultMap[TAgent];
    } catch (error) {
      if (!runtime.allowLiveFallback) throw error;
      emit({ status: "failed", error: error instanceof Error ? error.message : "BidNormalizer live CAP failed." });
      return runDemoSpecialist(request, emit);
    }
  }

  if (request.agent === "SupplierRisk" && runtime.supplierRiskLiveEnabled) {
    try {
      const live = await requestLiveSupplierRisk(request.requirements.tenderPacket as TenderPacketInput, (update) => {
        emitMappedLiveUpdate(mapSupplierRiskUpdateToAgentRun(update), emit);
      });
      return live.output as SpecialistResultMap[TAgent];
    } catch (error) {
      if (!runtime.allowLiveFallback) throw error;
      emit({ status: "failed", error: error instanceof Error ? error.message : "SupplierRisk live CAP failed." });
      return runDemoSpecialist(request, emit);
    }
  }

  return runDemoSpecialist(request, emit);
}

function emitMappedLiveUpdate(
  mapped: Partial<{
    status: string;
    orderId?: string;
    txHash?: string;
    resultHash?: string;
    providerDeliveryTxHash?: string;
    elapsedMs?: number;
    error?: string;
  }>,
  emit: (event: Omit<SpecialistStatusEvent, "agent">) => void
) {
  const status = mapped.status && isSpecialistStatus(mapped.status) ? mapped.status : "failed";
  emit({
    status,
    orderId: mapped.orderId,
    txHash: mapped.txHash,
    resultHash: mapped.resultHash,
    providerDeliveryTxHash: mapped.providerDeliveryTxHash,
    elapsedMs: mapped.elapsedMs,
    error: mapped.error
  });
}

async function runDemoSpecialist<TAgent extends AgentName>(
  request: SpecialistRequest<TAgent>,
  emit: (event: Omit<SpecialistStatusEvent, "agent">) => void
): Promise<SpecialistResultMap[TAgent]> {
  const orderId = receiptId("demo_order");
  const txHash = receiptId("demo_receipt");
  emit({ status: "negotiating" });
  await delay(280);
  emit({ status: "payment_pending", orderId });
  await delay(260);
  emit({ status: "paid", orderId, txHash });
  await delay(340);
  emit({ status: "processing", orderId, txHash });
  const result = await generateDemoOutput(request.agent, request.requirements);
  await delay(360);
  emit({ status: "delivered", orderId, txHash, resultHash: receiptId("demo_delivery") });
  return result as SpecialistResultMap[TAgent];
}

async function generateDemoOutput(agent: AgentName, requirements: Record<string, unknown>) {
  if (agent === "PolicyLock") return runPolicyLock(requirements.tenderPacket as TenderPacketInput);
  if (agent === "BidNormalizer") return runBidNormalizer(requirements.tenderPacket as TenderPacketInput);
  if (agent === "SupplierRisk") return runSupplierRisk(requirements.tenderPacket as TenderPacketInput);
  if (agent === "AwardVerifier") return runAwardVerifier(requirements.awardInput as AwardVerifierInput);
  if (agent === "ReceiptWriter") return runReceiptWriter(requirements.receiptInput as ReceiptWriterInput);
  return {
    agent,
    disclaimer: SAFETY_DISCLAIMER
  };
}

function receiptId(prefix: string) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSpecialistStatus(status: string): status is SpecialistStatus {
  return !["waiting", "not_run", "blocked"].includes(status);
}
