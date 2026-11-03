/**
 * Resolve AI — synthetic dataset generator
 *
 * Orange Summer Challenge MVP. Every figure produced here is synthetic.
 * No real Orange subscriber data, MSISDNs, prices or business metrics.
 *
 *   node scripts/generate-data.mjs
 *
 * Deterministic: a fixed seed reproduces byte-identical JSON, so the demo
 * numbers on screen always match the written case notes.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ */
/* Seeded PRNG (mulberry32) — deterministic, no Math.random            */
/* ------------------------------------------------------------------ */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 3 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261028);
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const stamp = (d) => new Date(d).toISOString().slice(0, 16).replace("T", " ");

const RUN_DATE = Date.parse("2026-10-28T08:00:00Z");
// 12 weekly buckets: weeks 1-8 = trailing baseline, weeks 9-12 = current month.
const WEEKS = Array.from({ length: 12 }, (_, i) =>
  iso(RUN_DATE - (11 - i) * 7 * DAY),
);

/* ------------------------------------------------------------------ */
/* Reference vocabulary                                                 */
/* ------------------------------------------------------------------ */
const SEGMENTS = [
  "PDP reseller",
  "Family top-up",
  "Android top-up",
  "WhatsApp payer",
  "Home fix",
  "Small business",
];
const REGIONS = ["Monrovia", "Sinkor", "Paynesville", "Kakata", "Ganta"];
const TIERS = ["High", "Medium", "Low"];

const REASONS = [
  { id: "affordability", label: "Affordability", icon: "wallet" },
  { id: "reduced_need", label: "Reduced need", icon: "arrow-down" },
  { id: "competitor", label: "Competitor", icon: "swap" },
  { id: "network_quality", label: "Network quality", icon: "signal-slash" },
  { id: "activation_difficulty", label: "Activation difficulty", icon: "cursor-alert" },
  { id: "unknown", label: "Unknown", icon: "question" },
];

/** Verbatim replies, written as short synthetic Liberian-English SMS text. */
const VERBATIMS = {
  affordability: [
    "Money hard this month. Buy small weekly.",
    "Price too high now. I wait for salary before I buy bundle.",
    "School fees finish my money. I use only what last.",
  ],
  reduced_need: [
    "I travel upcountry next month. No need big bundle here.",
    "My children grow. They buy their own line now.",
    "Work finish for this season. I no need data plenty.",
  ],
  competitor: [
    "Another network price good for me now. I use their line.",
    "My office give me another SIM. I use that for data.",
  ],
  network_quality: [
    "Network slow inside my area. Data no load some days.",
    "Signal drop since the tower work near our street.",
  ],
  activation_difficulty: [
    "I no know how to buy the big bundle. The menu confuse me.",
    "I press the code many time, it no give me the bundle I want.",
  ],
  unknown: ["No reply received.", "Something else, I no explain on SMS."],
};

const ASK = {
  channel: "Orange SMS",
  question:
    "Orange: We noticed your bundle use dropped. Reply with one number: " +
    "1 Price 2 Network 3 Not using much 4 Using another line 5 Something else",
};

