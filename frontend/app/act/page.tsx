"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHead } from "../../components/Shell";
import { Card, ConfidenceChip } from "../../components/ui";
import { ActionError, Loaded } from "../../components/ApiStatus";
import { useWorkbench } from "../../components/Workbench";
import { confidenceBand } from "../../lib/analytics";
import { ANALYST } from "../../lib/datasets";
import type { ClassificationResult } from "../../lib/api/adapters";
import { DELIVERY_CHANNELS, channelId } from "../../lib/api/channels";
import {
  approveAction,
  ensurePendingRecommendation,
  getQueue,
  getReasons,
  getRecommendation,
  rejectAction,
} from "../../lib/api/endpoints";
import { useAction, useApi } from "../../lib/api/useApi";
import type { Action } from "../../lib/types";

const WINDOWS = ["Today 16:00–18:00", "Tomorrow 09:00–11:00", "Next care shift"];

type Queue = Awaited<ReturnType<typeof getQueue>>;
type Rec = Awaited<ReturnType<typeof getRecommendation>>;
type Outcome = { decision: "approved" | "changed" | "review"; reference?: string; actionName?: string };

export default function ActPage() {
  const { caseId } = useWorkbench();
  const queue = useApi(getQueue, "queue");
  const cls = useApi(() => getReasons(caseId), `reasons:${caseId}`);
  const rec = useApi(() => getRecommendation(caseId), `rec:${caseId}`);
  return (
    <Loaded queries={[queue, cls, rec]}>
      {() => <ActView key={caseId} queue={queue.data!} cls={cls.data!} rec={rec.data!} />}
    </Loaded>
  );
}

