import Image from "next/image";
import { cn } from "@/lib/utils";

type OforaBrandProps = {
  className?: string;
  markClassName?: string;
  showAgents?: boolean;
  markOnly?: boolean;
};

export function OforaBrand({ className, markClassName, showAgents = true, markOnly = false }: OforaBrandProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 font-black tracking-[-0.04em] text-ofora-deep", className)}>
      <Image
        src="/brand/ofora-logo.png"
        alt="Ofora"
        width={36}
        height={36}
        priority
        className={cn("h-8 w-8 shrink-0 rounded-[10px] object-contain min-[380px]:h-9 min-[380px]:w-9", markClassName)}
      />
      {!markOnly ? (
        <>
          <span className="truncate text-current">Ofora</span>
          {showAgents ? (
            <span className="shrink-0 rounded-full border border-ofora-deep/10 bg-ofora-lime px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-ofora-deep">
              Agents
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

