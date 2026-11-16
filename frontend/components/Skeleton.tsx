import type { CSSProperties, ReactNode } from "react";

/**
 * Skeleton loaders. Each screen gets a placeholder built from the same layout
 * classes as the real screen (page-head, kpi-row, workspace, card, detail), so
 * it occupies the same space and collapses at the same breakpoints.
 */

export function SkLine({ width = "100%", height = 12, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return <span className="sk" style={{ width, height, ...style }} />;
}

export function SkBlock({ height, style }: { height: number; style?: CSSProperties }) {
  return <span className="sk" style={{ width: "100%", height, ...style }} />;
}

/** Wraps a screen skeleton: announced once to screen readers, bones hidden. */
export function SkScreen({ label = "Loading live data", children }: { label?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function SkPageHead({ action = true }: { action?: boolean }) {
  return (
    <div className="page-head">
      <div className="sk-stack" style={{ flex: 1, maxWidth: 620 }}>
        <SkLine width={110} height={10} />
        <SkLine width="55%" height={28} />
        <SkLine width="92%" />
        <SkLine width="70%" />
      </div>
      {action ? <SkLine width={140} height={38} style={{ flex: "none" }} /> : null}
    </div>
  );
}

function SkKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="kpi-row">
      {Array.from({ length: count }, (_, i) => (
        <div className="kpi" key={i}>
          <SkLine width="60%" />
          <SkLine width="45%" height={30} />
          <SkLine width="80%" height={10} />
        </div>
      ))}
    </div>
  );
}

export function SkCard({ lines = 4, children, style }: { lines?: number; children?: ReactNode; style?: CSSProperties }) {
  return (
    <section className="card" style={style}>
      <div className="card-head">
        <SkLine width={160} height={12} />
        <SkLine width={80} height={10} />
      </div>
      <div className="sk-stack">
        {children ??
          Array.from({ length: lines }, (_, i) => <SkLine key={i} width={`${[100, 88, 94, 72, 84][i % 5]}%`} />)}
      </div>
    </section>
  );
}

function SkTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="sk-stack" style={{ gap: 0 }}>
      <SkLine height={34} style={{ marginBottom: 6 }} />
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}>
          <SkLine width="70%" />
          <SkLine width="80%" />
          <SkLine width="60%" />
          <SkLine width="90%" height={8} />
        </div>
      ))}
    </div>
  );
}

function SkDetail({ sections = 4 }: { sections?: number }) {
  return (
    <aside className="detail">
      <div className="detail-body">
        <div className="sk-stack">
          <SkLine width={110} height={10} />
          <SkLine width="50%" height={24} />
          <SkLine width="85%" />
        </div>
        <SkBlock height={120} />
        {Array.from({ length: sections - 1 }, (_, i) => (
          <div className="sk-stack" key={i}>
            <SkLine width={130} height={12} />
            <SkLine width="100%" />
            <SkLine width="90%" />
            <SkLine width="75%" />
          </div>
        ))}
      </div>
    </aside>
  );
}

/* Per-screen skeletons ------------------------------------------------------ */

export function DetectSkeleton() {
  return (
    <SkScreen label="Loading the priority queue">
      <SkPageHead />
      <SkKpiRow />
      <div className="workspace" style={{ marginTop: 24 }}>
        <div className="stack">
          <SkCard>
            <SkBlock height={28} />
            <SkLine width="60%" height={10} />
          </SkCard>
          <SkCard>
            <SkTable />
          </SkCard>
        </div>
        <SkDetail />
      </div>
    </SkScreen>
  );
}

export function UnderstandSkeleton() {
  return (
    <SkScreen label="Loading the case">
      <SkPageHead />
      <div className="workspace workspace-narrow">
        <div className="stack">
          <SkCard>
            <SkBlock height={300} />
          </SkCard>
        </div>
        <div className="stack">
          <SkCard lines={5} />
          <SkCard lines={3} />
          <SkCard lines={4} />
        </div>
      </div>
    </SkScreen>
  );
}

export function RecommendSkeleton() {
  return (
    <SkScreen label="Loading the recommendation">
      <SkPageHead />
      <div className="workspace">
        <div className="stack">
          <SkCard>
            <SkLine width="45%" height={22} />
            <SkLine width="95%" />
            <SkLine width="80%" />
            <div className="grid-2" style={{ marginTop: 8 }}>
              <SkBlock height={72} />
              <SkBlock height={72} />
            </div>
          </SkCard>
          <SkCard lines={5} />
          <SkCard>
            <SkTable rows={5} />
          </SkCard>
        </div>
        <SkDetail />
      </div>
    </SkScreen>
  );
}

export function ActSkeleton() {
  return (
    <SkScreen label="Loading the sign-off">
      <SkPageHead />
      <div className="workspace">
        <div className="stack">
          <SkCard>
            <SkTable rows={5} />
          </SkCard>
          <SkCard lines={4} />
        </div>
        <SkDetail sections={3} />
      </div>
    </SkScreen>
  );
}

export function MeasureSkeleton() {
  return (
    <SkScreen label="Loading the measured outcome">
      <SkPageHead />
      <div className="workspace">
        <SkCard>
          <SkBlock height={140} />
          {Array.from({ length: 6 }, (_, i) => (
            <SkLine key={i} width={`${[90, 75, 85, 65, 80, 70][i]}%`} />
          ))}
        </SkCard>
        <SkDetail />
      </div>
    </SkScreen>
  );
}

export function ReportSkeleton() {
  return (
    <SkScreen label="Loading pilot results">
      <SkPageHead />
      <SkKpiRow />
      <div className="grid-2" style={{ marginTop: 24 }}>
        <SkCard lines={6} />
        <SkCard>
          <SkBlock height={140} />
          <SkLine width="70%" />
        </SkCard>
        <SkCard lines={5} />
        <SkCard>
          <SkTable rows={5} />
        </SkCard>
      </div>
    </SkScreen>
  );
}

/** Placeholder buttons while Copilot's suggested questions load. */
export function SkChips({ count = 4 }: { count?: number }) {
  return (
    <>
      <span className="sr-only">Loading suggested questions…</span>
      {Array.from({ length: count }, (_, i) => (
        <SkLine key={i} width={[180, 220, 160, 200][i % 4]} height={36} />
      ))}
    </>
  );
}
