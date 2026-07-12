import { OforaBrand } from "@/components/brand/ofora-brand";

export function Wordmark({ className = "" }: { className?: string }) {
  return <OforaBrand className={className} />;
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? "text-xs text-ofora-muted" : "text-sm text-ofora-muted"}>
      For procurement review only. Does not expose confidential supplier bids, replace procurement officers, guarantee legal compliance, or publish raw commercial proposals.
    </p>
  );
}
