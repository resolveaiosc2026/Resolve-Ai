"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHead } from "../../components/Shell";
import { PrePostChart } from "../../components/Charts";
import { Card } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useWorkbench } from "../../components/Workbench";
import { formatStamp, measureView, priorityQueue, round } from "../../lib/analytics";
import { MEASURE_EXAMPLE, datasets } from "../../lib/datasets";

export default function MeasurePage() {
  const { approvals } = useWorkbench();
  const executed = datasets.interventions.map((i) => i.case_id);
  const [caseId, setCaseId] = useState(MEASURE_EXAMPLE);
  const m = useMemo(() => measureView(datasets, caseId), [caseId]);
  const queue = priorityQueue(datasets);
  const customer = queue.find((r) => r.customer.id === caseId)?.customer ?? queue[0].customer;
  const weeks = datasets.activity[caseId].weeks;
  const pending = approvals[caseId];

  const ratio = m.outcome ? m.outcome.activations_after / m.outcome.baseline_activations : 1;
  const pre = weeks.map((w) => ({ label: w.week_start, value: w.gb }));
  const post = weeks.slice(8).map((w) => ({ label: "after", value: round(w.gb * ratio, 2) }));

  const verdictTone =
    m.verdict === "recovered" ? "success" : m.verdict === "not_recovered" ? "error" : "medium";

  return (
    <>
      <PageHead
        stage="Stage 5 · Measure"
        title={`Action record for ${customer.id}`}
        sub="Every step on this case: who did it, when, and what the customer's own usage did afterwards. The verdict compares the customer with themselves, not with a fleet average."
        actions={
          <label className="field" style={{ margin: 0, minWidth: 220 }}>
            <span className="sr-only">Case</span>
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              {executed.map((id) => (
                <option key={id} value={id}>
                  {id} — action executed
                </option>
              ))}
              <option value={queue[0].customer.id}>{queue[0].customer.id} — no action yet</option>
            </select>
          </label>
        }
      />

      <div className="workspace">
        <Card title="What happened" note={`${m.events.length} events · ${customer.segment}`}>
          <div className="timeline">
            {m.events.map((e, i) => (
              <div className="tl-item" key={`${e.label}-${e.at}`}>
                <span className="tl-dot">{i + 1}</span>
                <div>
                  <div className="tl-title">{e.label}</div>
                  <div className="tl-meta">{e.detail}</div>
                  <div className="tl-meta">{e.system}</div>
                </div>
                <span className="tl-when">{formatStamp(e.at)}</span>
              </div>
            ))}
          </div>
          {pending ? (
            <p className="meta" style={{ marginTop: 12 }}>
              Your sign-off for this case is held in this browser ({pending.decision},{" "}
              {formatStamp(pending.at.slice(0, 16))}). A real deployment would write it to the
              case history.
            </p>
          ) : null}
        </Card>

        <aside className="detail">
          <div className="detail-body">
            <div>
              <div className="eyebrow">Did it work for this customer</div>
              <PrePostChart
                pre={pre}
                post={post}
                bandLow={round(customer.baseline_activations_per_month * 0.14, 2)}
                bandHigh={round(customer.baseline_activations_per_month * 0.19, 2)}
                appliedLabel="action applied"
              />
              <div className="chart-caption">
                <span>12 weeks before</span>
                <span>4 weeks after</span>
              </div>
            </div>

            {m.outcome ? (
              <div className="highlight">
                <div className="row-between">
                  <span className="label">Outcome · {m.outcome.window_days}-day window</span>
                  <span className="chip" data-kind={verdictTone === "error" ? "error" : verdictTone === "success" ? "high" : "medium"}>
                    {m.outcome.recovered ? "Recovered" : "Not recovered"}
                  </span>
                </div>
                <h2 className="h-md" style={{ marginTop: 8, color: m.outcome.recovered ? "var(--success)" : "var(--error)" }}>
                  {m.outcome.recovered ? "Back to their own baseline" : "Not recovered"}
                </h2>
                <p className="body-sm" style={{ marginTop: 6 }}>
                  {m.activationsAfter} bundle activations per month against a baseline of{" "}
                  {m.outcome.baseline_activations} ({m.vsBaselinePct}%). {m.outcome.note}
                </p>
              </div>
            ) : (
              <div className="note" data-tone="neutral">
                <div className="title">Nothing to measure yet</div>
                <p className="body-sm" style={{ marginTop: 6 }}>
                  No action has been executed on this case, so there is no before-and-after. The
                  30-day window only starts once a human signs something off.
                </p>
              </div>
            )}

            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Compare with the control group
              </div>
              <div className="kv">
                <span className="muted">Treated (this pilot)</span>
                <span className="num">
                  {datasets.outcomes.filter((o) => o.recovered).length}/{datasets.outcomes.length} recovered
                </span>
              </div>
              <div className="kv">
                <span className="muted">Matched controls</span>
                <span className="num">
                  {m.controlSummary.recovered}/{m.controlSummary.total} recovered
                </span>
              </div>
              <p className="meta" style={{ marginTop: 8 }}>
                Controls are matched within ±5% of their own usage before the action. Small n —
                read the interval, not the point estimate.
              </p>
            </div>

            <div className="reject">
              <div className="label" style={{ color: "var(--primary)" }}>
                Analyst check
              </div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                {m.outcome
                  ? "The verdict is computed from recorded usage, not from a model. If you disagree with it, correct the outcome and the report picks it up."
                  : "Do not record a result before the window closes. An empty outcome is a valid outcome."}
                <br />
                <span className="muted">
                  Channels named here are existing Orange systems: {m.action?.channel ?? "—"} for
                  delivery, CRM for the case history.
                </span>
              </p>
            </div>

            <div className="btn-row">
              <Link href="/report" className="btn" data-variant="primary">
                Add to the pilot report
              </Link>
              <Link href="/act" className="btn" data-variant="ghost">
                Back to sign-off
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <div style={{ marginTop: 24 }}>
        <Card title="How the verdict is decided" note="deterministic, no model in the loop">
          <div className="grid-2">
            <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
              <Icon name="check" size={20} />
              <p className="body-sm">
                <span className="title">Recovered</span> — activations inside 95% of this
                customer&apos;s own trailing baseline, measured after the action window.
              </p>
            </div>
            <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
              <Icon name="cross" size={20} />
              <p className="body-sm">
                <span className="title">Not recovered</span> — usage stayed at the flagged level
                through the window. Recorded as a negative result, not hidden.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
