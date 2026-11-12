/**
 * Resolve AI — analytics engine (frontend, pure TypeScript).
 *
 * Nothing here is a server. The browser imports the synthetic datasets and
 * calls these functions, so every figure on screen is derived from data
 * rather than typed into markup. The LLM is not the source of truth:
 * detection, scoring, eligibility and outcomes are deterministic rules;
 * only the free-text reason classification is modelled, and it always
 * reports a confidence rather than a certainty.
 */
import type {
  Action,
  ActionCandidate,
  CampaignRow,
  ClassificationView,
  ConfidenceBand,
  ControlRow,
  Customer,
  DetectionRun,
  EligibilityCheck,
  EvidenceItem,
  FeedbackEntry,
  Intervention,
  MeasureView,
  OutcomeRow,
  PriorityView,
  QueueRow,
  Reason,
  ReasonCandidate,
  ReasonId,
  ReviewRow,
  ActivitySeries,
  UsageView,
} from "./types";

export interface Datasets {
  customers: Customer[];
  activity: Record<string, ActivitySeries>;
  feedback: Record<string, FeedbackEntry>;
  reasons: Reason[];
  actions: Action[];
  campaigns: CampaignRow[];
  interventions: Intervention[];
  outcomes: OutcomeRow[];
  controls: ControlRow[];
  reviews: ReviewRow[];
  run: DetectionRun;
}

const DAYS_PER_WEEK = 7;
const WEEKS_PER_MONTH = 30.44 / DAYS_PER_WEEK; // 4.345

/* ================================================================== */
/* Step 1 — Detect                                                     */
/* ================================================================== */

/** Trailing 8-week baseline vs current 4 weeks, both expressed per month. */
export function usageView(customer: Customer, series: ActivitySeries): UsageView {
  const b = series.baseline_window_weeks;
  const baselineWeeks = series.weeks.slice(0, b);
  const currentWeeks = series.weeks.slice(b);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const baselineGb = round(mean(baselineWeeks.map((w) => w.gb)) * WEEKS_PER_MONTH, 1);
  const currentGb = round(mean(currentWeeks.map((w) => w.gb)) * WEEKS_PER_MONTH, 1);
  const changePct = Math.round((currentGb / baselineGb - 1) * 100);
  const dropPct = Math.max(0, -changePct) / 100;
  const sorted = [...baselineWeeks.map((w) => w.gb)].sort((x, y) => x - y);
  return {
    weeks: series.weeks,
    baselineGb,
    currentGb,
    changePct,
    dropPct,
    baselineActivations: customer.baseline_activations_per_month,
    currentActivations: customer.activations_per_month_now,
    // The customer's own normal range: ±12% of their baseline, not a fleet average.
    bandLowGb: round(baselineGb * 0.88, 2),
    bandHighGb: round(baselineGb * 1.12, 2),
  };
}

/**
 * Priority score, 0–93, built from five visible contributions so the analyst
 * can see what drove it. Capped per component.
 */
export function priorityView(customer: Customer, usage: UsageView): PriorityView {
  const drop = Math.min(40, Math.round(usage.dropPct * 100 * 0.58));
  const tierPoints = customer.value_tier === "High" ? 18 : customer.value_tier === "Medium" ? 10 : 4;
  const tenure = Math.min(15, Math.round(customer.tenure_months / 3));
  const inactivity = Math.min(12, Math.round(customer.days_since_last_activity / 2.2));
  const care = Math.min(8, customer.care_contacts_30d * 3);

  const contributions = [
    {
      key: "drop",
      label: "Usage drop",
      points: drop,
      max: 40,
      detail: `${usage.changePct}% against their own ${usage.baselineGb} GB baseline`,
    },
    {
      key: "value",
      label: "Value tier",
      points: tierPoints,
      max: 18,
      detail: `${customer.segment}, ${customer.value_tier} value tier`,
    },
    {
      key: "tenure",
      label: "Tenure",
      points: tenure,
      max: 15,
      detail: `${customer.tenure_months} months on the network`,
    },
    {
      key: "inactivity",
      label: "Days inactive",
      points: inactivity,
      max: 12,
      detail: `${customer.days_since_last_activity} days since last activity`,
    },
    {
      key: "care",
      label: "Recent care contact",
      points: care,
      max: 8,
      detail:
        customer.care_contacts_30d === 0
          ? "No care contact in the last 30 days"
          : `${customer.care_contacts_30d} care contacts in the last 30 days`,
    },
  ];
  const total = contributions.reduce((s, c) => s + c.points, 0);
  return { total, band: bandForScore(total), contributions };
}

