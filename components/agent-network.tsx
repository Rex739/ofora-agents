"use client";

import { Check, Copy, Loader2, ReceiptText } from "lucide-react";
import { AGENT_PRICES, ORCHESTRATION_MARGIN, SPECIALIST_SPEND, USER_PRICE } from "@/lib/constants";
import type { AgentRun } from "@/lib/schemas/ofora";
import { cn, formatElapsed, shortId } from "@/lib/utils";

const order = ["PolicyLock", "BidNormalizer", "SupplierRisk", "AwardVerifier", "ReceiptWriter"] as const;

export function DependencyGraph() {
  return (
    <div className="font-mono text-sm leading-7 text-ofora-muted">
      <div className="font-semibold text-ofora-ink">Ofora Coordinator</div>
      <div>|- PolicyLock - {AGENT_PRICES.PolicyLock}</div>
      <div>|- BidNormalizer - {AGENT_PRICES.BidNormalizer}</div>
      <div>|- SupplierRisk - {AGENT_PRICES.SupplierRisk}</div>
      <div>|- AwardVerifier - {AGENT_PRICES.AwardVerifier}</div>
      <div>`- ReceiptWriter - {AGENT_PRICES.ReceiptWriter}</div>
    </div>
  );
}

export function Economics() {
  return (
    <div className="rounded-md border border-ofora-border bg-white p-4">
      <div className="mb-2 text-sm font-black text-ofora-ink">Economics</div>
      <div className="grid gap-2 text-sm text-ofora-muted sm:grid-cols-3">
        <div>Specialist spend: {SPECIALIST_SPEND}</div>
        <div>Coordinator price: {USER_PRICE}</div>
        <div>Coordinator margin: {ORCHESTRATION_MARGIN}</div>
      </div>
    </div>
  );
}

export function AgentCards({ agents }: { agents: AgentRun[] }) {
  const sorted = order.map((name) => agents.find((agent) => agent.name === name)).filter((agent): agent is AgentRun => Boolean(agent));
  return (
    <div className="grid gap-3">
      {sorted.map((agent) => (
        <div key={agent.name} className="rounded-md border border-ofora-border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-black text-ofora-ink">{agent.name}</div>
              <div className="text-xs text-ofora-muted">{agent.price}</div>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs capitalize",
                agent.status === "delivered"
                  ? "border-ofora-verify/25 bg-ofora-mist text-ofora-green"
                  : "border-ofora-border bg-ofora-soft text-ofora-muted"
              )}
            >
              {agent.status === "delivered" ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
              {agent.status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-xs text-ofora-muted sm:grid-cols-2">
            <ReceiptLine label="Order ID" value={agent.orderId} copy />
            <ReceiptLine label="Tx hash" value={agent.txHash} copy />
            <ReceiptLine label="Delivery hash" value={agent.resultHash} />
            <ReceiptLine label="Elapsed" value={formatElapsed(agent.elapsedMs)} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReceiptsPanel({ agents, demoMode }: { agents: AgentRun[]; demoMode: boolean }) {
  return (
    <div className="rounded-md border border-ofora-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-black text-ofora-ink">
        <ReceiptText className="h-4 w-4 text-ofora-green" />
        CAP receipt references
      </div>
      {demoMode ? (
        <p className="mb-3 text-xs text-amber-200">
          DEMO_MODE is enabled. Receipt values are generated for interface testing and are not Base transactions.
        </p>
      ) : null}
      <div className="space-y-2 text-xs text-ofora-muted">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center justify-between gap-3 border-t border-ofora-border pt-2 first:border-t-0 first:pt-0">
            <span>{agent.name}</span>
            <span className="font-mono">{shortId(agent.txHash)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceiptLine({ label, value, copy = false }: { label: string; value?: string; copy?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded border border-ofora-border bg-ofora-soft px-2 py-1.5">
      <span>{label}</span>
      <span className="flex min-w-0 items-center gap-1 font-mono text-ofora-ink">
        <span className="truncate">{shortId(value)}</span>
        {copy && value ? (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            onClick={() => navigator.clipboard.writeText(value)}
            className="rounded p-1 text-ofora-muted hover:bg-ofora-mist hover:text-ofora-green"
          >
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
      </span>
    </div>
  );
}
