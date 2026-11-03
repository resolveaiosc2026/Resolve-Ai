"use client";

import { useMemo, useState } from "react";
import { PageHead } from "../../components/Shell";
import { Bar, Card, Kpi } from "../../components/ui";
import { datasets } from "../../lib/datasets";
import { formatStamp, reportView } from "../../lib/analytics";

export default function ReportPage() {
  const r = useMemo(() => reportView(datasets), []);
  const [logged, setLogged] = useState<Record<string, "agree" | "disagree">>({});
  const review = r.agreement.rows[r.agreement.rows.length - 1];
  const reviewVote = review ? logged[review.case_id] : undefined;

  return (
    <>
      <PageHead
        stage="Stage 6 · Report"
        title="Retention pilot performance"
        sub="What the pilot found, how it was decided, and how far to trust it. Every number below is computed from the synthetic datasets in /data."
        actions={
          <button className="btn" data-variant="primary" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        }
      />

      <div className="note" style={{ marginBottom: 24 }}>
        <span className="title">Read this first.</span>{" "}
        <span className="body-sm">
          No real subscriber data was used. The prices, recovery rates and margin figures are
          placeholders. Values below show the format of the report, not a proven result. Real
          churn validation needs Orange historical outcomes.
        </span>
      </div>

      <div className="kpi-row">
        <Kpi label="Customers flagged" value={r.flagged} foot={`${r.windowDays}-day pilot window`} />
        <Kpi label="Churned" value={r.churned} tone="error" foot={`${r.churnPct}% of flagged cases`} />
        <Kpi label="Actions approved" value={r.approvalsThisWeek} foot={`${r.approvalsTotal} executed in the pilot`} />
        <Kpi label="Margin impact" value={`${r.marginImpactPct}%`} variant="tint" foot="no discount was applied" />
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title="Reasons found" note={`${r.classified} classified · ${r.awaitingReply} unanswered`}>
          {r.reasons.map((x) => (
            <div className="bar-row" key={x.label}>
              <span>{x.label}</span>
              <Bar value={x.pct} max={100} />
              <span className="num" style={{ textAlign: "right" }}>{x.pct}%</span>
            </div>
          ))}
          <p className="meta" style={{ marginTop: 10 }}>
            Unanswered cases are counted separately. They are not pushed into a reason bucket.
          </p>
        </Card>

        <Card
          title="Did the action work — treated vs control"
          aside={<span className="chip" data-kind="medium">Early signal</span>}
        >
          <div className="note" data-tone="error" style={{ marginBottom: 16 }}>
            <span className="title">Not verified: simulated.</span>{" "}
            <span className="body-sm">
              Generated from placeholder recovery rates, not from customers we actually won back.
              The report is wired; it does not yet show that any action works.
            </span>
          </div>
          <div className="grid-2">
            <div className="card" style={{ padding: 16 }}>
              <div className="kpi-label">Treated</div>
              <div className="data-lg">{Math.round(r.treated.rate * 100)}%</div>
              <div className="meta">
                {r.treated.recovered}/{r.treated.n} in 30 days · 95% interval{" "}
                {Math.round(r.treated.ci.low * 100)}–{Math.round(r.treated.ci.high * 100)}%
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="kpi-label">Control</div>
              <div className="data-lg">{Math.round(r.control.rate * 100)}%</div>
              <div className="meta">
                {r.control.recovered}/{r.control.n} in 30 days · 95% interval{" "}
                {Math.round(r.control.ci.low * 100)}–{Math.round(r.control.ci.high * 100)}%
              </div>
            </div>
          </div>
          <p className="body-sm" style={{ marginTop: 12 }}>
            <span className="title">Difference: {r.differencePoints} points.</span>{" "}
            {r.intervalsOverlap
              ? "The intervals overlap, so this pilot cannot tell a real effect from noise yet. More cases or a longer window is needed before anyone acts on this number."
              : "The intervals do not overlap, but the sample is still too small for a pricing or budget decision."}
          </p>
          <p className="meta" style={{ marginTop: 8 }}>
            Controls are matched within ±5% of their own usage before the action, not against an
            average customer.
          </p>
        </Card>
      </div>

      <div style={{ marginTop: 24 }}>
        <Card
          title="How well does the AI reasoning agree with analysts"
          aside={
            <span className="card-note">
              {r.agreement.reviewed} reviewed · {r.agreement.agreed} agreed
            </span>
          }
        >
          <div className="row-between" style={{ alignItems: "flex-end", marginBottom: 12 }}>
            <div>
              <div className="h-display">
                {r.agreement.pct}%
                <span className="body-sm muted"> agreed with an analyst</span>
              </div>
              <p className="meta">
                One case is not a rate. This shows the review loop exists, not that the
                classifier is accurate.
              </p>
            </div>
          </div>

          {review ? (
            <div className="card" style={{ padding: 16, background: "var(--neutral)" }}>
              <div className="meta" style={{ marginBottom: 6 }}>
                Customer verbatim reply (synthetic) · {review.case_id} ·{" "}
                {formatStamp(review.reviewed_at)}
              </div>
              <p className="body-lg">&ldquo;{review.verbatim}&rdquo;</p>
              <div className="row-between" style={{ marginTop: 12 }}>
                <span className="body-sm">
                  Labelled <span className="title">{review.analyst_reason === "affordability" ? "Affordability" : review.analyst_reason}</span>
                  {" "}by the model. Is that right?
                </span>
                <span className="btn-row">
                  <button
                    className="btn"
                    data-selected={reviewVote === "agree"}
                    onClick={() => setLogged((p) => ({ ...p, [review.case_id]: "agree" }))}
                  >
                    Agree
                  </button>
                  <button
                    className="btn"
                    data-selected={reviewVote === "disagree"}
                    onClick={() => setLogged((p) => ({ ...p, [review.case_id]: "disagree" }))}
                  >
                    Disagree
                  </button>
                </span>
              </div>
              {reviewVote ? (
                <p className="meta" style={{ marginTop: 10 }}>
                  Logged in this browser as &ldquo;{reviewVote}&rdquo;. A real deployment writes
                  this to the case history and feeds it back into evaluation.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Model reason</th>
                  <th>Analyst reason</th>
                  <th>Agreement</th>
                  <th data-num>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {r.agreement.rows.map((x) => (
                  <tr key={x.case_id} style={{ cursor: "default" }}>
                    <td className="cell-id">{x.case_id}</td>
                    <td>{x.ai_reason}</td>
                    <td>{x.analyst_reason}</td>
                    <td>
                      <span className="chip" data-kind={x.agreed ? "high" : "low"}>
                        {x.agreed ? "Agreed" : "Overridden"}
                      </span>
                    </td>
                    <td data-num>{formatStamp(x.reviewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 24 }}>
        <Card title="What we recommend, and what happened before" note="campaign history, synthetic">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Action</th>
                  <th data-num>Historical outcome</th>
                </tr>
              </thead>
              <tbody>
                {r.history.map((h) => (
                  <tr key={`${h.reason}-${h.action}`} style={{ cursor: "default" }}>
                    <td className="cell-id">{h.reason}</td>
                    <td>{h.action}</td>
                    <td data-num>{h.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