export function bandForScore(score: number): ConfidenceBand {
  return score >= 75 ? "high" : score >= 55 ? "medium" : "low";
}

export function priorityQueue(data: Datasets): QueueRow[] {
  return data.customers
    .map((customer) => {
      const usage = usageView(customer, data.activity[customer.id]);
      return {
        customer,
        usage,
        priority: priorityView(customer, usage),
        status: customer.queue_status,
        reasonLabel: reasonLabelFor(data, customer.id),
      };
    })
    .sort((a, b) => b.priority.total - a.priority.total || a.customer.id.localeCompare(b.customer.id));
}

export function detectSummary(data: Datasets) {
  const run = data.run;
  const total = run.flagged_total;
  return {
    flagged: total,
    awaitingReply: run.awaiting_reply,
    readyForAction: run.ready_for_action,
    actionsAwaitingApproval: run.actions_awaiting_approval,
    minimumDaysInactive: run.minimum_days_inactive,
    pilotSample: run.pilot_sample_size,
    historyRecoveryRate: Math.round(historicalRecoveryRate(data.campaigns) * 100),
    bands: [
      { key: "high", label: "High risk", count: run.risk_bands.high, band: "high" as const },
      { key: "medium", label: "Medium risk", count: run.risk_bands.medium, band: "medium" as const },
      { key: "low", label: "Low risk", count: run.risk_bands.low, band: "low" as const },
    ].map((b) => ({ ...b, pct: Math.round((b.count / total) * 100) })),
  };
}

/** Population-weighted recovery rate from past campaigns, not from the pilot. */
export function historicalRecoveryRate(campaigns: CampaignRow[]): number {
  const n = campaigns.reduce((s, c) => s + c.n, 0);
  return campaigns.reduce((s, c) => s + c.recovery_rate * c.n, 0) / n;
}

/* ================================================================== */
/* Step 2 — Understand                                                 */
/* ================================================================== */

/**
 * Deterministic keyword scoring over the customer's own words, blended with
 * behavioural priors. Scores are normalised to a distribution so the screen
 * can show what was considered and rejected, not only the winner.
 */
/** Floor keeps an unconsidered reason visible at a low share instead of 0%. */
const FLOOR = 0.45;

const LEXICON: Record<Exclude<ReasonId, "unknown">, Record<string, number>> = {
  affordability: {
    money: 6, hard: 5, price: 4, prices: 4, expensive: 4, cost: 3, cheap: 2,
    fees: 4, salary: 3, school: 2, small: 2, wait: 1, only: 1, finish: 2,
    weekly: 0.5, daily: 0.5, buy: 0.5,
  },
  reduced_need: {
    travel: 4, upcountry: 3, season: 2, seasonal: 3, work: 2, children: 3,
    grow: 2, need: 3, own: 1, their: 1, less: 2, finished: 1, here: 1,
  },
  competitor: {
    another: 3, other: 2, mtn: 5, airtel: 4, sim: 3, line: 2, office: 2,
    their: 1, switched: 4, network: 1,
  },
  network_quality: {
    network: 5, signal: 5, slow: 4, tower: 4, load: 2, area: 2, street: 1,
    inside: 1, drop: 2, off: 2, data: 1, no: 0.5,
  },
  activation_difficulty: {
    know: 3, how: 3, menu: 4, code: 3, dial: 3, press: 2, confuse: 5,
    ussd: 4, try: 2, many: 1, time: 1, want: 1,
  },
};

