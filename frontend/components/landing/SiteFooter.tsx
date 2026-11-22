import Link from "next/link";
import { SIGN_IN_HREF, WORKBENCH_HREF } from "./links";

const LOOP = [
  { label: "Detect", href: "/detect" },
  { label: "Understand", href: "/understand" },
  { label: "Recommend", href: "/recommend" },
  { label: "Act", href: "/act" },
  { label: "Measure", href: "/measure" },
  { label: "Report", href: "/report" },
] as const;

/** Footer shared by the public pages (landing and sign-in). */
export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div className="lp-footer-about">
            <Link href="/" className="lp-footer-brand" aria-label="Resolve AI home">
              <span className="lp-logo-mark" aria-hidden="true">
                R
              </span>
            </Link>
            <p>
              A retention workbench for data bundles. It finds customers whose use is dropping, works out why,
              suggests an offer and checks whether it helped. A person approves every offer.
            </p>
          </div>

          <nav className="lp-footer-col" aria-label="Product">
            <h2>Product</h2>
            <ul>
              <li>
                <a href="/#case">How it works</a>
              </li>
              <li>
                <a href="/#rules">Ground rules</a>
              </li>
              <li>
                <Link href={WORKBENCH_HREF}>Open the workbench</Link>
              </li>
              <li>
                <Link href={SIGN_IN_HREF}>Sign in</Link>
              </li>
            </ul>
          </nav>

          <nav className="lp-footer-col" aria-label="The loop">
            <h2>The loop</h2>
            <ol>
              {LOOP.map((s, i) => (
                <li key={s.href}>
                  <Link href={s.href}>
                    <span className="lp-footer-n">{String(i + 1).padStart(2, "0")}</span>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

        </div>

        <div className="lp-footer-base">
          <p>Orange Summer Challenge 2026 entry. Not an Orange product or service.</p>
          <p>Synthetic data only. No real subscriber records are used.</p>
          <p>© 2026 Resolve AI team</p>
        </div>
      </div>
    </footer>
  );
}
