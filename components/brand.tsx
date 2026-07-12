export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-black tracking-[-0.04em] text-ofora-deep ${className}`}>
      <span>Ofora</span>
      <span className="rounded-full border border-ofora-deep/10 bg-ofora-lime px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-ofora-deep">
        Agents
      </span>
    </span>
  );
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? "text-xs text-ofora-muted" : "text-sm text-ofora-muted"}>
      For procurement review only. Does not expose confidential supplier bids, replace procurement officers, guarantee legal compliance, or publish raw commercial proposals.
    </p>
  );
}
