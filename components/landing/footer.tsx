import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";

const productLinks = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Agents", href: "#agents" },
  { label: "Safety", href: "#safety" }
] as const;

const resourceLinks = [
  { label: "Open demo tender", href: "/workspace" }
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-ofora-deep/15 bg-ofora-deep text-white" aria-labelledby="landing-footer-heading">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.7fr)] lg:gap-16">
          <div className="max-w-xl">
            <Link href="/" aria-label="Ofora Agents home" className="inline-flex text-2xl">
              <Wordmark className="text-white" />
            </Link>
            <h2 id="landing-footer-heading" className="mt-6 text-3xl font-black leading-[0.95] tracking-[-0.055em] text-white sm:text-4xl">
              Paid specialist agents for confidential procurement award validation.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-white/72 sm:text-base sm:leading-7">
              Coordinate policy validation, supplier normalization, risk screening, and verifiable receipt generation through CROO CAP.
            </p>
          </div>

          <nav className="grid gap-8 sm:grid-cols-2" aria-label="Landing footer navigation">
            <FooterLinkGroup title="Product" links={productLinks} />
            <FooterLinkGroup title="Resources" links={resourceLinks} />
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/12 pt-6 text-sm text-white/68 sm:mt-14 md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-white/80">© 2026 Ofora Agents.</p>
          <div className="flex flex-col gap-2 md:items-end">
            <p>Built with CROO CAP on Base.</p>
            <p className="text-white/62">Synthetic tender demo. No confidential supplier proposals stored.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLinkGroup({ title, links }: { title: string; links: readonly { label: string; href: string; external?: boolean }[] }) {
  return (
    <div>
      <h3 className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-ofora-lime">{title}</h3>
      <ul className="mt-5 grid gap-3">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLink href={link.href} external={link.external}>
              {link.label}
            </FooterLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterLink({ href, external = false, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const className = cn(
    "ofora-focus inline-flex rounded-sm text-sm font-semibold leading-6 text-white/74 underline decoration-transparent underline-offset-4 transition duration-200 hover:text-white hover:decoration-ofora-lime"
  );

  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
