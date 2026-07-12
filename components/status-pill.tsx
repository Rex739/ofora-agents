import { cn } from "@/lib/utils";

export function StatusPill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-ofora-deep/10 bg-ofora-mist px-3 py-1 text-xs font-black text-ofora-green",
        className
      )}
    >
      {children}
    </span>
  );
}
