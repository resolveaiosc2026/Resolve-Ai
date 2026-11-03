"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHead } from "../../components/Shell";
import { Card, ConfidenceChip } from "../../components/ui";
import { useWorkbench } from "../../components/Workbench";
import {
  classifyReason,
  confidenceBand,
  formatStamp,
  priorityQueue,
  recommendAction,
} from "../../lib/analytics";
import { ANALYST, datasets } from "../../lib/datasets";
import type { Action } from "../../lib/types";

const CHANNELS = ["Orange SMS", "USSD prompt", "Call centre"];
const WINDOWS = ["Today 16:00–18:00", "Tomorrow 09:00–11:00", "Next care shift"];

export default function ActPage() {
  const { caseId, approvals, record } = useWorkbench();
  const queue = useMemo(() => priorityQueue(datasets), []);
  const row = queue.find((r) => r.customer.id === caseId) ?? queue[0];
  const customer = row.customer;
  const cls = classifyReason(datasets, customer.id);
  const rec = recommendAction(datasets, customer.id, cls);

  const [picked, setPicked] = useState<Action | null>(rec.recommended?.action ?? null);
  const [channel, setChannel] = useState(rec.recommended?.action.channel ?? CHANNELS[0]);
  const [window_, setWindow] = useState(WINDOWS[0]);
  const [note, setNote] = useState("");
  const [showAlternatives, setShowAlternatives] = useState(false);

  const saved = approvals[customer.id];
  const chosen = picked ?? rec.recommended?.action ?? null;
  const candidate = rec.candidates.find((c) => c.action.id === chosen?.id) ?? null;
  const offChannel = chosen ? channel !== chosen.channel : false;

  const decide = (decision: "approved" | "changed" | "review") => {
    if (!chosen) return;
    record({
      caseId: customer.id,
      actionId: chosen.id,
      channel,
      window: window_,
      note: note.trim() || (decision === "approved" ? "Approved as recommended." : "Sent to human review."),
      at: new Date().toISOString(),
      decision,
    });
  };

  return (
    <>
      <PageHead
        stage="Stage 4 · Act"
        title="Sign off on this action"
        sub="Resolve AI prepares the message and the delivery window. A named analyst sends it. Approvals in this demo are stored in your browser only — no message leaves the workbench."
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
                  <span className="meta">{approvals[r.customer.id] ? "Signed off" : "Awaiting sign-off"}</span>
                </div>
              ))}
            </div>
          </Card>

          {saved ? (
            <div className="note">
              <div className="title">Recorded in this browser</div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                {saved.decision === "approved"
                  ? `Approved: ${datasets.actions.find((a) => a.id === saved.actionId)?.name} via ${saved.channel}, ${saved.window}.`
                  : saved.decision === "changed"
                    ? `Action changed to ${datasets.actions.find((a) => a.id === saved.actionId)?.name} and approved.`
                    : "Sent to human review. No action will be prepared until the review closes."}
                <br />
                Logged against {ANALYST} at {formatStamp(saved.at.slice(0, 16))}.{" "}
                <Link href="/measure" style={{ textDecoration: "underline" }}>
                  Open the action record
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
                {CHANNELS.map((c) => (
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
            Every action is logged against your name. Demo approvals stay in this browser.
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" data-variant="primary" data-on-dark="false" onClick={() => decide("approved")} disabled={!chosen}>
            Approve action
          </button>
          <button className="btn" data-on-dark="true" onClick={() => setShowAlternatives(true)}>
            Change action
          </button>
          <button className="btn" data-on-dark="true" onClick={() => decide("review")} disabled={!chosen}>
            Send to human review
          </button>
        </div>
      </div>
    </>
  );
}