/* ------------------------------------------------------------------ */
/* Action library                                                       */
/* ------------------------------------------------------------------ */
const ACTIONS = [
  {
    id: "daily_mini_600",
    name: "Daily Mini 600 MB for $0.60",
    short_name: "Daily Mini 600 MB",
    price_usd: 0.6,
    size_mb: 600,
    validity_hours: 24,
    reasons: ["affordability"],
    mismatch_note: "",
    predicted_recovery: 0.62,
    channel: "Orange SMS",
    window: "Today 16:00–18:00",
    body:
      "Orange: Daily Mini 600 MB for $0.60, valid 24 hours. Reply YES to confirm. " +
      "No change to your current plan. T&C apply.",
    eligibility: [
      { code: "plan_active", label: "Plan is active" },
      { code: "no_discount_30d", label: "No discount offer used in the last 30 days" },
      { code: "regional_stock", label: "Daily Mini is available in this region" },
      { code: "confidence_gate", label: "Reason confidence is above the 80% review threshold" },
    ],
  },
  {
    id: "monthly_mini_2g",
    name: "Monthly Mini 2 GB for $1.80",
    short_name: "Monthly Mini 2 GB",
    price_usd: 1.8,
    size_mb: 2048,
    validity_hours: 720,
    reasons: ["affordability"],
    mismatch_note: "A larger bundle at a higher price than the customer is buying now.",
    predicted_recovery: 0.41,
    channel: "Orange SMS",
    window: "Today 16:00–18:00",
    body:
      "Orange: Monthly Mini 2 GB for $1.80, valid 30 days. Reply YES to confirm. T&C apply.",
    eligibility: [
      { code: "plan_active", label: "Plan is active" },
      { code: "no_discount_30d", label: "No discount offer used in the last 30 days" },
      { code: "affordability_cap", label: "Offer stays under the $2.00 pilot price cap" },
    ],
  },
  {
    id: "care_bridge",
    name: "Call-centre bridge to the network team",
    short_name: "Call-centre bridge",
    price_usd: 0,
    size_mb: 0,
    validity_hours: 0,
    reasons: ["network_quality"],
    mismatch_note: "No network fault was reported for this customer in the last 30 days.",
    predicted_recovery: 0.44,
    channel: "Call centre",
    window: "Next care shift 09:00–11:00",
    body: "Ticket raised for the network operations team. No customer message sent.",
    eligibility: [
      { code: "fault_reported", label: "A network fault was reported or detected" },
      { code: "plan_active", label: "Plan is active" },
    ],
  },
  {
    id: "ussd_guide",
    name: "USSD navigation guide with a direct activation code",
    short_name: "USSD guide",
    price_usd: 0,
    size_mb: 0,
    validity_hours: 0,
    reasons: ["activation_difficulty"],
    mismatch_note: "The customer already activates bundles without support.",
    predicted_recovery: 0.52,
    channel: "Orange SMS",
    window: "Today 16:00–18:00",
    body: "Orange: To buy the bundle you used before, dial *144*2*3*1# or reply HELP.",
    eligibility: [
      { code: "prior_activation", label: "Customer activated this bundle before" },
      { code: "plan_active", label: "Plan is active" },
    ],
  },
  {
    id: "competitor_match",
    name: "Price-match offer against the other network",
    short_name: "Price-match offer",
    price_usd: 0.55,
    size_mb: 600,
    validity_hours: 24,
    reasons: ["competitor"],
    mismatch_note: "Needs a pricing approval outside the pilot, and cuts margin for a reseller who sets their own price.",
    predicted_recovery: 0.3,
    channel: "Orange SMS",
    window: "Today 16:00–18:00",
    body: "Orange: We can match your usual bundle price for 30 days. Reply YES to confirm.",
    eligibility: [
      { code: "pricing_approval", label: "Requires a pricing approval outside the pilot" },
      { code: "plan_active", label: "Plan is active" },
    ],
  },
  {
    id: "reduced_need_checkin",
    name: "Reduced-need check-in call",
    short_name: "Check-in call",
    price_usd: 0,
    size_mb: 0,
    validity_hours: 0,
    reasons: ["reduced_need"],
    mismatch_note: "The reply describes cost, not a seasonal change in need.",
    predicted_recovery: 0.28,
    channel: "Call centre",
    window: "Next care shift 09:00–11:00",
    body: "Care agent confirms the change is seasonal and closes the case without an offer.",
    eligibility: [
      { code: "consent_call", label: "Customer consented to a care call" },
      { code: "plan_active", label: "Plan is active" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Anchor cases — the figures quoted in the written case notes          */
/* ------------------------------------------------------------------ */
const ANCHORS = [
  {
    id: "LR-20417", segment: "PDP reseller", region: "Sinkor", tier: "High",
    tenure: 38, baseline_gb: 6.5, now_gb: 2.0, baseline_act: 18, now_act: 6,
    days_inactive: 22, care_contacts: 2, faults: 0, status: "new", reason: "affordability",
    confidence: 0.86,
  },
  {
    id: "LR-19076", segment: "Small business", region: "Monrovia", tier: "Medium",
    tenure: 44, baseline_gb: 6.0, now_gb: 2.1, baseline_act: 16, now_act: 5,
    days_inactive: 18, care_contacts: 1, faults: 0, status: "action_done",
    reason: "affordability", confidence: 0.82,
  },
  {
    id: "LR-21148", segment: "Parent bundle", region: "Kakata", tier: "High",
    tenure: 44, baseline_gb: 2.5, now_gb: 1.5, baseline_act: 7, now_act: 4,
    days_inactive: 15, care_contacts: 2, faults: 3, status: "new",
    reason: "network_quality", confidence: 0.71,
  },
  {
    id: "LR-14806", segment: "Small business", region: "Paynesville", tier: "High",
    tenure: 40, baseline_gb: 3.8, now_gb: 2.1, baseline_act: 10, now_act: 5,
    days_inactive: 12, care_contacts: 0, faults: 1, status: "unclassified", reason: null,
  },
  {
    id: "LR-08222", segment: "Home fix", region: "Monrovia", tier: "High",
    tenure: 40, baseline_gb: 4.2, now_gb: 3.1, baseline_act: 11, now_act: 8,
    days_inactive: 20, care_contacts: 1, faults: 0, status: "awaiting_reply", reason: null,
  },
  {
    id: "LR-00714", segment: "Home fix", region: "Ganta", tier: "Medium",
    tenure: 45, baseline_gb: 2.8, now_gb: 2.0, baseline_act: 8, now_act: 6,
    days_inactive: 18, care_contacts: 1, faults: 2, status: "awaiting_reply", reason: null,
  },
  {
    // The pilot case that reached step 5 with a negative result.
    id: "LR-10168", segment: "Android top-up", region: "Monrovia", tier: "Medium",
    tenure: 22, baseline_gb: 3.4, now_gb: 2.3, baseline_act: 9, now_act: 6,
    days_inactive: 11, care_contacts: 2, faults: 4, status: "action_done",
    reason: "network_quality", confidence: 0.63,
  },
];

/* ------------------------------------------------------------------ */
/* Build the 45-case pilot sample                                       */
/* ------------------------------------------------------------------ */
/** Weekly GB series whose baseline/current means hit the monthly targets exactly. */
function weeklySeries(baselineGb, nowGb) {
  const weeks = [];
  for (let i = 0; i < 12; i++) {
    const target = i < 8 ? baselineGb : nowGb;
    const noise = 1 + (rand() - 0.5) * 0.22;
    weeks.push(round((target / 4.345) * noise, 2));
  }
  // Calibrate so the derived monthly figures round to the quoted targets.
  for (const [lo, hi, target] of [[0, 8, baselineGb], [8, 12, nowGb]]) {
    const slice = weeks.slice(lo, hi);
    const want = target / 4.345;
    const now = slice.reduce((s, v) => s + v, 0) / slice.length;
    const k = want / now;
    for (let i = lo; i < hi; i++) weeks[i] = round(weeks[i] * k, 2);
  }
  return weeks;
}

const customers = [];
const activity = {};
const feedback = {};

function addCustomer(spec) {
  const weeks = weeklySeries(spec.baseline_gb, spec.now_gb);
  const id = spec.id;
  customers.push({
    id,
    segment: spec.segment,
    region: spec.region,
    value_tier: spec.tier,
    tenure_months: spec.tenure,
    // Masked per the honesty rule: +231 77• ••• 417
    masked_msisdn: `+231 77• ••• ${String(100 + Math.floor(rand() * 900))}`,
    days_since_last_activity: spec.days_inactive,
    care_contacts_30d: spec.care_contacts,
    network_fault_reports_30d: spec.faults ?? int(0, 2),
    baseline_activations_per_month: spec.baseline_act,
    activations_per_month_now: spec.now_act,
    queue_status: spec.status,
    flagged_at: stamp(RUN_DATE - spec.days_inactive * DAY),
  });
  activity[id] = {
    weeks: WEEKS.map((week_start, i) => ({ week_start, gb: weeks[i] })),
    baseline_window_weeks: 8,
    current_window_weeks: 4,
  };
  const reasonId = spec.reason;
  const askedAt = RUN_DATE - Math.max(1, spec.days_inactive - 6) * DAY;
  feedback[id] = reasonId
    ? {
        case_id: id,
        asked_at: stamp(askedAt),
        ...ASK,
        reply_received: true,
        replied_at: stamp(askedAt + int(6, 40) * 3600000),
        classified_by: "analyst.hui",
        classified_at: stamp(askedAt + int(42, 70) * 3600000),
        verbatim: VERBATIMS[reasonId][0],
      }
    : {
        case_id: id,
        asked_at: stamp(askedAt),
        ...ASK,
        reply_received: false,
        replied_at: null,
        classified_by: null,
        classified_at: null,
        verbatim: null,
      };
}

ANCHORS.forEach(addCustomer);

const STATUSES = ["new", "awaiting_reply", "unclassified", "action_done"];
const FILLER = ANCHORS.length;
for (let i = FILLER; i < 45; i++) {
  const baseline = round(1.2 + rand() * 5.5, 1);
  // Capped so no generated case can out-score the LR-20417 worked example.
  const drop = 0.18 + rand() * 0.4;
  const hasReply = rand() > 0.32;
  const reason = hasReply
    ? pick(["affordability", "affordability", "reduced_need", "network_quality", "activation_difficulty", "competitor", "unknown"])
    : null;
  addCustomer({
    id: `LR-${int(20000, 29999)}`,
    segment: pick(SEGMENTS),
    region: pick(REGIONS),
    tier: pick(TIERS),
    tenure: int(3, 42),
    baseline_gb: baseline,
    now_gb: round(baseline * (1 - drop), 1),
    baseline_act: int(4, 20),
    now_act: int(1, 12),
    days_inactive: int(4, 26),
    care_contacts: int(0, 3),
    status: pick(STATUSES),
    reason,
    confidence: reason ? round(0.55 + rand() * 0.35, 2) : null,
  });
}
// IDs must be unique; de-duplicate by renumbering collisions.
const seen = new Set();
customers.forEach((c, i) => {
  if (seen.has(c.id)) c.id = `LR-${30000 + i}`;
  seen.add(c.id);
});

/* ------------------------------------------------------------------ */
/* Interventions + outcomes (the 6 treated, 8 matched controls)         */
/* ------------------------------------------------------------------ */
const treatedIds = ["LR-10168", "LR-19076", ...customers.slice(8, 12).map((c) => c.id)].slice(0, 6);
const interventions = [];
const outcomes = [];

treatedIds.forEach((case_id, i) => {
  const anchor = ANCHORS.find((a) => a.id === case_id);
  const actionId = anchor?.reason === "network_quality" ? "care_bridge" : "daily_mini_600";
  const sentAt = RUN_DATE - (26 - i * 3) * DAY;
  interventions.push({
    id: `INT-${4100 + i}`,
    case_id,
    action_id: actionId,
    channel: ACTIONS.find((a) => a.id === actionId).channel,
    drafted_at: stamp(sentAt - 3 * 3600000),
    approved_by: "analyst.hui",
    approved_at: stamp(sentAt - 2 * 3600000),
    sent_at: stamp(sentAt),
    delivered: i !== 3,
    click_recorded: i % 3 === 0,
  });
  // LR-10168 is the documented negative result: usage stayed below baseline.
  const recovered = case_id !== "LR-10168" && (i === 1 || i === 4);
  const c = customers.find((x) => x.id === case_id);
  outcomes.push({
    intervention_id: `INT-${4100 + i}`,
    case_id,
    window_days: 30,
    measured_at: stamp(sentAt + 30 * DAY),
    activations_after: recovered
      ? Math.round(c.baseline_activations_per_month * 0.95)
      : Math.round(c.baseline_activations_per_month * 0.31),
    baseline_activations: c.baseline_activations_per_month,
    recovered,
    note: recovered
      ? "Usage returned within 5% of the customer's own baseline."
      : "Usage stayed near the flagged level through the 30-day window.",
  });
});

const controlCohort = Array.from({ length: 8 }, (_, i) => ({
  id: `CTL-${900 + i}`,
  matched_case_id: customers[12 + i]?.id ?? null,
  tolerance_pct: 5,
  window_days: 30,
  recovered: i === 0 || i === 4,
}));

// The pilot cohort was worked earlier than the current detection run, so each
// executed case gets a self-consistent history: flag → ask → reply → classify
// → draft → approve → send → 30-day outcome, all in that order and all closed.
{
  const PILOT_START = Date.parse("2026-09-22T08:00:00Z");
  interventions.forEach((it, i) => {
    const sentAt = PILOT_START + i * 2 * DAY;
    it.sent_at = stamp(sentAt);
    it.drafted_at = stamp(sentAt - 3 * 3600000);
    it.approved_at = stamp(sentAt - 2 * 3600000);
    const oc = outcomes.find((o) => o.intervention_id === it.id);
    if (oc) oc.measured_at = stamp(sentAt + oc.window_days * DAY);

    const cust = customers.find((c) => c.id === it.case_id);
    if (cust) cust.flagged_at = stamp(sentAt - 8 * DAY);
    const fb = feedback[it.case_id];
    if (fb) {
      fb.asked_at = stamp(sentAt - 7 * DAY);
      if (fb.reply_received) {
        fb.replied_at = stamp(sentAt - 7 * DAY + 30 * 3600000);
        fb.classified_at = stamp(sentAt - 7 * DAY + 70 * 3600000);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Human review agreement (step 6)                                      */
/* ------------------------------------------------------------------ */
const humanReview = [
  { case_id: "LR-20417", verbatim: VERBATIMS.affordability[0], ai_reason: "affordability", ai_confidence: 0.86, analyst_reason: "affordability", agreed: true, reviewed_at: stamp(RUN_DATE - 4 * DAY) },
  { case_id: "LR-19076", verbatim: VERBATIMS.affordability[1], ai_reason: "affordability", ai_confidence: 0.82, analyst_reason: "affordability", agreed: true, reviewed_at: stamp(RUN_DATE - 3 * DAY) },
  { case_id: "LR-21148", verbatim: VERBATIMS.network_quality[0], ai_reason: "network_quality", ai_confidence: 0.71, analyst_reason: "network_quality", agreed: true, reviewed_at: stamp(RUN_DATE - 2 * DAY) },
];

/* ------------------------------------------------------------------ */
/* Campaign history (pre-pilot, drives expected recovery)               */
/* ------------------------------------------------------------------ */
const campaignHistory = [
  { reason: "affordability", action_id: "daily_mini_600", recovery_rate: 0.62, n: 214 },
  { reason: "affordability", action_id: "monthly_mini_2g", recovery_rate: 0.41, n: 168 },
  { reason: "affordability", action_id: "competitor_match", recovery_rate: 0.35, n: 52 },
  { reason: "network_quality", action_id: "care_bridge", recovery_rate: 0.44, n: 96 },
  { reason: "activation_difficulty", action_id: "ussd_guide", recovery_rate: 0.52, n: 131 },
  { reason: "reduced_need", action_id: "reduced_need_checkin", recovery_rate: 0.28, n: 74 },
  { reason: "competitor", action_id: "competitor_match", recovery_rate: 0.3, n: 61 },
  { reason: "unknown", action_id: "reduced_need_checkin", recovery_rate: 0.22, n: 40 },
];

/* ------------------------------------------------------------------ */
/* Detection run population (the wide screen, not the 45-case sample)   */
/* ------------------------------------------------------------------ */
const detectionRun = {
  run_id: "RUN-2026-10-28-01",
  run_at: stamp(RUN_DATE),
  window_days: 28,
  subscribers_scored: 41820,
  flagged_total: 1284,
  risk_bands: { high: 312, medium: 541, low: 431 },
  awaiting_reply: 463,
  ready_for_action: 218,
  actions_awaiting_approval: 47,
  minimum_days_inactive: 19,
  pilot_sample_size: customers.length,
  pilot_window_days: 21,
  churned_case_ids: ["LR-00714", customers[14].id, customers[23].id],
  margin_impact_change_pct: 0,
  approvals_this_week: 2,
  note: "Population counts are synthetic. The workbench reviews the pilot sample.",
};

/* ------------------------------------------------------------------ */
/* Write the datasets                                                   */
/* ------------------------------------------------------------------ */
const files = {
  "customers.json": { generated_from_seed: 20261028, customers },
  "bundle-activity.json": { generated_from_seed: 20261028, activity },
  "feedback.json": { generated_from_seed: 20261028, ask_template: ASK, feedback },
  "reason-taxonomy.json": { reasons: REASONS },
  "action-library.json": { actions: ACTIONS },
  "campaign-history.json": { campaigns: campaignHistory },
  "interventions.json": { interventions },
  "outcomes.json": { outcomes, control_cohort: controlCohort },
  "human-review.json": { reviews: humanReview },
  "detection-run.json": detectionRun,
};

for (const [name, payload] of Object.entries(files)) {
  writeFileSync(join(OUT, name), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

console.log(`Wrote ${Object.keys(files).length} datasets to data/`);
console.log(`  customers: ${customers.length}`);
console.log(`  interventions: ${interventions.length}, controls: ${controlCohort.length}`);
