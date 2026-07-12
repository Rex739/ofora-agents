import { DeterministicBidAdapter, runBidNormalizer } from "../../lib/agents/bid-normalizer";
import { BidNormalizerOutputSchema, TenderPacketInputSchema, type TenderPacketInput } from "../../lib/schemas/ofora";
import { runProviderLoop } from "./shared";

function parseTender(requirements: Record<string, unknown>): TenderPacketInput {
  if (requirements.tenderRef === undefined) throw new Error("Missing tenderRef.");
  if (requirements.managedValueUsd === undefined) throw new Error("Missing managedValueUsd.");
  if (requirements.lockedPolicy === undefined) throw new Error("Missing lockedPolicy.");
  return TenderPacketInputSchema.parse(requirements.tenderPacket);
}

void runProviderLoop(
  "BidNormalizer",
  "BID_NORMALIZER_SDK_KEY",
  async (requirements) =>
    JSON.stringify(BidNormalizerOutputSchema.parse(await runBidNormalizer(parseTender(requirements), new DeterministicBidAdapter()))),
  "BID_NORMALIZER_SERVICE_ID",
  (requirements) => {
    parseTender(requirements);
  }
);
