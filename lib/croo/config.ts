import "server-only";
import { CrooConfigError } from "@/lib/croo/errors";
import { resolveLiveSpecialists } from "@/lib/croo/live-specialists";
import type { CrooRuntimeStatus } from "@/lib/croo/types";

export type CrooClientConfig = {
  baseURL: string;
  wsURL: string;
  rpcURL?: string;
  logger?: {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
  };
};

export function getCrooRuntimeStatus(): CrooRuntimeStatus {
  const liveSpecialists = new Set(resolveLiveSpecialists(process.env.LIVE_SPECIALISTS));
  const demoMode = process.env.DEMO_MODE !== "false";
  logLiveSpecialistDiagnostics(demoMode, liveSpecialists);
  return {
    demoMode,
    allowLiveFallback: process.env.ALLOW_LIVE_FALLBACK === "true",
    liveSpecialists,
    policyLockLiveEnabled: !demoMode && liveSpecialists.has("policy"),
    bidNormalizerLiveEnabled: !demoMode && liveSpecialists.has("bids"),
    supplierRiskLiveEnabled: !demoMode && liveSpecialists.has("risk"),
    awardVerifierLiveEnabled: !demoMode && liveSpecialists.has("award"),
    receiptWriterLiveEnabled: !demoMode && liveSpecialists.has("receipt"),
    crooApiConfigured: Boolean(process.env.CROO_API_URL && process.env.CROO_WS_URL),
    coordinatorKeyConfigured: Boolean(process.env.CROO_COORDINATOR_SDK_KEY),
    policyKeyConfigured: Boolean(process.env.POLICY_LOCK_SDK_KEY),
    policyServiceConfigured: Boolean(process.env.POLICY_LOCK_SERVICE_ID),
    bidNormalizerKeyConfigured: Boolean(process.env.BID_NORMALIZER_SDK_KEY),
    bidNormalizerServiceConfigured: Boolean(process.env.BID_NORMALIZER_SERVICE_ID),
    supplierRiskKeyConfigured: Boolean(process.env.SUPPLIER_RISK_SDK_KEY),
    supplierRiskServiceConfigured: Boolean(process.env.SUPPLIER_RISK_SERVICE_ID)
  };
}

export function getRequesterConfig(): CrooClientConfig {
  requireEnv("CROO_API_URL");
  requireEnv("CROO_WS_URL");
  return {
    baseURL: process.env.CROO_API_URL ?? "",
    wsURL: process.env.CROO_WS_URL ?? "",
    rpcURL: process.env.BASE_RPC_URL
  };
}

export function getProviderConfig(): CrooClientConfig {
  return getRequesterConfig();
}

export function getCoordinatorSdkKey() {
  return requireEnv("CROO_COORDINATOR_SDK_KEY");
}

export function getPolicyLockSdkKey() {
  return requireEnv("POLICY_LOCK_SDK_KEY");
}

export function getPolicyLockServiceId() {
  return requireEnv("POLICY_LOCK_SERVICE_ID");
}

export function getBidNormalizerServiceId() {
  return requireEnv("BID_NORMALIZER_SERVICE_ID");
}

export function getSupplierRiskServiceId() {
  return requireEnv("SUPPLIER_RISK_SERVICE_ID");
}

export function getCapOrderTimeoutMs() {
  const value = Number(process.env.CAP_ORDER_TIMEOUT_MS ?? "120000");
  return Number.isFinite(value) && value > 0 ? value : 120000;
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new CrooConfigError(`Missing required CROO environment variable: ${key}`);
  return value;
}

function logLiveSpecialistDiagnostics(demoMode: boolean, liveSpecialists: Set<string>) {
  if (demoMode || process.env.OFORA_DIAGNOSTICS_LOGGED === "true") return;
  process.env.OFORA_DIAGNOSTICS_LOGGED = "true";
  const live = [
    liveSpecialists.has("policy") ? "PolicyLock" : undefined,
    liveSpecialists.has("bids") ? "BidNormalizer" : undefined,
    liveSpecialists.has("risk") ? "SupplierRisk" : undefined,
    liveSpecialists.has("award") ? "AwardVerifier" : undefined,
    liveSpecialists.has("receipt") ? "ReceiptWriter" : undefined
  ].filter(Boolean);
  const fallback = ["PolicyLock", "BidNormalizer", "SupplierRisk", "AwardVerifier", "ReceiptWriter"].filter((agent) => !live.includes(agent));
  console.info(`Live specialists: ${live.length > 0 ? live.join(", ") : "none"}`);
  console.info(`Simulated fallback: ${fallback.join(", ")}`);
}
