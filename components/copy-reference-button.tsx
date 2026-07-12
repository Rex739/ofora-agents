"use client";

import { Copy } from "lucide-react";

export function CopyReferenceButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      aria-label="Copy reference"
      title="Copy reference"
      onClick={() => navigator.clipboard.writeText(value)}
      className="no-print shrink-0 rounded p-1 text-ofora-muted transition hover:bg-ofora-mist hover:text-ofora-green"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}
