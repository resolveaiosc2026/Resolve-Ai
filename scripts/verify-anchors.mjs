/**
 * Resolve AI — anchor check.
 *
 * Runs the same analytics module the browser runs, against the generated
 * datasets, and asserts the figures quoted in the written case notes.
 *
 *   node scripts/verify-anchors.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyReason,
  detectSummary,
  measureView,
  priorityQueue,
  recommendAction,
  reportView,
  usageView,
  priorityView,
} from "../lib/analytics.ts";
import { answer } from "../lib/copilot.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(readFileSync(join(ROOT, "data", name), "utf8"));

const data = {
  customers: read("customers.json").customers,
  activity: read("bundle-activity.json").activity,
  feedback: read("feedback.json").feedback,
  reasons: read("reason-taxonomy.json").reasons,
  actions: read("action-library.json").actions,
  campaigns: read("campaign-history.json").campaigns,
  interventions: read("interventions.json").interventions,
  outcomes: read("outcomes.json").outcomes,
  controls: read("outcomes.json").control_cohort,
  reviews: read("human-review.json").reviews,
  run: read("detection-run.json"),
};

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
};

const CASE = "LR-20417";
const customer = data.customers.find((c) => c.id === CASE);
const usage = usageView(customer, data.activity[CASE]);
const priority = priorityView(customer, usage);
const classification = classifyReason(data, CASE);
const recommendation = recommendAction(data, CASE, classification);
const queue = priorityQueue(data);
const summary = detectSummary(data);
const measure = measureView(data, "LR-10168");
const report = reportView(data);

console.log("\n--- Step 1 Detect -------------------------------------------");
check("baseline GB/month", usage.baselineGb, 6.5);
check("this month GB/month", usage.currentGb, 2.0);
check("change", usage.changePct, -69);
check("priority total", priority.total, 87);
check("priority band", priority.band, "high");
console.log("      contributions:", priority.contributions.map((c) => `${c.label} ${c.points}/${c.max}`).join(" · "));
check("flagged population", summary.flagged, 1284);
check("band sum = flagged", summary.bands.reduce((s, b) => s + b.count, 0), summary.flagged);
check("queue is sorted desc", queue.slice(0, 6).map((r) => r.priority.total), [...queue.slice(0, 6).map((r) => r.priority.total)].sort((a, b) => b - a));
check("top of queue", queue[0].customer.id, CASE);
console.log("      top 6:", queue.slice(0, 6).map((r) => `${r.customer.id} ${r.priority.total} (${r.usage.changePct}%)`).join(" · "));

console.log("\n--- Step 2 Understand ---------------------------------------");
check("status", classification.status, "classified");
check("primary reason", classification.primary?.id, "affordability");
check("confidence clears the 80% gate", classification.primary.confidence >= 0.8, true);
check("distribution sums to 1", Math.round([...classification.alternatives, classification.primary].reduce((s, r) => s + r.confidence, 0) * 100) / 100, 1);
console.log(`      ${classification.primary.label} ${(classification.primary.confidence * 100).toFixed(0)}% · ` +
  classification.alternatives.map((a) => `${a.label} ${(a.confidence * 100).toFixed(0)}%`).join(" · "));

console.log("\n--- Step 3 Recommend ----------------------------------------");
check("recommended action", recommendation.recommended?.action.id, "daily_mini_600");
check("predicted recovery", Math.round(recommendation.recommended.predictedRecovery * 100), 62);
check("all eligibility checks pass", recommendation.recommended.checks.every((c) => c.passed), true);
check("runner-up is the monthly bundle", recommendation.candidates[1]?.action.id, "monthly_mini_2g");
check("call-centre bridge rejected", recommendation.notRecommended.some((c) => c.action.id === "care_bridge"), true);
console.log("      rejected:", recommendation.notRecommended.map((c) => `${c.action.short_name} — ${c.rejectedReason}`).join(" · "));

console.log("\n--- Step 5 Measure ------------------------------------------");
check("LR-10168 verdict", measure.verdict, "not_recovered");
check("timeline events", measure.events.length >= 8, true);
check("vs baseline", measure.vsBaselinePct, -67);
const times = measure.events.map((e) => Date.parse(e.at.replace(" ", "T")));
check("timeline is in order", times.every((t, i) => i === 0 || t >= times[i - 1]), true);
check("outcome window closed before today", Date.parse(measure.outcome.measured_at.replace(" ", "T")) < Date.now(), true);
console.log("      timeline:", measure.events.map((e) => `${e.at} ${e.label}`).join(" → "));

console.log("\n--- Step 6 Report -------------------------------------------");
check("pilot sample", report.flagged, 45);
check("treated", `${report.treated.recovered}/${report.treated.n}`, "2/6");
check("control", `${report.control.recovered}/${report.control.n}`, "2/8");
check("human agreement", `${report.agreement.agreed}/${report.agreement.reviewed}`, "3/3");
console.log(`      treated ${(report.treated.rate * 100).toFixed(0)}% [${(report.treated.ci.low * 100).toFixed(0)}–${(report.treated.ci.high * 100).toFixed(0)}] vs control ${(report.control.rate * 100).toFixed(0)}% [${(report.control.ci.low * 100).toFixed(0)}–${(report.control.ci.high * 100).toFixed(0)}], difference ${report.differencePoints} points, overlap=${report.intervalsOverlap}`);
console.log("      reasons:", report.reasons.map((r) => `${r.label} ${r.pct}%`).join(" · "));

console.log("\n--- Executive Copilot --------------------------------------");
const QUESTIONS = [
  "How many customers are at risk?",
  "Which segment needs the most attention?",
  "Why are customers disengaging?",
  "Is the pilot working?",
  "What should we do about affordability?",
  "Tell me about LR-20417",
  "How confident are we in the reasons?",
  "What is the weather in Monrovia?",
];
let answered = 0;
for (const q of QUESTIONS) {
  const a = answer(q, data);
  const hasNumber = /\d/.test(a.answer);
  const known = a.intent !== "unknown";
  if (known && hasNumber && a.facts.length > 0) answered++;
  console.log(`  ${known ? "ANSWER" : "REFUSE"} [${a.intent}] ${q}`);
  console.log(`         ${a.answer.slice(0, 110)}… (${a.facts.length} facts)`);
}
check("useful answers (Definition of Done: >= 5)", answered >= 5, true);
check("off-topic question is refused, not guessed", answer("What is the weather in Monrovia?", data).intent, "unknown");
check("confidence question routes to trust, not reasons", answer("How confident are we in the reasons?", data).intent, "trust");
check("every answer cites its source", answer("Is the pilot working?", data).facts.every((f) => f.source.length > 0), true);

console.log(`\n${failures === 0 ? "All anchor checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
