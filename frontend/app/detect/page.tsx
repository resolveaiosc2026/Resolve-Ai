"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHead } from "../../components/Shell";
import { Loaded } from "../../components/ApiStatus";
import { BaselineSparkline, StackedBand } from "../../components/Charts";
import { Bar, Card, ConfidenceChip, Kpi, StatusChip } from "../../components/ui";
import { useWorkbench } from "../../components/Workbench";
import { confidenceBand } from "../../lib/analytics";
import { getDetectSummary, getQueue, getReasons, getRecommendation } from "../../lib/api/endpoints";
import { useApi } from "../../lib/api/useApi";

export default function DetectPage() {
  const { caseId, run } = useWorkbench();
  const queue = useApi(getQueue, "queue");
  const summary = useApi(getDetectSummary, "summary");
  const selectedId =
    queue.data?.find((r) => r.customer.id === caseId)?.customer.id ?? queue.data?.[0]?.customer.id ?? caseId;
  const classification = useApi(() => getReasons(selectedId), `reasons:${selectedId}`);
  const recommendation = useApi(() => getRecommendation(selectedId), `rec:${selectedId}`);

  return (
    <Loaded queries={[queue, summary, classification, recommendation]}>
      {() => (
        <DetectView
          all={queue.data!}
          summary={summary.data!}
          classification={classification.data!}
          recommendation={recommendation.data!}
          splitAt={run?.baselineWeeks ?? 8}
        />
      )}
    </Loaded>
  );
}