function ActView({ queue, cls, rec }: { queue: Queue; cls: ClassificationResult; rec: Rec }) {
  const { caseId } = useWorkbench();
  const row = queue.find((r) => r.customer.id === caseId) ?? queue[0];
  const customer = row.customer;
  const action = useAction();

  const [picked, setPicked] = useState<Action | null>(rec.recommended?.action ?? null);
  const [channel, setChannel] = useState<string>(rec.recommended?.action.channel ?? DELIVERY_CHANNELS[0]);
  const [window_, setWindow] = useState(WINDOWS[0]);
  const [note, setNote] = useState("");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [done, setDone] = useState<Outcome | null>(null);

  const chosen = picked ?? rec.recommended?.action ?? null;
  const offChannel = chosen ? channel !== chosen.channel : false;
  const alreadySignedOff = rec.current?.status === "approved" || row.status === "action_done";
  const canDecide = Boolean(chosen) && !alreadySignedOff && !action.pending && !done;

  const decide = async (decision: "approved" | "review") => {
    if (!chosen) return;
    await action.run(async () => {
      const recommendationId = await ensurePendingRecommendation(customer.id, rec.current, ANALYST);
      if (decision === "review") {
        await rejectAction(recommendationId, ANALYST, note.trim() || "Sent to human review.");
        setDone({ decision: "review" });
        return;
      }
      const changed = chosen.id !== rec.recommended?.action.id;
      const result = await approveAction(recommendationId, {
        reviewerName: ANALYST,
        actionId: changed ? chosen.id : undefined,
        channel: channelId(channel),
        window: window_,
        note: note.trim() || undefined,
      });
      setDone({
        decision: changed ? "changed" : "approved",
        reference: result.intervention.reference,
        actionName: chosen.name,
      });
    });
  };

  return (
    <>
      <PageHead
        stage="Stage 4 · Act"
        title="Sign off on this action"
        sub="Resolve AI prepares the message and the delivery window. A named analyst approves it, and only then is it handed off to Orange’s channel. Every decision is recorded by the Resolve AI API."
        actions={
          <span className="tag-synthetic">
            Human approval required · {ANALYST}
          </span>
        }
      />

      <div className="workspace">
        <div className="stack">
          <Card title="Queue waiting" note="your place is kept while you sign off">
            <div className="checks">
              {queue.slice(0, 6).map((r) => (
                <div className="check" key={r.customer.id} style={{ gridTemplateColumns: "24px minmax(0,1fr) auto" }}>
                  <span className="tick" style={{ background: r.customer.id === customer.id ? "var(--primary)" : "var(--ink)", color: r.customer.id === customer.id ? "var(--on-primary)" : "var(--on-ink)" }}>
                    <span className="label">{r.priority.total}</span>
                  </span>
                  <div>
                    <div className="check-title">{r.customer.id}</div>
                    <div className="check-body">
                      {r.customer.segment} · {r.reasonLabel}
                    </div>
                  </div>
                  <span className="meta">{r.status === "action_done" ? "Signed off" : "Awaiting sign-off"}</span>
                </div>
              ))}
            </div>
          </Card>

          {done ? (
            <div className="note">
              <div className="title">Recorded by the Resolve AI API</div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                {done.decision === "review"
                  ? "Sent to human review. The case returns to the queue as needing review; no action will be prepared until the reason is checked."
                  : `${done.decision === "changed" ? "Action changed and approved" : "Approved"}: ${done.actionName} via ${channel}, ${window_}. Handed off to Orange as ${done.reference}.`}
                <br />
                Logged against {ANALYST}.{" "}
                {done.decision === "review" ? (
                  <Link href="/understand" style={{ textDecoration: "underline" }}>
                    Review the reason
                  </Link>
                ) : (
                  <Link href="/measure" style={{ textDecoration: "underline" }}>
                    Open the action record
                  </Link>
                )}
              </p>
            </div>
          ) : alreadySignedOff ? (
            <div className="note" data-tone="neutral">
              <div className="title">Already signed off</div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                This case already has an approved action.{" "}
                <Link href="/measure" style={{ textDecoration: "underline" }}>
                  Open the action record
                </Link>
              </p>
            </div>
          ) : !rec.recommended ? (
            <div className="note" data-tone="neutral">
              <div className="title">Nothing to sign off yet</div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                A recommendation needs a classified reason.{" "}
                <Link href="/understand" style={{ textDecoration: "underline" }}>
                  Go to Understand
                </Link>
              </p>
            </div>
          ) : null}
        </div>

        <aside className="detail">
          <div className="detail-body">
            <div>
              <div className="eyebrow">Case</div>
              <div className="detail-title">
                <h2 className="h-md">{customer.id}</h2>
                {cls.primary ? (
                  <ConfidenceChip
                    band={confidenceBand(cls.primary.confidence)}
                    confidence={cls.primary.confidence}
                  />
                ) : null}
              </div>
              <p className="body-sm muted">
                {cls.primary?.label ?? "No reason classified"} ·{" "}
                {cls.primary ? `${Math.round(cls.primary.confidence * 100)}% confidence` : "review first"} ·{" "}
                {customer.masked_msisdn}
              </p>
            </div>

            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="card-title">Action</span>
                <button className="btn" data-variant="ghost" onClick={() => setShowAlternatives((v) => !v)}>
                  {showAlternatives ? "Hide options" : "Change action"}
                </button>
              </div>
              <div className="pill-list">
                {[rec.recommended, ...(showAlternatives ? rec.candidates.slice(1) : [])].filter(Boolean).map((c, i) => (
                  <button
                    key={c!.action.id}
                    type="button"
                    className="radio-row"
                    data-selected={chosen?.id === c!.action.id}
                    onClick={() => {
                      setPicked(c!.action);
                      setChannel(c!.action.channel);
                    }}
                    style={{ textAlign: "left", width: "100%", background: chosen?.id === c!.action.id ? undefined : "var(--surface)" }}
                  >
                    <span className="radio-dot" />
                    <span>
                      <span className="title">
                        {c!.action.short_name} — ${c!.action.price_usd.toFixed(2)}
                      </span>
                      {i === 0 ? (
                        <span className="chip" data-kind="status-new" style={{ marginLeft: 8 }}>
                          Recommended
                        </span>
                      ) : null}
                      <span className="check-body" style={{ display: "block" }}>
                        Not used in {customer.days_since_last_activity} days ·{" "}
                        {Math.round(c!.predictedRecovery * 100)}% predicted recovery
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-block">
              <label className="field">Channel</label>
              <div className="btn-group">
                {DELIVERY_CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="btn"
                    data-selected={channel === c}
                    onClick={() => setChannel(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {offChannel ? (
                <p className="meta" style={{ color: "var(--error)" }}>
                  {chosen?.name} was designed for {chosen?.channel}. Sending it another way has
                  no history behind it.
                </p>
              ) : null}
            </div>

            <div className="form-block">
              <label className="field" htmlFor="window">
                Send window
              </label>
              <select id="window" value={window_} onChange={(e) => setWindow(e.target.value)}>
                {WINDOWS.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </div>

            <div className="form-block">
              <div className="row-between">
                <label className="field" style={{ marginBottom: 0 }}>
                  Message preview
                </label>
                <span className="meta">{(chosen?.body ?? "").length} characters</span>
              </div>
              <div className="phone" style={{ width: "100%" }}>
                <div className="phone-bar">
                  <span>{channel}</span>
                  <span>Orange</span>
                </div>
                <div className="phone-body">
                  <div className="bubble">{chosen?.body ?? "No action selected."}</div>
                </div>
              </div>
            </div>

            <div className="form-block">
              <label className="field" htmlFor="note">
                Analyst note (stored in the case history)
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you are approving or changing this action"
              />
            </div>
          </div>
        </aside>
      </div>

      <div className="decision">
        <div>
          <div className="decision-text">
            You decide. Resolve AI will not act without approval.
          </div>
          <div className="decision-sub">
            Every action is logged against your name and recorded by the Resolve AI API.
          </div>
          <ActionError error={action.error} />
        </div>
        <div className="btn-row">
          <button className="btn" data-variant="primary" data-on-dark="false" onClick={() => void decide("approved")} disabled={!canDecide}>
            {action.pending ? "Recording…" : "Approve action"}
          </button>
          <button className="btn" data-on-dark="true" onClick={() => setShowAlternatives(true)} disabled={!canDecide}>
            Change action
          </button>
          <button className="btn" data-on-dark="true" onClick={() => void decide("review")} disabled={!canDecide}>
            Send to human review
          </button>
        </div>
      </div>
    </>
  );
}
