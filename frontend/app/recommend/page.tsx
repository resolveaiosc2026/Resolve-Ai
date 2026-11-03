"use client";

import Link from "next/link";
import { PageHead } from "../../components/Shell";
import { Card, ConfidenceChip, Tick } from "../../components/ui";
import { useWorkbench } from "../../components/Workbench";
import { classifyReason, confidenceBand, priorityQueue, recommendAction } from "../../lib/analytics";
import { datasets } from "../../lib/datasets";

export default function RecommendPage() {
  const { caseId } = useWorkbench();
  const queue = priorityQueue(datasets);
  const row = queue.find((r) => r.customer.id === caseId) ?? queue[0];
  const customer = row.customer;
  const cls = classifyReason(datasets, customer.id);
  const rec = recommendAction(datasets, customer.id, cls);
  const best = rec.recommended;

  return (
    <>
      <PageHead
        stage="Stage 3 · Recommend"
        title={`Recommended action for ${customer.id}`}
        sub="The action is derived from the classified reason, this customer's eligibility, and ranked campaign history. It is a suggestion for a human to approve — nothing is sent from this screen."
        actions={
          best ? (
            <Link href="/act" className="btn" data-variant="primary">
              Review and sign off
            </Link>
          ) : null
        }
      />

      {!best ? (
        <div className="note" data-tone="neutral" style={{ marginBottom: 24 }}>
          <div className="title">No action is suggested yet</div>
          <p className="body-sm" style={{ marginTop: 6 }}>
            A recommendation needs a classified reason. This case is waiting on the customer's
            reply, so the honest answer is no action — not a guess.
          </p>
        </div>
      ) : null}

      <div className="workspace">
        <div className="stack">
          {best ? (
            <div className="highlight">
              <div className="row-between">
                <span className="label">
                  Recommended for {cls.primary?.label.toLowerCase() ?? "this case"}
                </span>
                {cls.primary ? (
                  <ConfidenceChip
                    band={confidenceBand(cls.primary.confidence)}
                    confidence={cls.primary.confidence}
                  />
                ) : null}
              </div>
              <h2 className="h-md" style={{ marginTop: 8 }}>
                {best.action.name}
              </h2>
              <p className="body-lg" style={{ marginTop: 8, maxWidth: "62ch" }}>
                {best.why}
              </p>
              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="card" style={{ padding: 16 }}>
                  <div className="kpi-label">Expected recovery</div>
                  <div className="data-lg" style={{ color: "var(--success)" }}>
                    {Math.round(best.predictedRecovery * 100)}%
                  </div>
                  <div className="meta">
                    From campaign history (synthetic), n=
                    {datasets.campaigns.find((c) => c.action_id === best.action.id && c.reason === cls.primary?.id)?.n ?? 0}
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div className="kpi-label">Channel suggested</div>
                  <div className="title" style={{ marginTop: 4 }}>
                    {best.action.channel}
                  </div>
                  <div className="meta">An existing Orange channel, not a new one</div>
                </div>
              </div>
            </div>
          ) : null}

          <Card title="Eligibility checks" note="all must pass before sign-off">
            <div className="checks">
              {best?.checks.map((c) => (
                <div className="check" key={c.code}>
                  <Tick state={c.passed ? "pass" : "fail"} />
                  <div>
                    <div className="check-title">{c.label}</div>
                    <div className="check-body">{c.detail}</div>
                  </div>
                </div>
              )) ?? null}
            </div>
          </Card>

          <Card title="What we recommended before, and what happened" note="campaign history, synthetic">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th>Action</th>
                    <th>Historical outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.history.map((h) => (
                    <tr key={`${h.reason}-${h.action}`} style={{ cursor: "default" }}>
                      <td className="cell-id">{h.reason}</td>
                      <td>{h.action}</td>
                      <td className="num">{h.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside className="detail">
          <div className="detail-body">
            <div>
              <div className="eyebrow">Case</div>
              <div className="detail-title">
                <h2 className="h-md">{customer.id}</h2>
                <span className="data-lg">{row.priority.total}</span>
              </div>
              <p className="body-sm muted">
                {customer.segment} · {customer.region} · {customer.days_since_last_activity} days
                inactive
              </p>
            </div>

            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Next-best alternative
              </div>
              {rec.candidates[1] ? (
                <div className="card" style={{ padding: 16 }}>
                  <div className="title">{rec.candidates[1].action.name}</div>
                  <p className="body-sm muted" style={{ marginTop: 6 }}>
                    {rec.candidates[1].action.mismatch_note} Expected recovery{" "}
                    {Math.round(rec.candidates[1].predictedRecovery * 100)}%.
                  </p>
                </div>
              ) : (
                <p className="body-sm muted">No second eligible action for this reason.</p>
              )}
            </div>

            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Not recommended, and why
              </div>
              <div className="pill-list">
                {rec.notRecommended.map((c) => (
                  <div key={c.action.id} className="kv">
                    <span>
                      <span className="title" style={{ display: "block" }}>
                        {c.action.short_name}
                      </span>
                      <span className="meta">{c.rejectedReason}</span>
                    </span>
                    <span className="chip" data-kind="status-open">
                      {Math.round(c.predictedRecovery * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="btn-row">
              {best ? (
                <Link href="/act" className="btn" data-variant="primary">
                  Review and sign off
                </Link>
              ) : null}
              <Link href="/detect" className="btn" data-variant="ghost">
                Back to the queue
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
