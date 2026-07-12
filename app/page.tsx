import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { LandingFooter } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = ["Product", "How it works", "Agents", "Safety"];

const agents = [
  ["PolicyLock", "Validates locked award criteria."],
  ["BidNormalizer", "Structures supplier submissions."],
  ["SupplierRisk", "Flags missing documentation or risk signals."],
  ["AwardVerifier", "Checks selected supplier against locked policy."],
  ["ReceiptWriter", "Generates the Fair Award Receipt."]
] as const;

const safetyBoundaries = [
  "Does not expose confidential supplier bids",
  "Does not replace procurement officers",
  "Does not guarantee legal compliance",
  "Does not store supplier secrets in demo mode",
  "Does not publish raw commercial proposals"
];

export default function LandingPage() {
  return (
    <>
      <main className="min-h-screen bg-ofora-canvas text-ofora-ink">
        <header className="sticky top-0 z-30 border-b border-ofora-deep/10 bg-white/94 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-2xl"><Wordmark /></Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-ofora-muted lg:flex">
            {navItems.map((item) => <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} className="group relative transition hover:text-ofora-deep">{item}<span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-ofora-green transition-transform duration-200 group-hover:scale-x-100" /></a>)}
          </nav>
          <div className="flex items-center gap-2">
            <TrustBadge className="hidden sm:inline-flex">Synthetic tender only</TrustBadge>
            <Link href="/workspace"><Button size="sm" className="ofora-focus rounded-full px-4 font-black transition duration-200 hover:-translate-y-0.5">Open demo tender<ArrowUpRight className="h-4 w-4" /></Button></Link>
          </div>
        </div>
      </header>

      <section id="product" className="relative overflow-hidden bg-ofora-lime">
        <div className="pointer-events-none absolute right-[-18vw] top-24 hidden h-[48vw] max-h-[680px] w-[48vw] max-w-[680px] rotate-12 bg-ofora-deep lg:block" />
        <div className="pointer-events-none absolute right-[6vw] top-28 hidden h-56 w-56 rounded-full border border-ofora-green/25 lg:block" />
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 text-center sm:px-6 sm:pt-16 lg:px-8">
        <TrustBadge className="bg-ofora-lime/70">Procurement integrity operations</TrustBadge>
        <h1 className="mx-auto mt-6 max-w-6xl text-[clamp(4rem,14vw,8.5rem)] font-black leading-[0.82] tracking-[-0.075em] text-ofora-deep sm:tracking-[-0.085em] lg:text-[clamp(6.4rem,10vw,10rem)]">
          Ofora Agents
        </h1>
        <p className="mx-auto mt-5 max-w-5xl text-[clamp(2.1rem,6vw,5rem)] font-black leading-[0.9] tracking-[-0.065em] text-ofora-ink">
          Paid specialist agents for confidential award validation.
        </p>
        <p className="mx-auto mt-7 max-w-3xl text-base leading-7 text-ofora-ink/82 sm:text-lg sm:leading-8">
          Coordinate independent procurement agents to inspect locked evaluation rules, structure supplier submissions, flag award risks, and generate a Fair Award Receipt.
        </p>
        <div className="mx-auto mt-9 max-w-4xl rounded-full border border-ofora-deep/10 bg-white p-2 shadow-[0_24px_70px_rgba(6,53,36,0.16)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_86px_rgba(6,53,36,0.2)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-h-12 flex-1 items-center gap-3 rounded-full bg-ofora-soft px-4 text-left text-sm font-semibold text-ofora-ink">
              <Search className="h-4 w-4 shrink-0 text-ofora-green" />
              <span className="truncate font-mono">OFR-2026-041</span>
            </div>
            <Link href="/workspace" className="sm:shrink-0">
              <Button size="lg" className="ofora-focus w-full rounded-full px-6 font-black transition duration-200 hover:-translate-y-0.5 sm:w-auto">
                Validate award
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-ofora-muted">Synthetic demo only. No confidential supplier bids. Does not replace procurement officers or guarantee legal compliance.</p>
        <ProductPreview />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-3 px-4 py-6 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <ValueCard title="One tender packet" body="Start from locked criteria and synthetic submissions." />
        <ValueCard title="Five paid specialists" body="Coordinate focused procurement agents." />
        <ValueCard title="Fair Award Receipt" body="Show the selected supplier followed policy." />
        <ValueCard title="Audit boundaries" body="Built for review, not institutional replacement." />
      </section>

      <section id="agents" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <TrustBadge>Agent toolkit</TrustBadge>
          <h2 className="mt-5 text-[clamp(2.8rem,8vw,6.6rem)] font-black leading-[0.86] tracking-[-0.075em] text-ofora-deep">Paid AI agents for procurement award validation.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-ofora-muted">Ofora organizes confidential procurement integrity work into priced, composable agent capabilities.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {agents.map(([name, description]) => <article key={name} className="group flex min-h-[180px] flex-col rounded-lg border border-ofora-border bg-white p-5 shadow-[0_12px_36px_rgba(20,35,28,0.05)] transition duration-300 hover:-translate-y-1 hover:border-ofora-deep/15 hover:shadow-panel"><h3 className="text-base font-black tracking-[-0.02em] text-ofora-ink">{name}</h3><p className="mt-3 text-sm leading-6 text-ofora-muted">{description}</p></article>)}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="rounded-[10px] border border-ofora-deep/10 bg-ofora-mist p-5 shadow-panel transition duration-300 hover:-translate-y-0.5 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div><TrustBadge>How Ofora works</TrustBadge><h2 className="mt-5 text-5xl font-black leading-[0.86] tracking-[-0.075em] text-ofora-deep sm:text-6xl">Negotiate, settle, deliver.</h2><p className="mt-5 text-base leading-7 text-ofora-muted">The coordinator composes paid specialist validation into one Fair Award Receipt.</p></div>
            <div className="grid gap-3 md:grid-cols-3">
              <StepCard step="1" title="Submit synthetic tender packet" body="Use locked criteria, suppliers, and selected award details." />
              <StepCard step="2" title="Coordinator pays specialist agents" body="Negotiate -> Settle -> Deliver across five validation tasks." />
              <StepCard step="3" title="Receive Fair Award Receipt" body="Review policy lock, supplier risks, award findings, and audit trail." />
            </div>
          </div>
        </div>
      </section>

      <section id="safety" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-ofora-deep/10 bg-ofora-deep p-5 text-white shadow-[0_18px_50px_rgba(6,53,36,0.16)] sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-lg font-black tracking-[-0.02em]">Built for review, not replacement.</div><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Ofora supports award validation only. It does not expose confidential supplier bids, replace procurement officers, guarantee legal compliance, or publish raw commercial proposals.</p></div>
            <Link href="/workspace"><Button className="ofora-focus rounded-full bg-ofora-lime font-black text-ofora-deep transition duration-200 hover:-translate-y-0.5 hover:bg-white">Open demo tender<ArrowUpRight className="h-4 w-4" /></Button></Link>
          </div>
          <div className="grid gap-3 text-sm text-white/85 sm:grid-cols-2 lg:grid-cols-4">{safetyBoundaries.map((item) => <div key={item} className="flex min-h-[76px] items-start rounded-md border border-white/10 bg-white/[0.08] px-4 py-4 leading-6">{item}</div>)}</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="rounded-[10px] border border-ofora-border bg-white p-8 text-center shadow-panel transition duration-300 hover:-translate-y-0.5 sm:p-10">
          <TrustBadge>Demo workspace</TrustBadge>
          <h2 className="mt-5 text-[clamp(2.8rem,8vw,6.5rem)] font-black leading-[0.86] tracking-[-0.075em] text-ofora-deep">Run the synthetic tender.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-ofora-muted">For procurement review only. Does not expose confidential supplier bids, replace procurement officers, guarantee legal compliance, or publish raw commercial proposals.</p>
          <Link href="/workspace" className="mt-7 inline-flex"><Button size="lg" className="ofora-focus rounded-full px-6 font-black transition duration-200 hover:-translate-y-0.5">Open demo tender<ArrowUpRight className="h-4 w-4" /></Button></Link>
        </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}

function ProductPreview() {
  return (
    <section className="group relative mx-auto mt-12 overflow-hidden rounded-[1.35rem] border border-ofora-deep/10 bg-white p-4 text-left shadow-[0_30px_90px_rgba(6,53,36,0.2)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_rgba(6,53,36,0.24)] sm:p-6 lg:mt-14">
      <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(#063524_1px,transparent_1px),linear-gradient(90deg,#063524_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border-[18px] border-ofora-green/10 transition duration-500 group-hover:scale-105" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative"><p className="text-xs font-black uppercase tracking-[0.2em] text-ofora-green/80">Ofora award workspace</p><h2 className="mt-1 text-2xl font-black leading-[0.95] tracking-[-0.045em] text-ofora-deep sm:text-3xl">Emergency Solar Lantern Procurement</h2></div>
        <div className="flex flex-wrap gap-2"><TrustBadge>Demo ready</TrustBadge><TrustBadge>5 specialist agents</TrustBadge><TrustBadge>Simulated receipts</TrustBadge></div>
      </div>
      <div className="relative grid gap-4 lg:grid-cols-[0.95fr_1.1fr_0.95fr]">
        <PreviewPanel title="Tender packet" eyebrow="ofora-tender-demo-001"><MetricLine label="Buyer" value="Global Relief & Infrastructure Network" /><MetricLine label="Selected supplier" value="Nova Relief Systems" /><MetricLine label="Managed value" value="$10,000" /><MetricLine label="Status" value="Award pending validation" accent /></PreviewPanel>
        <PreviewPanel title="Paid specialist agents" eyebrow="parallel then receipt">{["PolicyLock", "BidNormalizer", "SupplierRisk", "AwardVerifier", "ReceiptWriter"].map((agent, index) => <div key={agent} className="flex items-center justify-between rounded-md border border-ofora-border bg-white px-3 py-2"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-ofora-mist text-xs font-black text-ofora-green">{index + 1}</span><span className="text-sm font-black text-ofora-ink">{agent}</span></div><span className="text-xs text-ofora-muted">{index < 3 ? "parallel" : "waits"}</span></div>)}</PreviewPanel>
        <PreviewPanel title="Fair Award Receipt" eyebrow="generated output"><BriefLine label="Policy" value="Locked evaluation criteria validated" /><BriefLine label="Award" value="Selected supplier checked against policy" /><BriefLine label="Audit trail" value="Receipt references and risk signals preserved" /><div className="relative overflow-hidden rounded-md border border-ofora-verify/20 bg-ofora-mist px-3 py-3 text-sm font-black text-ofora-deep"><span className="relative z-10">Selected supplier followed the locked evaluation policy</span><span className="absolute right-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full border-[8px] border-ofora-green/15" /></div></PreviewPanel>
      </div>
    </section>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return <article className="group flex min-h-[150px] flex-col rounded-lg border border-ofora-border bg-white p-5 text-left shadow-[0_12px_30px_rgba(20,35,28,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-ofora-deep/15 hover:shadow-panel"><h2 className="text-lg font-black leading-tight tracking-[-0.03em] text-ofora-ink">{title}</h2><p className="mt-3 text-sm leading-6 text-ofora-muted">{body}</p></article>;
}

function PreviewPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <article className="rounded-lg border border-ofora-border bg-ofora-soft/90 p-4 transition duration-300 hover:bg-white"><div className="mb-4"><div className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-ofora-muted">{eyebrow}</div><h3 className="mt-1 text-lg font-black tracking-[-0.025em] text-ofora-ink">{title}</h3></div><div className="grid gap-2">{children}</div></article>;
}

function MetricLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border border-ofora-border bg-white px-3 py-2 text-sm"><span className="text-ofora-muted">{label}</span><span className={cn("text-right font-bold", accent ? "text-ofora-green" : "text-ofora-ink")}>{value}</span></div>;
}

function BriefLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-ofora-border bg-white px-3 py-2"><div className="text-xs font-black uppercase tracking-[0.12em] text-ofora-muted">{label}</div><div className="mt-1 text-sm text-ofora-ink">{value}</div></div>;
}

function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return <article className="group rounded-lg border border-ofora-border bg-white p-5 shadow-[0_12px_36px_rgba(20,35,28,0.05)] transition duration-300 hover:-translate-y-0.5 hover:shadow-panel"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-ofora-lime text-sm font-black text-ofora-deep transition duration-300 group-hover:bg-ofora-deep group-hover:text-white">{step}</span><h3 className="mt-4 font-black tracking-[-0.02em] text-ofora-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-ofora-muted">{body}</p></article>;
}

function TrustBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex rounded-full border border-ofora-deep/10 bg-white/75 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.14em] text-ofora-green", className)}>{children}</span>;
}
