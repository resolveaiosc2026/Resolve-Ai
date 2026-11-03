import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { ConfidenceBand, QueueStatus } from "../lib/types";

export function Card({
  title,
  note,
  aside,
  children,
  className,
}: {
  title?: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          {aside ?? (note ? <span className="card-note">{note}</span> : null)}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  foot,
  variant,
  tone,
}: {
  label: string;
  value: ReactNode;
  foot?: string;
  variant?: "inverted" | "tint";
  tone?: "success" | "error";
}) {
  return (
    <div className="kpi" data-variant={variant} data-tone={tone}>
      <span className="kpi-label">{label}</span>
      <span className="data-lg">{value}</span>
      {foot ? <span className="kpi-foot">{foot}</span> : null}
    </div>
  );
}

export function ConfidenceChip({
  band,
  confidence,
}: {
  band: ConfidenceBand;
  confidence: number;
}) {
  const word = band === "high" ? "High" : band === "medium" ? "Medium" : "Low";
  return (
    <span className="chip" data-kind={band} title={`${word} confidence: ${Math.round(confidence * 100)}%`}>
      {word} {Math.round(confidence * 100)}%
    </span>
  );
}

const STATUS_LABEL: Record<QueueStatus, { text: string; kind: string }> = {
  new: { text: "New", kind: "status-new" },
  awaiting_reply: { text: "Awaiting reply", kind: "status-reply" },
  unclassified: { text: "Needs review", kind: "status-open" },
  ready: { text: "Ready for action", kind: "status-new" },
  action_done: { text: "Action sent", kind: "status-done" },
};

export function StatusChip({ status }: { status: QueueStatus }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.new;
  return <span className="chip" data-kind={s.kind}>{s.text}</span>;
}

export function ReasonChip({ label, icon }: { label: string; icon?: string }) {
  return (
    <span className="chip" data-kind="reason">
      {icon ? <Icon name={icon} size={16} /> : null}
      {label}
    </span>
  );
}

export function Bar({
  value,
  max = 1,
  tone,
}: {
  value: number;
  max?: number;
  tone?: "ink" | "info" | "success";
}) {
  return (
    <span className="bar" data-tone={tone}>
      <span style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }} />
    </span>
  );
}

export function BarRow({
  label,
  value,
  max,
  caption,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  caption: string;
  tone?: "ink" | "info" | "success";
}) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <Bar value={value} max={max} tone={tone} />
      <span className="num" style={{ textAlign: "right" }}>
        {caption}
      </span>
    </div>
  );
}

export function Tick({ state = "pass" }: { state?: "pass" | "fail" }) {
  return (
    <span className="tick" data-state={state}>
      <Icon name={state === "pass" ? "check" : "cross"} size={13} strokeWidth={2.5} />
    </span>
  );
}
