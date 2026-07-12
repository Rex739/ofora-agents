import { getRun } from "@/lib/agents/orchestrator";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const interval = setInterval(() => {
        if (!runId) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Missing runId" })}\n\n`));
          clearInterval(interval);
          controller.close();
          return;
        }
        const run = getRun(runId);
        controller.enqueue(encoder.encode(`event: run\ndata: ${JSON.stringify(run ?? null)}\n\n`));
        if (run?.status === "completed" || run?.status === "failed") {
          clearInterval(interval);
          controller.close();
        }
      }, 800);
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
