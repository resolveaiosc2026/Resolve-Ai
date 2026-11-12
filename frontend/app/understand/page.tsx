"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHead } from "../../components/Shell";
import { Bar, Card, ConfidenceChip, Tick } from "../../components/ui";
import { Icon, REASON_ICONS } from "../../components/Icon";
import { ActionError, Loaded, SimulationOffNote } from "../../components/ApiStatus";
import { useWorkbench } from "../../components/Workbench";
import { confidenceBand, formatStamp } from "../../lib/analytics";
import { ANALYST } from "../../lib/datasets";
import type { ClassificationResult } from "../../lib/api/adapters";
import { stamp } from "../../lib/api/adapters";
import { ASK_CHANNELS, channelId } from "../../lib/api/channels";
import {
  acceptEvidence,
  correctReason,
  getCustomer,
  getInterventions,
  getReasons,
  handOffAsk,
  simulateReply,
} from "../../lib/api/endpoints";
import type { ApiInterventionRow } from "../../lib/api/types";
import { useAction, useApi } from "../../lib/api/useApi";
import type { QueueRow, ReasonId } from "../../lib/types";

const REASONS: { id: ReasonId; label: string }[] = [
  { id: "affordability", label: "Affordability" },
  { id: "reduced_need", label: "Reduced need" },
  { id: "competitor", label: "Competitor" },
  { id: "network_quality", label: "Network quality" },
  { id: "activation_difficulty", label: "Activation difficulty" },
  { id: "unknown", label: "Unknown" },
];

export default function UnderstandPage() {
  const { caseId } = useWorkbench();
  const row = useApi(() => getCustomer(caseId), `customer:${caseId}`);
  const cls = useApi(() => getReasons(caseId), `reasons:${caseId}`);
  const interventions = useApi(getInterventions, "interventions");

  return (
    <Loaded queries={[row, cls, interventions]}>
      {() => (
        <UnderstandView
          row={row.data!}
          cls={cls.data!}
          prior={interventions.data!.filter((i) => i.customerId === row.data!.customer.id)}
        />
      )}
    </Loaded>
  );
}