function DetectView({
  all,
  summary,
  classification,
  recommendation,
  splitAt,
}: {
  all: Awaited<ReturnType<typeof getQueue>>;
  summary: Awaited<ReturnType<typeof getDetectSummary>>;
  classification: Awaited<ReturnType<typeof getReasons>>;
  recommendation: Awaited<ReturnType<typeof getRecommendation>>;
  splitAt: number;
}) {
  const { caseId, selectCase } = useWorkbench();
  const [segment, setSegment] = useState("all");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");

  const rows = all.filter(
    (r) =>
      (segment === "all" || r.customer.segment === segment) &&
      (region === "all" || r.customer.region === region) &&
      (status === "all" || r.status === status),
  );

  const selected = all.find((r) => r.customer.id === caseId) ?? all[0];
  const minDrop = Math.min(...all.map((r) => -r.usage.changePct));

  const segments = [...new Set(all.map((r) => r.customer.segment))].sort();
  const regions = [...new Set(all.map((r) => r.customer.region))].sort();

  return (
    <>
      <PageHead
        stage="Stage 1 · Detect"
        title="Priority queue"
        sub={`Every case here is at least ${Math.floor(minDrop)}% below their own trailing 8-week bundle baseline. Sorted by priority score, highest first. The score is shown with the evidence behind it, never on its own.`}
        actions={
          <Link href="/understand" className="btn" data-variant="primary">
            Open top case
          </Link>
        }
      />

      <div className="kpi-row">
        <Kpi label="Flagged subscribers" value={summary.flagged.toLocaleString()} foot={`of ${summary.subscribersScored.toLocaleString()} scored`} />
        <Kpi label="High risk" value={summary.bands[0].count.toLocaleString()} variant="inverted" foot="priority score 75 and above" />
        <Kpi label="Minimum days inactive" value={summary.minimumDaysInactive} foot="to enter this queue" />
        <Kpi label="Actions awaiting approval" value={summary.actionsAwaitingApproval} foot="nothing sends until a human signs off" />
      </div>

      <div className="workspace" style={{ marginTop: 24 }}>
        <div className="stack">
          <Card title="Risk distribution" note={`${summary.flagged.toLocaleString()} flagged`}>
            <StackedBand
              segments={[
                { key: "high", label: "High risk", value: summary.bands[0].count, color: "#000000" },
                { key: "medium", label: "Medium risk", value: summary.bands[1].count, color: "#ff7900" },
                { key: "low", label: "Low risk", value: summary.bands[2].count, color: "#dddddd" },
              ]}
            />
          </Card>

          <Card
            title="Attention list, sorted by priority"
            aside={<span className="card-note">Select a row to open the case</span>}
          >
            <div className="filters" style={{ marginBottom: 16 }}>
              <FilterSelect label="Segment" value={segment} onChange={setSegment} options={segments} />
              <FilterSelect label="Region" value={region} onChange={setRegion} options={regions} />
              <FilterSelect
                label="Queue status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "new", label: "New" },
                  { value: "awaiting_reply", label: "Awaiting reply" },
                  { value: "unclassified", label: "Needs review" },
                  { value: "ready", label: "Ready for action" },
                  { value: "action_done", label: "Action sent" },
                ]}
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Segment</th>
                    <th data-num>Baseline / mo</th>
                    <th data-num>This month</th>
                    <th data-num>Change</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.customer.id}
                      data-selected={r.customer.id === selected.customer.id}
                      onClick={() => selectCase(r.customer.id)}
                    >
                      <td className="cell-id">{r.customer.id}</td>
                      <td>{r.customer.segment}</td>
                      <td data-num>{r.usage.baselineGb.toFixed(1)} GB</td>
                      <td data-num>{r.usage.currentGb.toFixed(1)} GB</td>
                      <td data-num>{r.usage.changePct}%</td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <span style={{ width: 90 }}>
                            <Bar value={r.priority.total} max={93} tone={r.priority.band === "high" ? "ink" : undefined} />
                          </span>
                          <span className="data-md">{r.priority.total}</span>
                        </span>
                      </td>
                      <td>
                        <StatusChip status={r.status} />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted" style={{ height: 64 }}>
                        No case matches these filters. Clear one to see the queue again.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="meta" style={{ marginTop: 12 }}>
              Showing {rows.length} of {all.length} pilot cases · recovery rate from past
              campaigns is {summary.historyRecoveryRate}% (synthetic history, not this pilot)
            </p>
          </Card>
        </div>

        <aside className="detail">
          <div className="detail-body">
            <div>
              <div className="eyebrow">Baseline vs now</div>
              <div className="detail-title">
                <h2 className="h-md">{selected.customer.id}</h2>
                <span className="data-lg">{selected.priority.total}</span>
              </div>
              <p className="body-sm muted">
                {selected.customer.segment} · {selected.customer.region} ·{" "}
                {selected.customer.days_since_last_activity} days inactive ·{" "}
                {selected.customer.masked_msisdn}
              </p>
            </div>

            <div>
              <BaselineSparkline
                weeks={selected.usage.weeks}
                bandLow={selected.usage.bandLowGb}
                bandHigh={selected.usage.bandHighGb}
                splitAt={splitAt}
                changePct={selected.usage.changePct}
              />
              <div className="kv">
                <span className="muted">Their baseline</span>
                <span className="num">{selected.usage.baselineGb.toFixed(1)} GB / month</span>
              </div>
              <div className="kv">
                <span className="muted">Last 4 weeks</span>
                <span className="num">{selected.usage.currentGb.toFixed(1)} GB / month</span>
              </div>
              <div className="kv">
                <span className="muted">Activations</span>
                <span className="num">
                  {selected.customer.baseline_activations_per_month} → {selected.customer.activations_per_month_now} per month
                </span>
              </div>
            </div>

            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Why this score
              </div>
              {selected.priority.contributions.map((c) => (
                <div className="bar-row" key={c.key}>
                  <span>{c.label}</span>
                  <Bar value={c.points} max={c.max} tone={c.points === c.max ? "ink" : undefined} />
                  <span className="num" style={{ textAlign: "right" }}>
                    {c.points} / {c.max}
                  </span>
                </div>
              ))}
              <p className="meta" style={{ marginTop: 8 }}>
                {selected.priority.contributions[0].detail}.
              </p>
            </div>

            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Likely reason
              </div>
              {classification.primary ? (
                <div className="row" style={{ gap: 8 }}>
                  <span className="title">{classification.primary.label}</span>
                  <ConfidenceChip
                    band={confidenceBand(classification.primary.confidence)}
                    confidence={classification.primary.confidence}
                  />
                </div>
              ) : (
                <p className="body-sm muted">
                  No reply yet, so no reason is attached. The case stays in the queue rather
                  than being guessed.
                </p>
              )}
            </div>

            {recommendation.recommended ? (
              <div className="highlight">
                <div className="label" style={{ marginBottom: 6 }}>
                  Suggested next action
                </div>
                <div className="title">{recommendation.recommended.action.name}</div>
                <p className="body-sm" style={{ marginTop: 6 }}>
                  {recommendation.recommended.why}
                </p>
              </div>
            ) : null}

            <div className="btn-row">
              <Link href="/understand" className="btn" data-variant="primary">
                Open the case
              </Link>
              <Link href="/report" className="btn" data-variant="ghost">
                See pilot results
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
