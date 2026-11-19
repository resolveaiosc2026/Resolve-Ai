import type { Metadata } from "next";
import { LandingNav } from "../../components/landing/LandingNav";
import { SiteFooter } from "../../components/landing/SiteFooter";
import "./landing.css";

const title = "Resolve AI: retention workbench for data bundles";
const description =
  "Resolve AI spots customers whose bundle use is dropping, works out why, suggests an offer and checks whether it helped. A person approves every offer. Orange Summer Challenge 2026 entry, synthetic data only.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <LandingNav />
      {children}
      <SiteFooter />
    </div>
  );
}