function UnderstandView({
  row,
  cls,
  prior,
}: {
  row: QueueRow;
  cls: ClassificationResult;
  prior: ApiInterventionRow[];
}) {
  const customer = row.customer;
  const fb = cls.feedback;

  return (
    <>
      <PageHead
        stage="Stage 2 · Understand"
        title={`Why ${customer.id} is using less`}
        sub={`Usage fell ${row.usage.changePct}% against their own baseline. The reason below comes from behavioural evidence or the customer's own reply, scored against the alternatives. It is a likely reason, not a certainty.`}
        actions={
          <Link href="/recommend" className="btn" data-variant="primary">
            Continue to recommendation
          </Link>
        }
      />

      <div className="workspace" style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}>
        <div className="stack">
          <Card title="What the customer was asked" note={fb ? formatStamp(fb.asked_at) : undefined}>
            {fb ? (
              <div className="phone">
                <div className="phone-bar">
                  <span>Ask</span>
                  <span>{fb.channel}</span>
                </div>
                <div className="phone-body">
                  <div className="bubble">{fb.question}</div>
                  {fb.reply_received ? (
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
            ) : (
              <p className="body-sm muted">No ask has been handed off for this case.</p>
            )}
            <p className="meta" style={{ marginTop: 12 }}>
              Asks are handed to existing Orange channels. Resolve AI does not contact the customer
              itself. Number masked as {customer.masked_msisdn}.
            </p>
          </Card>

          <NextStep customerId={customer.id} cls={cls} />
        </div>

        <div className="stack">
          <Card
            title="The classification"
            aside={
              <span className="card-note">
                {cls.source ? `Source: ${cls.source}` : null}
                {fb?.replied_at ? ` · reply ${formatStamp(fb.replied_at)}` : ""}
              </span>
            }
          >
            {cls.primary ? (
              <>
                <div className="row" style={{ gap: 12, alignItems: "center" }}>
                  <Icon name={REASON_ICONS[cls.primary.id]} size={24} />
                  <h2 className="h-md">{cls.primary.label}</h2>
                  <ConfidenceChip band={confidenceBand(cls.primary.confidence)} confidence={cls.primary.confidence} />
                </div>
                {cls.review ? (
                  <p className="meta" style={{ marginTop: 8 }}>
                    Confirmed by {cls.review.reviewedBy} on {formatStamp(stamp(cls.review.reviewedAt))}.
                  </p>
                ) : null}
                {confidenceBand(cls.primary.confidence) === "low" ? (
                  <p className="note" style={{ marginTop: 12 }}>
                    Confidence is below 60%, so this case is routed to human review before any action
                    is suggested.
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
                <div className="title">
                  {cls.status === "awaiting_reply" ? "Awaiting the customer's reply" : "No reason attached yet"}
                </div>
                <p className="body-sm" style={{ marginTop: 6 }}>
                  {cls.status === "awaiting_reply"
                    ? "The ask is still unanswered. Resolve AI leaves the reason empty rather than inventing one, and the case waits in the queue."
                    : "Nothing classifies this case clearly enough yet. Use the next step on the left: accept strong evidence, or hand an ask to an Orange channel."}
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
                Nothing handed off for this subscriber yet. First flag raised {formatStamp(customer.flagged_at)}.
              </p>
            ) : (
              <div className="checks">
                {prior.map((i) => (
                  <div className="check" key={i.id}>
                    <Tick />
                    <div>
                      <div className="check-title">
                        {i.reference} · {i.action.name}
                      </div>
                      <div className="check-body">
                        Approved by {i.approvedBy} {formatStamp(stamp(i.approvedAt))} via {i.channel} ·{" "}
                        {i.status.replace("_", " ")} · {i.hasOutcome ? "outcome recorded" : "outcome not measured yet"}
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

/** The one thing to do next on this case, driven by the API's assessment. */
function NextStep({ customerId, cls }: { customerId: string; cls: ClassificationResult }) {
  const { simulationOn } = useWorkbench();
  const action = useAction();
  const [channel, setChannel] = useState<string>(ASK_CHANNELS[0]);
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState<ReasonId>(cls.primary?.id ?? "affordability");
  const [note, setNote] = useState("");

  if (cls.nextStep === "use_evidence") {
    return (
      <Card title="Next step: accept the evidence">
        <p className="body-sm muted">
          Behavioural evidence explains this drop strongly enough on its own. Accepting it records
          the reason under your name; no ask is needed.
        </p>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn"
            data-variant="primary"
            type="button"
            disabled={action.pending}
            onClick={() => action.run(() => acceptEvidence(customerId, ANALYST))}
          >
            {action.pending ? "Saving…" : "Accept evidence as the reason"}
          </button>
        </div>
        <ActionError error={action.error} />
      </Card>
    );
  }

  if (cls.nextStep === "request_feedback") {
    return (
      <Card title="Next step: ask why">
        <p className="body-sm muted">
          No evidence explains this drop. Hand a short question to an existing Orange channel. Orange
          sends it; Resolve AI only records the hand-off and reads the reply.
        </p>
        <div className="form-block" style={{ marginTop: 12 }}>
          <label className="field" htmlFor="ask-channel">
            Orange channel
          </label>
          <select id="ask-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {ASK_CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn"
            data-variant="primary"
            type="button"
            disabled={action.pending}
            onClick={() => {
              const id = channelId(channel);
              if (id) void action.run(() => handOffAsk(customerId, id, ANALYST));
            }}
          >
            {action.pending ? "Handing off…" : `Hand off to ${channel}`}
          </button>
        </div>
        <ActionError error={action.error} />
      </Card>
    );
  }

  if (cls.nextStep === "awaiting_reply" && cls.feedback) {
    const requestId = cls.feedback.requestId;
    return (
      <Card title="Waiting for the reply">
        <p className="body-sm muted">
          The ask was handed to {cls.feedback.channel} on {formatStamp(cls.feedback.asked_at)}. When
          Orange returns the reply, it is classified into the fixed reason taxonomy (AI with a keyword
          fallback).
        </p>
        {simulationOn ? (
          <>
            <div className="form-block" style={{ marginTop: 12 }}>
              <label className="field" htmlFor="reply">
                Demo: the customer&apos;s reply (leave empty for a scripted one)
              </label>
              <textarea
                id="reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="money business hard dis time"
              />
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                className="btn"
                data-variant="primary"
                type="button"
                disabled={action.pending}
                onClick={() => action.run(() => simulateReply(requestId, reply.trim() || undefined))}
              >
                {action.pending ? "Classifying…" : "Simulate the customer's reply"}
              </button>
            </div>
          </>
        ) : (
          <SimulationOffNote what="Simulating the reply" />
        )}
        <ActionError error={action.error} />
      </Card>
    );
  }

  if (cls.nextStep === "classified" && cls.classificationId) {
    const classificationId = cls.classificationId;
    return (
      <Card title="Check the reason">
        <p className="body-sm muted">
          {cls.review
            ? `Already reviewed by ${cls.review.reviewedBy}. You can still correct it.`
            : "Confirm the reason, or correct it if the reply says something else. Your decision is logged."}
        </p>
        <div className="form-block" style={{ marginTop: 12 }}>
          <label className="field" htmlFor="reason">
            Reason
          </label>
          <select id="reason" value={reason} onChange={(e) => setReason(e.target.value as ReasonId)}>
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-block">
          <label className="field" htmlFor="reason-note">
            Note (optional)
          </label>
          <textarea id="reason-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn"
            data-variant="primary"
            type="button"
            disabled={action.pending}
            onClick={() =>
              action.run(() => correctReason(classificationId, reason, ANALYST, note.trim() || undefined))
            }
          >
            {action.pending ? "Saving…" : reason === cls.primary?.id ? "Confirm reason" : "Save correction"}
          </button>
        </div>
        <ActionError error={action.error} />
      </Card>
    );
  }

  return (
    <Card title="Next step">
      <p className="body-sm muted">
        Nothing to do on this case right now. It stays monitored in the queue.
      </p>
    </Card>
  );
}
