"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHead } from "../../components/Shell";
import { Card } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { answer, SUGGESTED_QUESTIONS, type CopilotAnswer } from "../../lib/copilot";
import { datasets } from "../../lib/datasets";

export default function CopilotPage() {
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<CopilotAnswer[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setThread((t) => [...t, answer(text, datasets)]);
    setDraft("");
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread]);

  const last = thread[thread.length - 1];

  return (
    <>
      <PageHead
        stage="Executive copilot"
        title="Ask the workbench"
        sub="Questions are matched to an intent, answered from the same deterministic aggregates the six loop screens use, and shown with their source. No external model is called, so nothing outside this data can be invented."
        actions={
          <Link href="/detect" className="btn">
            Back to the queue
          </Link>
        }
      />

      <div className="workspace">
        <div className="stack">
          <Card title="Conversation" note={thread.length ? `${thread.length} answered` : "no question yet"}>
            {thread.length === 0 ? (
              <p className="body-sm muted">
                Pick a question below or write your own. Every answer comes with the facts behind
                it on the right.
              </p>
            ) : (
              <div className="stack" style={{ gap: 16 }}>
                {thread.map((a, i) => (
                  <div key={i}>
                    <div className="bubble" data-who="customer" style={{ marginBottom: 8 }}>
                      {a.question}
                    </div>
                    <p className="body-lg">{a.answer}</p>
                    {a.caveat ? (
                      <p className="meta" style={{ marginTop: 6 }}>
                        <span className="row" style={{ gap: 6, display: "inline-flex" }}>
                          <Icon name="alert" size={14} /> {a.caveat}
                        </span>
                      </p>
                    ) : null}
                    {i === thread.length - 1 && a.followUps.length ? (
                      <div className="btn-row" style={{ marginTop: 10 }}>
                        {a.followUps.map((f) => (
                          <button key={f} className="btn" data-variant="ghost" onClick={() => ask(f)}>
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {i < thread.length - 1 ? <hr className="divider" /> : null}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </Card>

          <Card title="Ask a question">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
              className="col"
              style={{ gap: 12 }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Which segment needs the most attention?"
                aria-label="Question"
              />
              <div className="btn-row">
                <button className="btn" data-variant="primary" type="submit" disabled={!draft.trim()}>
                  Ask
                </button>
                <button className="btn" type="button" onClick={() => setThread([])}>
                  Clear conversation
                </button>
              </div>
            </form>
            <div className="card-title" style={{ margin: "16px 0 8px" }}>
              Suggested questions
            </div>
            <div className="btn-row">
              {SUGGESTED_QUESTIONS.map((s) => (
                <button key={s} className="btn" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <aside className="detail">
          <div className="detail-body">
            <div>
              <div className="eyebrow">How this answer was built</div>
              <div className="detail-title">
                <h2 className="h-md">{last ? last.intent : "Idle"}</h2>
                <span className="chip" data-kind="status-open">intent match</span>
              </div>
              <p className="body-sm muted">
                {last
                  ? "Keyword rules picked the intent. The numbers came from lib/analytics.ts over the synthetic datasets. Only then was the sentence composed."
                  : "Ask a question to see the facts behind the answer."}
              </p>
            </div>

            {last ? (
              <div>
                <div className="card-title" style={{ marginBottom: 8 }}>
                  Facts used
                </div>
                {last.facts.map((f) => (
                  <div className="kv" key={`${f.label}-${f.value}`}>
                    <span>
                      <span className="title" style={{ display: "block" }}>
                        {f.label}
                      </span>
                      <span className="meta">{f.source}</span>
                    </span>
                    <span className="num">{f.value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="reject">
              <div className="label" style={{ color: "var(--primary)" }}>
                The rule this screen exists to prove
              </div>
              <p className="body-sm" style={{ marginTop: 6 }}>
                The LLM is not the source of truth. Behaviour analytics, scoring and eligibility
                are deterministic; a language layer may explain a recommendation, but it does not
                calculate it and it never sends anything. High-impact decisions stay with a named
                analyst.
              </p>
            </div>

            <div className="btn-row">
              <Link href="/act" className="btn" data-variant="primary">
                Go to sign-off
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
