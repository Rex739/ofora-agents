import { NextResponse } from "next/server";
import { recoverPolicyLockOrderRun } from "@/lib/agents/orchestrator";
import { demoTender } from "@/lib/demo/case";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { orderId?: string };
    if (!payload.orderId) {
      return NextResponse.json({ error: "A PolicyLock order ID is required for recovery." }, { status: 400 });
    }
    const run = await recoverPolicyLockOrderRun(demoTender, payload.orderId);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PolicyLock recovery failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
