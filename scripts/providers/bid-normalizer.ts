import { demoTender } from "../../lib/demo/case";
import { DeterministicBidAdapter, runBidNormalizer } from "../../lib/agents/bid-normalizer";
import { TenderPacketInputSchema, type TenderPacketInput } from "../../lib/schemas/ofora";
import { runProviderLoop } from "./shared";

function parseTender(requirements: Record<string, unknown>): TenderPacketInput {
  return TenderPacketInputSchema.parse(requirements.tenderPacket ?? demoTender);
}

void runProviderLoop("BidNormalizer", "BID_NORMALIZER_SDK_KEY", async (requirements) =>
  JSON.stringify(await runBidNormalizer(parseTender(requirements), new DeterministicBidAdapter()))
);