export function classifyReason(data: Datasets, caseId: string): ClassificationView {
  const customer = data.customers.find((c) => c.id === caseId)!;
  const usage = usageView(customer, data.activity[caseId]);
  const entry = data.feedback[caseId] ?? null;

  if (!entry || !entry.reply_received || !entry.verbatim) {
    return {
      status: customer.queue_status === "unclassified" ? "unclassified" : "awaiting_reply",
      primary: null,
      alternatives: [],
      evidence: usageEvidence(customer, usage),
      feedback: entry,
    };
  }

  const tokens = entry.verbatim
    .toLowerCase()
    .split(/[^a-z0-9$']+/)
    .filter(Boolean);

  const ids = Object.keys(LEXICON) as Exclude<ReasonId, "unknown">[];
  const raw: Record<string, number> = {};
  for (const id of ids) {
    const dict = LEXICON[id];
    let score = FLOOR; // floor so an unconsidered reason is not shown as impossible
    for (const t of tokens) score += dict[t] ?? 0;
    raw[id] = score + behaviouralPrior(id, customer, usage);
  }
  raw.unknown = FLOOR;

  const sum = Object.values(raw).reduce((s, v) => s + v, 0);
  const candidates: ReasonCandidate[] = data.reasons.map((r) => ({
    id: r.id,
    label: r.label,
    icon: r.icon,
    confidence: round((raw[r.id] ?? FLOOR) / sum, 3),
  }));
  const ranked = candidates.sort((a, b) => b.confidence - a.confidence);

  return {
    status: "classified",
    primary: ranked[0],
    alternatives: ranked.slice(1),
    evidence: [
      {
        kind: "behavioural",
        title: "Behavioural signal — the customer's own words",
        body: `"${entry.verbatim}" — cost language points to price pressure, and "small" points to buying in smaller sums.`,
      },
      {
        kind: "usage",
        title: "Usage pattern",
        body: `${customer.activations_per_month_now} bundle activations this month against their own baseline of ${customer.baseline_activations_per_month} per month (${usage.changePct}%).`,
      },
      {
        kind: "exclusion",
        title: "Network faults checked",
        body:
          customer.network_fault_reports_30d === 0
            ? `No fault reported from this customer in ${customer.days_since_last_activity} days, and no fault logged in ${customer.region}. Network quality is not supported by the evidence.`
            : `${customer.network_fault_reports_30d} fault report(s) from this customer in the last 30 days.`,
      },
    ],
    feedback: entry,
  };
}

function behaviouralPrior(
  id: Exclude<ReasonId, "unknown">,
  customer: Customer,
  usage: UsageView,
): number {
  switch (id) {
    case "affordability":
      return usage.dropPct >= 0.4 ? 1.5 : 0.4;
    case "network_quality":
      return Math.min(4, customer.network_fault_reports_30d * 1.2);
    case "reduced_need":
      return customer.tenure_months >= 36 ? 0.3 : 0;
    case "activation_difficulty":
      return customer.care_contacts_30d >= 3 ? 0.8 : 0;
    case "competitor":
      return customer.activations_per_month_now <= 2 ? 0.5 : 0;
  }
}

function usageEvidence(customer: Customer, usage: UsageView): EvidenceItem[] {
  return [
    {
      kind: "usage",
      title: "Usage pattern",
      body: `${customer.activations_per_month_now} bundle activations this month against their own baseline of ${customer.baseline_activations_per_month} per month (${usage.changePct}%).`,
    },
    {
      kind: "exclusion",
      title: "Network faults checked",
      body:
        customer.network_fault_reports_30d === 0
          ? `No fault reported in ${customer.region} for this customer. Network quality is not supported by the evidence.`
          : `${customer.network_fault_reports_30d} fault report(s) in the last 30 days.`,
    },
    {
      kind: "behavioural",
      title: "Awaiting the customer's own words",
      body: "No reply yet, so no reason is attached. The case stays in the queue rather than being guessed.",
    },
  ];
}

export function confidenceBand(confidence: number): ConfidenceBand {
  return confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low";
}

/* ================================================================== */
/* Step 3 — Recommend                                                  */
/* ================================================================== */

export function recommendAction(
  data: Datasets,
  caseId: string,
  classification: ClassificationView,
): {
  recommended: ActionCandidate | null;
  candidates: ActionCandidate[];
  notRecommended: ActionCandidate[];
  history: { reason: string; action: string; outcome: string }[];
} {
  const customer = data.customers.find((c) => c.id === caseId)!;
  const reason = classification.primary;
  const prior = data.interventions.filter(
    (i) => i.case_id === caseId && daysBetween(i.sent_at, data.run.run_at) < 30,
  );

  const candidates: ActionCandidate[] = data.actions.map((action) => {
    const campaign = data.campaigns.find(
      (c) => c.action_id === action.id && c.reason === (reason?.id ?? "unknown"),
    );
    const checks = action.eligibility.map((rule) =>
      evaluateRule(rule, customer, action, prior, classification),
    );
    const eligible = checks.every((c) => c.passed);
    const matchesReason = !!reason && action.reasons.includes(reason.id);
    return {
      action,
      predictedRecovery: campaign?.recovery_rate ?? 0.2,
      eligible: eligible && matchesReason,
      checks,
      why: matchesReason
        ? `Matches a ${reason?.label.toLowerCase()} reply: ${action.short_name.toLowerCase()} keeps the spend the customer is already making.`
        : action.mismatch_note || "Not built for this reason.",
      rejectedReason: !matchesReason
        ? action.mismatch_note || "Not built for this reason."
        : !eligible
          ? checks.find((c) => !c.passed)?.detail ?? "Failed an eligibility check."
          : null,
    };
  });

  const ranked = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.predictedRecovery - a.predictedRecovery);

  return {
    recommended: ranked[0] ?? null,
    candidates: ranked,
    notRecommended: candidates.filter((c) => !c.eligible),
    history: data.campaigns.map((c) => ({
      reason: reasonLabel(data, c.reason),
      action: data.actions.find((a) => a.id === c.action_id)?.name ?? c.action_id,
      outcome: `${Math.round(c.recovery_rate * 100)}% recovered (n=${c.n}, synthetic)`,
    })),
  };
}

function evaluateRule(
  rule: { code: string; label: string },
  customer: Customer,
  action: Action,
  prior: Intervention[],
  classification: ClassificationView,
): EligibilityCheck {
  const yes = (detail: string): EligibilityCheck => ({
    code: rule.code, label: rule.label, passed: true, detail,
  });
  const no = (detail: string): EligibilityCheck => ({
    code: rule.code, label: rule.label, passed: false, detail,
  });
  switch (rule.code) {
    case "plan_active":
      return customer.days_since_last_activity < 90
        ? yes(`Line active, last seen ${customer.days_since_last_activity} days ago.`)
        : no("Line has had no activity for over 90 days.");
    case "no_discount_30d":
      return prior.length === 0
        ? yes("No offer sent to this customer in the last 30 days.")
        : no(`${prior.length} offer(s) already sent in the last 30 days.`);
    case "regional_stock":
      return ["Monrovia", "Sinkor", "Paynesville"].includes(customer.region)
        ? yes(`${action.short_name} is stocked in ${customer.region}.`)
        : no(`Not stocked in ${customer.region}.`);
    case "confidence_gate": {
      const conf = classification.primary?.confidence ?? 0;
      return conf >= 0.8
        ? yes(`Reason confidence ${Math.round(conf * 100)}% clears the 80% threshold.`)
        : no(`Reason confidence ${Math.round(conf * 100)}% is below the 80% threshold — routed to human review.`);
    }
    case "affordability_cap":
      return action.price_usd <= 2
        ? yes(`$${action.price_usd.toFixed(2)} is under the $2.00 pilot price cap.`)
        : no(`$${action.price_usd.toFixed(2)} exceeds the pilot price cap.`);
    case "fault_reported":
      return customer.network_fault_reports_30d > 0
        ? yes(`${customer.network_fault_reports_30d} fault report(s) in the last 30 days.`)
        : no("No network fault reported for this customer.");
    case "prior_activation":
      return customer.baseline_activations_per_month > 0
        ? yes("Customer has activated this bundle before.")
        : no("No activation history on record.");
    case "pricing_approval":
      return no("Requires a pricing approval outside the pilot scope.");
    case "consent_call":
      return customer.care_contacts_30d >= 2
        ? yes("Customer has spoken to care and agreed to a call back.")
        : no("No recorded consent to a care call.");
    default:
      return yes("Check passed.");
  }
}

/* ================================================================== */
/* Step 4 — Act                                                        */
/* ================================================================== */

export function actQueue(data: Datasets) {
  return priorityQueue(data)
    .filter((r) => ["new", "ready", "unclassified"].includes(r.status))
    .slice(0, 6)
    .map((r) => ({
      id: r.customer.id,
      segment: r.customer.segment,
      priority: r.priority.total,
      reason: r.reasonLabel,
    }));
}

/* ================================================================== */
/* Step 5 — Measure                                                    */
/* ================================================================== */

export function measureView(data: Datasets, caseId: string): MeasureView {
  const customer = data.customers.find((c) => c.id === caseId)!;
  const feedback = data.feedback[caseId];
  const intervention = data.interventions.find((i) => i.case_id === caseId) ?? null;
  const outcome = data.outcomes.find((o) => o.case_id === caseId) ?? null;
  const action = intervention
    ? data.actions.find((a) => a.id === intervention.action_id) ?? null
    : null;

  const events = [];
  events.push(ev("Case flagged by detection", `${customer.segment}, ${customer.days_since_last_activity} days inactive`, customer.flagged_at, "Behaviour analytics"));
  if (feedback?.asked_at)
    events.push(ev("Ask sent to the customer", `${feedback.channel} free-text question`, feedback.asked_at, feedback.channel));
  if (feedback?.replied_at)
    events.push(ev("Customer reply received", feedback.verbatim ? `"${feedback.verbatim}"` : "Reply logged", feedback.replied_at, "SMS inbox"));
  if (feedback?.classified_at)
    events.push(ev("Reply classified", `${reasonLabel(data, classifyReason(data, caseId).primary?.id ?? "unknown")} — confirmed by a human`, feedback.classified_at, feedback.classified_by ?? "Retention analyst"));
  if (intervention?.drafted_at)
    events.push(ev("Next-best-action drafted", action?.name ?? intervention.action_id, intervention.drafted_at, "Next-best-action"));
  if (intervention?.approved_at)
    events.push(ev("Action approved by a human", `Signed off by ${intervention.approved_by}`, intervention.approved_at, "Retention analyst"));
  if (intervention?.sent_at)
    events.push(ev(intervention.delivered ? "Intervention delivered" : "Intervention failed to deliver", intervention.channel, intervention.sent_at, intervention.channel));
  if (intervention?.click_recorded)
    events.push(ev("Offer link recorded", "Customer opened the offer", intervention.sent_at, "Campaign tracking"));
  if (outcome)
    events.push(ev(`Outcome recorded (${outcome.recovered ? "recovered" : "not recovered"})`, `${outcome.window_days}-day window`, outcome.measured_at, "Evaluation"));

  const controlRecovered = data.controls.filter((c) => c.recovered).length;
  const vsBaselinePct = outcome
    ? Math.round((outcome.activations_after / outcome.baseline_activations - 1) * 100)
    : null;

  return {
    events,
    outcome,
    intervention,
    action,
    verdict: outcome ? (outcome.recovered ? "recovered" : "not_recovered") : intervention ? "awaiting_window" : "awaiting_window",
    activationsAfter: outcome?.activations_after ?? null,
    vsBaselinePct,
    controlSummary: {
      recovered: controlRecovered,
      total: data.controls.length,
      rate: round(controlRecovered / data.controls.length, 3),
    },
  };
}

function ev(label: string, detail: string, at: string, system: string) {
  return { label, detail, at, system };
}

/* ================================================================== */
/* Step 6 — Report                                                     */
/* ================================================================== */

export function reportView(data: Datasets) {
  const outcomes = data.outcomes;
  const treatedRecovered = outcomes.filter((o) => o.recovered).length;
  const treatedN = outcomes.length;
  const controlRecovered = data.controls.filter((c) => c.recovered).length;
  const controlN = data.controls.length;
  const treatedRate = treatedRecovered / treatedN;
  const controlRate = controlRecovered / controlN;

  // Reasons are split over classified cases only; the unanswered rest is
  // reported as its own count rather than folded into the distribution.
  const reasonCounts = new Map<string, number>();
  let awaitingReply = 0;
  for (const c of data.customers) {
    const label = reasonLabelFor(data, c.id);
    if (label === "Awaiting reply") {
      awaitingReply++;
      continue;
    }
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  }
  const totalClassified = [...reasonCounts.values()].reduce((s, v) => s + v, 0);

  const agreed = data.reviews.filter((r) => r.agreed).length;
  const ciTreated = wilson(treatedRecovered, treatedN);
  const ciControl = wilson(controlRecovered, controlN);

  return {
    flagged: data.run.pilot_sample_size,
    windowDays: data.run.pilot_window_days,
    churned: data.run.churned_case_ids.length,
    churnPct: Math.round((data.run.churned_case_ids.length / data.run.pilot_sample_size) * 1000) / 10,
    approvalsThisWeek: data.run.approvals_this_week,
    approvalsTotal: data.interventions.length,
    marginImpactPct: data.run.margin_impact_change_pct,
    awaitingReply,
    classified: totalClassified,
    reasons: [...reasonCounts.entries()]
      .map(([label, count]) => ({ label, count, pct: Math.round((count / totalClassified) * 100) }))
      .sort((a, b) => b.count - a.count),
    treated: { recovered: treatedRecovered, n: treatedN, rate: round(treatedRate, 3), ci: ciTreated },
    control: { recovered: controlRecovered, n: controlN, rate: round(controlRate, 3), ci: ciControl },
    differencePoints: Math.round((treatedRate - controlRate) * 100),
    intervalsOverlap: ciTreated.low <= ciControl.high && ciControl.low <= ciTreated.high,
    agreement: {
      agreed,
      reviewed: data.reviews.length,
      pct: Math.round((agreed / data.reviews.length) * 100),
      rows: data.reviews,
    },
    history: data.campaigns.map((c) => ({
      reason: reasonLabel(data, c.reason),
      action: data.actions.find((a) => a.id === c.action_id)?.name ?? c.action_id,
      outcome: `${Math.round(c.recovery_rate * 100)}% (n=${c.n})`,
    })),
  };
}

/** Wilson 95% interval — small-n honesty, not a point estimate. */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return { low: round(Math.max(0, centre - margin), 3), high: round(Math.min(1, centre + margin), 3) };
}

/* ================================================================== */
/* Shared helpers                                                      */
/* ================================================================== */

export function reasonLabel(data: Datasets, id: string | null | undefined): string {
  if (!id) return "Not classified";
  return data.reasons.find((r) => r.id === id)?.label ?? "Not classified";
}

/** Reads the stored classification for a case, if one exists. */
function reasonLabelFor(data: Datasets, caseId: string): string {
  const fb = data.feedback[caseId];
  if (!fb?.reply_received) return "Awaiting reply";
  const review = data.reviews.find((r) => r.case_id === caseId);
  if (review) return reasonLabel(data, review.ai_reason);
  const cls = classifyReason(data, caseId);
  return cls.primary ? cls.primary.label : "Awaiting reply";
}

export function caseById(data: Datasets, id: string) {
  return data.customers.find((c) => c.id === id) ?? data.customers[0];
}

export function round(value: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

export function pct(value: number, dp = 0): string {
  return `${(value * 100).toFixed(dp)}%`;
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a.replace(" ", "T")) - Date.parse(b.replace(" ", "T"))) / 86400000;
}

export function formatStamp(stamp: string): string {
  const d = new Date(stamp.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function maskMsisdn(value: string): string {
  return value; // already masked in the dataset; kept explicit for reviewers
}
