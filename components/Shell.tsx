"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { datasets } from "../lib/datasets";

export const STAGES = [
  { n: 1, key: "detect", label: "Detect", href: "/detect" },
  { n: 2, key: "understand", label: "Understand", href: "/understand" },
  { n: 3, key: "recommend", label: "Recommend", href: "/recommend" },
  { n: 4, key: "act", label: "Act", href: "/act" },
  { n: 5, key: "measure", label: "Measure", href: "/measure" },
  { n: 6, key: "report", label: "Report", href: "/report" },
] as const;

type NavItem = { key: string; label: string; href: string };

const NAV: { group: string; items: readonly NavItem[] }[] = [
  { group: "Workbench", items: STAGES.slice(0, 4) },
  { group: "Evidence", items: STAGES.slice(4) },
  { group: "Ask", items: [{ key: "copilot", label: "Copilot", href: "/copilot" }] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeIndex = STAGES.findIndex((s) => pathname.startsWith(s.href));
  const run = datasets.run;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>
            <span className="brand-name">Resolve AI</span>
            <span className="brand-sub">Retention workbench</span>
          </span>
        </div>
        <nav className="nav" aria-label="Workbench">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="nav-group">{section.group}</div>
              {section.items.map((s) => (
                <Link
                  key={s.key}
                  href={s.href}
                  className="nav-item"
                  data-active={pathname.startsWith(s.href)}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          Synthetic data — pilot demo.
          <br />
          No real subscriber records.
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left num">
            Detection run {run.run_id} · {run.subscribers_scored.toLocaleString()} subscribers
            scored · {run.pilot_sample_size} cases in review
          </div>
          <div className="topbar-right">
            <span className="tag-synthetic">Synthetic data — pilot demo</span>
            <span className="avatar" title="analyst.hui">
              AH
            </span>
          </div>
        </header>

        <nav className="loop" aria-label="Resolve AI loop">
          {STAGES.map((s, i) => (
            <Link
              key={s.key}
              href={s.href}
              className="loop-step"
              data-state={activeIndex < 0 ? "upcoming" : i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming"}
              aria-current={i === activeIndex ? "step" : undefined}
            >
              {i < activeIndex ? "✓" : s.n} {s.label}
            </Link>
          ))}
        </nav>

        <div className="page">{children}</div>
      </div>
    </div>
  );
}

export function PageHead({
  stage,
  title,
  sub,
  actions,
}: {
  stage: string;
  title: string;
  sub: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{stage}</div>
        <h1 className="h-lg">{title}</h1>
        <p>{sub}</p>
      </div>
      {actions ? <div className="btn-row">{actions}</div> : null}
    </div>
  );
}
