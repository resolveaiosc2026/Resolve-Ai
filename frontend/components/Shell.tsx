"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ApiBanner } from "./ApiStatus";
import { SkLine } from "./Skeleton";
import { useWorkbench } from "./Workbench";
import { signOutAction } from "../lib/auth-actions";
import { API_BASE_URL } from "../lib/api/client";
import { getDetectSummary } from "../lib/api/endpoints";
import { useApi } from "../lib/api/useApi";

export const STAGES = [
  { n: 1, key: "detect", label: "Detect", href: "/detect" },
  { n: 2, key: "understand", label: "Understand", href: "/understand" },
  { n: 3, key: "recommend", label: "Recommend", href: "/recommend" },
  { n: 4, key: "act", label: "Act", href: "/act" },
  { n: 5, key: "measure", label: "Measure", href: "/measure" },
  { n: 6, key: "report", label: "Report", href: "/report" },
] as const;

type NavItem = { key: string; label: string; href: string };

/** The signed-in demo user (F15). Approvals are still recorded as the shared demo reviewer. */
export interface ShellUser {
  name: string | null;
  email: string | null;
}

function initials(user: ShellUser): string {
  const source = user.name?.trim() || user.email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}

const NAV: { group: string; items: readonly NavItem[] }[] = [
  { group: "Workbench", items: STAGES.slice(0, 4) },
  { group: "Evidence", items: STAGES.slice(4) },
  { group: "Ask", items: [{ key: "copilot", label: "Copilot", href: "/copilot" }] },
];

export function AppShell({ children, user }: { children: ReactNode; user: ShellUser }) {
  const pathname = usePathname();
  const activeIndex = STAGES.findIndex((s) => pathname.startsWith(s.href));
  const { simulationOn, health } = useWorkbench();
  const summary = useApi(getDetectSummary, "summary").data;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Image className="brand-mark" src="/logo.png" alt="" width={40} height={40} priority />
          <span>
            <span className="brand-name">Resolve AI</span>
            <span className="brand-sub">RETENTION WORKBENCH</span>
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
            {summary
              ? `Detection run ${summary.runId} · ${summary.subscribersScored.toLocaleString()} subscribers scored · ${summary.pilotSample} cases in review`
              : <SkLine width={340} height={12} />}
          </div>
          <div className="topbar-right">
            {health?.reachable ? (
              <span className="tag-synthetic" title="Data is read from and written to the Resolve AI API">
                Live API{simulationOn ? " · simulation on" : ""}
              </span>
            ) : null}
            <span className="tag-synthetic">Synthetic data — pilot demo</span>
            <span className="avatar" title={user.name ?? user.email ?? "Signed in"}>
              {initials(user)}
            </span>
            <form action={signOutAction}>
              <button type="submit" className="btn" data-variant="ghost">
                Sign out
              </button>
            </form>
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

        <div className="page">
          <ApiBanner />
          {children}
        </div>

        <footer className="app-footer">
          <span>Resolve AI · Orange Summer Challenge 2026 entry · Synthetic data, no real subscriber records</span>
          <nav aria-label="Footer">
            <Link href="/">Home</Link>
            <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noopener noreferrer">
              API reference
            </a>
          </nav>
        </footer>
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
