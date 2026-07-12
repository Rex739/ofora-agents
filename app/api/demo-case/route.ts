import { NextResponse } from "next/server";
import { demoTender, demoTenderLabel } from "@/lib/demo/case";

export async function GET() {
  return NextResponse.json({ label: demoTenderLabel, tenderPacket: demoTender });
}
