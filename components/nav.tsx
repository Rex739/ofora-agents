import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { StatusPill } from "@/components/status-pill";

export function TopNav({ label = "Award Validation Workspace" }: { label?: string }) {
  return (
    <nav className="no-print mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5">
      <Link href="/" className="text-xl">
        <Wordmark />
      </Link>
      <div className="hidden text-sm text-ofora-muted sm:block">{label}</div>
      <StatusPill>Synthetic tender only</StatusPill>
    </nav>
  );
}
