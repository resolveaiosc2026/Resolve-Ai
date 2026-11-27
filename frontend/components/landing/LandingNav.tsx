"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SIGN_IN_HREF, WORKBENCH_HREF } from "./links";

const LINKS = [
  { href: "/#case", label: "How it works" },
  { href: "/#rules", label: "Ground rules" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="lp-nav" data-open={open}>
      <div className="lp-container lp-nav-inner">
        <Link href="/" className="lp-logo" aria-label="Resolve AI home">
          <Image className="lp-logo-mark" src="/logo.png" alt="" width={42} height={42} priority />
        </Link>

        <nav className="lp-nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav-cta">
          <Link href={SIGN_IN_HREF} className="lp-btn" data-variant="ghost">
            Sign in
          </Link>
          <Link href={WORKBENCH_HREF} className="lp-btn" data-variant="primary">
            Open the workbench
          </Link>
        </div>

        <button
          type="button"
          className="lp-menu-btn"
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>

      <div id="lp-mobile-menu" className="lp-mobile-menu" hidden={!open}>
        <nav className="lp-container" aria-label="Mobile">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className="lp-mobile-cta">
            <Link href={SIGN_IN_HREF} className="lp-btn" data-variant="ghost">
              Sign in
            </Link>
            <Link href={WORKBENCH_HREF} className="lp-btn" data-variant="primary">
              Open the workbench
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
