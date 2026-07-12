import { DeterministicSupplierRiskAdapter, runSupplierRisk } from "../../lib/agents/supplier-risk";
import { SupplierRiskOutputSchema, TenderPacketInputSchema, type TenderPacketInput } from "../../lib/schemas/ofora";
import { runProviderLoop } from "./shared";

function parseTender(requirements: Record<string, unknown>): TenderPacketInput {
  if (requirements.tenderRef === undefined) throw new Error("Missing tenderRef.");
  if (requirements.lockedRequirements === undefined) throw new Error("Missing lockedRequirements.");
  if (requirements.supplierScreening === undefined) throw new Error("Missing supplierScreening.");
  return TenderPacketInputSchema.parse(requirements.tenderPacket);
}

void runProviderLoop(
  "SupplierRisk",
  "SUPPLIER_RISK_SDK_KEY",
  async (requirements) =>
    JSON.stringify(SupplierRiskOutputSchema.parse(await runSupplierRisk(parseTender(requirements), new DeterministicSupplierRiskAdapter()))),
  "SUPPLIER_RISK_SERVICE_ID",
  (requirements) => {
    parseTender(requirements);
  }
);
