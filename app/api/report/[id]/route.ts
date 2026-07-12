import { NextResponse } from "next/server";
import { getRun } from "@/lib/agents/orchestrator";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Report not found in server memory." }, { status: 404 });
  return NextResponse.json({ run });
}
