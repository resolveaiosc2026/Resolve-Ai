"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHead } from "../../components/Shell";
import { Card } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ActionError } from "../../components/ApiStatus";
import { errorMessage } from "../../lib/api/client";
import { askCopilot, getCopilotSuggestions } from "../../lib/api/endpoints";
import type { ApiCopilotAnswer } from "../../lib/api/types";
import { useApi } from "../../lib/api/useApi";

export default function CopilotPage() {
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<ApiCopilotAnswer[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [style, setStyle] = useState<"natural" | "template">("natural");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestions = useApi(getCopilotSuggestions, "copilot-suggestions");
  const endRef = useRef<HTMLDivElement | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || pending) return;
    setPending(text);
    setError(null);
    setDraft("");
    try {
      const a = await askCopilot(text, conversationId, style);
      setConversationId(a.conversationId);
      setThread((t) => [...t, a]);
    } catch (e) {
      setError(errorMessage(e));
      setDraft(text);
    } finally {
      setPending(null);
    }
  };

  const clear = () => {
    setThread([]);
    setConversationId(null);
    setError(null);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread, pending]);

  const last = thread[thread.length - 1];

  return (
    <>
      <PageHead
        stage="Executive copilot"
        title="Ask the workbench"
        sub="Questions are matched to an intent and answered from the same deterministic figures the six loop screens use, shown with their source. An AI model may phrase the sentence, but any answer that adds or drops a number is replaced by the template."
        actions={
          <Link href="/detect" className="btn">
            Back to the queue
          </Link>
        }
      />

      <div className="workspace">
        <div className="stack">
          <Card title="Conversation" note={thread.length ? `${thread.length} answered` : "no question yet"}>
            {thread.length === 0 && !pending ? (
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
                    {a.phrasedBy !== "template" ? (
                      <p className="meta" style={{ marginTop: 4 }}>
                        Phrased by {a.phrasedBy.replace("llm:", "")} from the facts on the right
                      </p>
                    ) : null}
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
                          <button key={f} className="btn" data-variant="ghost" disabled={Boolean(pending)} onClick={() => void ask(f)}>
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {i < thread.length - 1 ? <hr className="divider" /> : null}
                  </div>
                ))}
                {pending ? (
                  <div>
                    {thread.length ? <hr className="divider" /> : null}
                    <div className="bubble" data-who="customer" style={{ marginBottom: 8 }}>
                      {pending}
                    </div>
                    <p className="body-sm muted" aria-busy="true">
                      {style === "natural" ? "Gathering the facts and phrasing the answer (a few seconds)…" : "Gathering the facts…"}
                    </p>
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>
            )}
          </Card>

          <Card title="Ask a question">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(draft);
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
                <button className="btn" data-variant="primary" type="submit" disabled={!draft.trim() || Boolean(pending)}>
                  {pending ? "Answering…" : "Ask"}
                </button>
                <button className="btn" type="button" onClick={clear} disabled={Boolean(pending)}>
                  Clear conversation
                </button>
                <label className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={style === "template"}
                    onChange={(e) => setStyle(e.target.checked ? "template" : "natural")}
                    style={{ width: "auto" }}
                  />
                  <span className="body-sm">Instant answer (no AI phrasing)</span>
                </label>
              </div>
              <ActionError error={error} />
            </form>
            <div className="card-title" style={{ margin: "16px 0 8px" }}>
              Suggested questions
            </div>
            <div className="btn-row">
              {(suggestions.data ?? []).map((s) => (
                <button key={s} className="btn" disabled={Boolean(pending)} onClick={() => void ask(s)}>
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
                {last ? (
                  <span className="chip" data-kind="status-open">
                    {last.routedBy === "llm" ? "AI-routed" : "keyword match"}
                  </span>
                ) : null}
              </div>
              <p className="body-sm muted">
                {last
                  ? `${last.routedBy === "llm" ? "An AI model picked the intent from a fixed list" : "Keyword rules picked the intent"}. The numbers came from the Resolve AI API's deterministic services over the synthetic pilot data. ${last.phrasedBy === "template" ? "The sentence is the fixed template." : "An AI model phrased the sentence; it passed the numeric grounding check."}`
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
