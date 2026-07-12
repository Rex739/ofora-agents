import { demoTender } from "../../lib/demo/case";
import { DeterministicSupplierRiskAdapter, runSupplierRisk } from "../../lib/agents/supplier-risk";
import { TenderPacketInputSchema, type TenderPacketInput } from "../../lib/schemas/ofora";
import { runProviderLoop } from "./shared";

function parseTender(requirements: Record<string, unknown>): TenderPacketInput {
  return TenderPacketInputSchema.parse(requirements.tenderPacket ?? demoTender);
}

void runProviderLoop("SupplierRisk", "SUPPLIER_RISK_SDK_KEY", async (requirements) =>
  JSON.stringify(await runSupplierRisk(parseTender(requirements), new DeterministicSupplierRiskAdapter()))
);
