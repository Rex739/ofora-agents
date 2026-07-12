import { NextResponse } from "next/server";
import { orchestrateTender } from "@/lib/agents/orchestrator";
import { SYNTHETIC_CASE_NOTICE } from "@/lib/constants";
import { TenderPacketInputSchema } from "@/lib/schemas/ofora";
import { isDemoMode } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const tenderPacket = TenderPacketInputSchema.parse(payload);
    const run = await orchestrateTender(tenderPacket);
    return NextResponse.json({ mode: isDemoMode() ? "demo" : "live-cap", notice: SYNTHETIC_CASE_NOTICE, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to orchestrate the demo tender.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
