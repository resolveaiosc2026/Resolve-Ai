"use client";

import Link from "next/link";
import { PageHead } from "../../components/Shell";
import { Bar, Card, ConfidenceChip, Tick } from "../../components/ui";
import { Icon, REASON_ICONS } from "../../components/Icon";
import { useWorkbench } from "../../components/Workbench";
import { classifyReason, confidenceBand, formatStamp, priorityQueue } from "../../lib/analytics";
import { datasets } from "../../lib/datasets";

export default function UnderstandPage() {
  const { caseId } = useWorkbench();
  const queue = priorityQueue(datasets);
  const row = queue.find((r) => r.customer.id === caseId) ?? queue[0];
  const customer = row.customer;
  const cls = classifyReason(datasets, customer.id);
  const fb = cls.feedback;
  const prior = datasets.interventions.filter((i) => i.case_id === customer.id);

  return (
    <>
      <PageHead
        stage="Stage 2 · Understand"
        title={`Why ${customer.id} is using less`}
        sub={`Usage fell ${row.usage.changePct}% against their own baseline. The reason below comes from the customer's own reply, scored against the alternatives. It is a likely reason, not a certainty.`}
        actions={
          <Link href="/recommend" className="btn" data-variant="primary">
            Continue to recommendation
          </Link>
        }
      />

      <div className="workspace" style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}>
        <div className="stack">
          <Card title="What the customer was asked" note={fb ? formatStamp(fb.asked_at) : undefined}>
            <div className="phone">
              <div className="phone-bar">
                <span>SMS</span>
                <span>{fb?.channel ?? "Orange SMS"}</span>
              </div>
              <div className="phone-body">
                <div className="bubble">{fb?.question}</div>
                {fb?.reply_received ? (
                  <div className="bubble" data-who="customer">
                    {fb.verbatim}
                  </div>
                ) : (
                  <div className="bubble" data-who="customer">
                    <span className="muted">No reply yet.</span>
                  </div>
                )}
              </div>
            </div>
            <p className="meta" style={{ marginTop: 12 }}>
              Sent through the existing Orange SMS channel. Resolve AI does not send anything
              on its own. Number masked as {customer.masked_msisdn}.
            </p>
          </Card>

          <Card title="Ask again">
            <p className="body-sm muted">
              A second question is only worth sending if it can change the classification.
              For this case the answer is already in the reply.
            </p>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn" type="button" disabled style={{ opacity: 0.5 }}>
                Send a follow-up ask
              </button>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="The classification" aside={<span className="card-note">Reply received {fb?.replied_at ? formatStamp(fb.replied_at) : "—"}</span>}>
            {cls.primary ? (
              <>
                <div className="row" style={{ gap: 12, alignItems: "center" }}>
                  <Icon name={REASON_ICONS[cls.primary.id]} size={24} />
                  <h2 className="h-md">{cls.primary.label}</h2>
                  <ConfidenceChip
                    band={confidenceBand(cls.primary.confidence)}
                    confidence={cls.primary.confidence}
                  />
                </div>
                {confidenceBand(cls.primary.confidence) === "low" ? (
                  <p className="note" style={{ marginTop: 12 }}>
                    Confidence is below 60%, so this case is routed to human review before any
                    action is suggested.
                  </p>
                ) : null}

                <div className="card-title" style={{ margin: "20px 0 8px" }}>
                  Competing explanations considered
                </div>
                {cls.alternatives.map((a) => (
                  <div className="bar-row" key={a.id}>
                    <span className="row" style={{ gap: 6 }}>
                      <Icon name={a.icon} size={16} /> {a.label}
                    </span>
                    <Bar value={a.confidence} max={1} tone="ink" />
                    <span className="num" style={{ textAlign: "right" }}>
                      {Math.round(a.confidence * 100)}%
                    </span>
                  </div>
                ))}
                <p className="meta" style={{ marginTop: 10 }}>
                  Scored from the words in the reply plus the behavioural evidence. The full
                  distribution sums to 100%, so a weak alternative stays visible.
                </p>
              </>
            ) : (
              <div className="note" data-tone="neutral">
                <div className="title">{cls.status === "awaiting_reply" ? "Awaiting the customer's reply" : "Needs a human read"}</div>
                <p className="body-sm" style={{ marginTop: 6 }}>
                  {cls.status === "awaiting_reply"
                    ? "The ask is still unanswered. Resolve AI leaves the reason empty rather than inventing one, and the case waits in the queue."
                    : "The reply did not match any reason clearly enough to classify. A human read is required before an action is suggested."}
                </p>
              </div>
            )}
          </Card>

          <Card title="Evidence used" note={`${cls.evidence.length} signals`}>
            <div className="checks">
              {cls.evidence.map((e) => (
                <div className="check" key={e.title}>
                  <Tick state={e.kind === "exclusion" && customer.network_fault_reports_30d > 0 ? "fail" : "pass"} />
                  <div>
                    <div className="check-title">{e.title}</div>
                    <div className="check-body">{e.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Treatment to date">
            {prior.length === 0 ? (
              <p className="body-sm">
                Nothing sent to this subscriber yet. First flag raised{" "}
                {formatStamp(customer.flagged_at)}.
              </p>
            ) : (
              <div className="checks">
                {prior.map((i) => (
                  <div className="check" key={i.id}>
                    <Tick />
                    <div>
                      <div className="check-title">
                        {datasets.actions.find((a) => a.id === i.action_id)?.name ?? i.action_id}
                      </div>
                      <div className="check-body">
                        Sent {formatStamp(i.sent_at)} via {i.channel} · approved by {i.approved_by}
                        {" · "}
                        {datasets.outcomes.find((o) => o.case_id === i.case_id)?.recovered
                          ? "recovered"
                          : "outcome not recovered yet"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
