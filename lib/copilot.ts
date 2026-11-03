/**
 * Resolve AI — Executive Copilot.
 *
 * The copilot is the explanation layer, not the source of truth.
 * Every answer is built in three steps, in this order:
 *
 *   1. match the question to an intent (keyword rules, no model),
 *   2. read the facts from the same deterministic aggregates the dashboard
 *      renders (lib/analytics.ts over the synthetic datasets),
 *   3. compose a sentence from those facts only.
 *
 * Nothing is invented: each fact carries the dataset or function it came
 * from, and the screen shows that provenance next to the answer. Swapping a
 * generative model in later would only change step 3 — the numbers would
 * still come from step 2.
 */
import {
  classifyReason,
  detectSummary,
  priorityQueue,
  recommendAction,
  reportView,
} from "./analytics.ts";
import type { Datasets } from "./analytics.ts";

export interface Fact {
  label: string;
  value: string;
  source: string;
}

export interface CopilotAnswer {
  intent: string;
  question: string;
  answer: string;
  facts: Fact[];
  caveat?: string;
  followUps: string[];
}

export const SUGGESTED_QUESTIONS = [
  "How many customers are at risk?",
  "Which segment needs the most attention?",
  "Why are customers disengaging?",
  "Is the pilot working?",
  "What should we do about affordability?",
  "Tell me about LR-20417",
];

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

export function answer(questionRaw: string, data: Datasets): CopilotAnswer {
  const q = questionRaw.toLowerCase().trim();
  const base = { question: questionRaw.trim(), intent: "", answer: "", facts: [] as Fact[], followUps: [] as string[] };
  if (!q) return { ...base, intent: "empty", answer: "Ask a question about the queue, a segment, a reason, or the pilot result.", followUps: SUGGESTED_QUESTIONS.slice(0, 3) };

  const queue = priorityQueue(data);
  const summary = detectSummary(data);
  const report = reportView(data);

  // 1 — one customer ------------------------------------------------------
  const idMatch = questionRaw.toUpperCase().match(/LR-\d+/);
  if (idMatch || has(q, "this customer", "customer 360")) {
    const customer = idMatch
      ? data.customers.find((c) => c.id === idMatch[0])
      : queue[0].customer;
    if (customer) {
      const row = queue.find((r) => r.customer.id === customer.id)!;
      const cls = classifyReason(data, customer.id);
      const rec = recommendAction(data, customer.id, cls);
      const saved = data.interventions.find((i) => i.case_id === customer.id);
      return {
        intent: "customer",
        question: questionRaw.trim(),
        answer:
          `${customer.id} is a ${customer.segment} in ${customer.region}, ` +
          `${customer.tenure_months} months on the network. Their bundle volume fell from ` +
          `${row.usage.baselineGb.toFixed(1)} to ${row.usage.currentGb.toFixed(1)} GB a month ` +
          `(${row.usage.changePct}%), which is a priority score of ${row.priority.total}. ` +
          (cls.primary
            ? `The likely reason is ${cls.primary.label.toLowerCase()} at ${Math.round(cls.primary.confidence * 100)}% confidence, ` +
              `so ${rec.recommended ? `${rec.recommended.action.name} is suggested` : "no action clears eligibility yet"}.`
            : "There is no reply yet, so no reason is attached and nothing is suggested."),
        facts: [
          { label: "Baseline", value: `${row.usage.baselineGb.toFixed(1)} GB / month`, source: "bundle-activity.json · usageView()" },
          { label: "Last 4 weeks", value: `${row.usage.currentGb.toFixed(1)} GB / month`, source: "bundle-activity.json · usageView()" },
          { label: "Priority", value: `${row.priority.total} (${row.priority.band})`, source: "customers.json · priorityView()" },
          { label: "Top score driver", value: row.priority.contributions.slice().sort((a, b) => b.points - a.points)[0].label, source: "priorityView() contributions" },
          { label: "Likely reason", value: cls.primary ? `${cls.primary.label} ${Math.round(cls.primary.confidence * 100)}%` : "Awaiting reply", source: "feedback.json · classifyReason()" },
          { label: "Suggested action", value: rec.recommended?.action.name ?? "None yet", source: "action-library.json · recommendAction()" },
          { label: "Action history", value: saved ? `1 sent ${saved.sent_at.slice(0, 10)}` : "None sent", source: "interventions.json" },
        ],
        caveat: "The reason is a classification of the customer's own words, not a confirmed cause.",
        followUps: ["Is the pilot working?", "What should we do about affordability?"],
      };
    }
  }

  // 2 — pilot result ------------------------------------------------------
  if (has(q, "pilot", "working", "result", "did it work", "effect", "lift", "roi")) {
    return {
      intent: "pilot",
      question: questionRaw.trim(),
      answer:
        `Too early to call. ${report.treated.recovered} of ${report.treated.n} treated customers recovered ` +
        `(${Math.round(report.treated.rate * 100)}%), against ${report.control.recovered} of ${report.control.n} matched ` +
        `controls (${Math.round(report.control.rate * 100)}%) — a difference of ${report.differencePoints} points. ` +
        (report.intervalsOverlap
          ? "The 95% intervals overlap, so this pilot cannot separate a real effect from noise yet."
          : "The intervals do not overlap, but the sample is still too small for a budget decision."),
      facts: [
        { label: "Treated", value: `${report.treated.recovered}/${report.treated.n} (${Math.round(report.treated.ci.low * 100)}–${Math.round(report.treated.ci.high * 100)}%)`, source: "outcomes.json" },
        { label: "Control", value: `${report.control.recovered}/${report.control.n} (${Math.round(report.control.ci.low * 100)}–${Math.round(report.control.ci.high * 100)}%)`, source: "outcomes.json · control cohort" },
        { label: "Difference", value: `${report.differencePoints} points`, source: "reportView() · Wilson interval" },
        { label: "Pilot window", value: `${report.windowDays} days`, source: "detection-run.json" },
      ],
      caveat:
        "These recovery rates are simulated placeholders. Real churn validation needs Orange historical outcomes, which we do not have.",
      followUps: ["Why are customers disengaging?", "How many customers are at risk?"],
    };
  }

  // 3 — population --------------------------------------------------------
  if (has(q, "how many", "at risk", "flagged", "population", "volume", "size")) {
    return {
      intent: "population",
      question: questionRaw.trim(),
      answer:
        `${summary.flagged.toLocaleString()} subscribers were flagged in run ${data.run.run_id}, ` +
        `out of ${data.run.subscribers_scored.toLocaleString()} scored. ${summary.bands[0].count.toLocaleString()} are high risk ` +
        `(priority 75 and above), ${summary.awaitingReply.toLocaleString()} are waiting on a reply, and ` +
        `${summary.readyForAction} are ready for an action. The workbench reviews a ${report.flagged}-case pilot sample.`,
      facts: [
        { label: "Scored", value: data.run.subscribers_scored.toLocaleString(), source: "detection-run.json" },
        { label: "Flagged", value: summary.flagged.toLocaleString(), source: "detection-run.json" },
        { label: "High risk", value: summary.bands[0].count.toLocaleString(), source: "detection-run.json risk bands" },
        { label: "Awaiting reply", value: summary.awaitingReply.toLocaleString(), source: "detection-run.json" },
        { label: "Ready for action", value: String(summary.readyForAction), source: "detection-run.json" },
      ],
      followUps: ["Which segment needs the most attention?", "Is the pilot working?"],
    };
  }

  // 4 — segment -----------------------------------------------------------
  if (has(q, "segment", "which group", "worst", "where should", "focus", "attention")) {
    const bySegment = new Map<string, { n: number; total: number; high: number }>();
    for (const r of queue) {
      const g = bySegment.get(r.customer.segment) ?? { n: 0, total: 0, high: 0 };
      g.n++;
      g.total += r.priority.total;
      if (r.priority.band === "high") g.high++;
      bySegment.set(r.customer.segment, g);
    }
    const ranked = [...bySegment.entries()]
      .filter(([, g]) => g.n >= 3)
      .map(([segment, g]) => ({ segment, n: g.n, mean: Math.round(g.total / g.n), high: g.high }))
      // Exposure first: a segment with more high-risk cases matters more than a
      // small group with a flattering average.
      .sort((a, b) => b.high - a.high || b.mean - a.mean || b.n - a.n);
    const top = ranked[0];
    const next = ranked[1];
    return {
      intent: "segment",
      question: questionRaw.trim(),
      answer:
        `${top.segment} needs the most attention: ${top.n} flagged cases, ${top.high} of them in the ` +
        `high-risk band, mean priority ${top.mean}. Next is ${next?.segment ?? "—"} with ` +
        `${next?.high ?? 0} high-risk cases. This ranks the ${report.flagged}-case pilot sample only, ` +
        `not the whole subscriber base.`,
      facts: ranked.slice(0, 4).map((s) => ({
        label: s.segment,
        value: `${s.n} cases · mean ${s.mean} · ${s.high} high`,
        source: "priorityQueue() over customers.json",
      })),
      caveat: "Mean priority is a sample statistic over 45 pilot cases; segment sizes in production differ.",
      followUps: ["Why are customers disengaging?", "Tell me about LR-20417"],
    };
  }

  // 5 — reasons -----------------------------------------------------------
  // "How confident are we in the reasons?" is a question about trust, not about
  // the distribution, so the confidence wording wins.
  if (!has(q, "confiden", "sure", "accurate", "trust", "agree") && has(q, "why", "reason", "cause", "disengag", "leaving", "churn")) {
    const top = report.reasons[0];
    return {
      intent: "reasons",
      question: questionRaw.trim(),
      answer:
        `Across the ${report.classified} cases with a customer reply, ${top.label.toLowerCase()} is the most common ` +
        `likely reason (${top.count} cases, ${top.pct}%). ${report.awaitingReply} cases have no reply yet, so they are ` +
        `counted separately rather than pushed into a reason. These are classifications of what customers wrote, ` +
        `not confirmed causes.`,
      facts: report.reasons.map((r) => ({ label: r.label, value: `${r.count} cases (${r.pct}%)`, source: "feedback.json · classifyReason()" })),
      caveat: `${report.awaitingReply} unanswered cases stay unclassified. Silence is not evidence of a reason.`,
      followUps: ["What should we do about affordability?", "Is the pilot working?"],
    };
  }

  // 6 — action for a reason ----------------------------------------------
  if (has(q, "what should we do", "action", "offer", "affordab", "network quality", "recommend for")) {
    const reason =
      (q.includes("network") ? "network_quality" :
       q.includes("activation") ? "activation_difficulty" :
       q.includes("competitor") ? "competitor" :
       q.includes("need") ? "reduced_need" : "affordability") as string;
    const label = data.reasons.find((r) => r.id === reason)?.label ?? "Affordability";
    const rows = data.campaigns
      .filter((c) => c.reason === reason)
      .sort((a, b) => b.recovery_rate - a.recovery_rate);
    const best = rows[0];
    const action = data.actions.find((a) => a.id === best?.action_id);
    const eligibleCount = queue.filter((r) => {
      const cls = classifyReason(data, r.customer.id);
      if (cls.primary?.id !== reason) return false;
      return recommendAction(data, r.customer.id, cls).recommended !== null;
    }).length;
    return {
      intent: "action",
      question: questionRaw.trim(),
      answer:
        `For ${label.toLowerCase()}, the strongest option in campaign history is ` +
        `${action?.name ?? "—"} at ${Math.round((best?.recovery_rate ?? 0) * 100)}% expected recovery ` +
        `(n=${best?.n}). ${eligibleCount} cases in the current queue carry this reason and clear eligibility, ` +
        `so each one still needs a named analyst to approve it before anything is sent.`,
      facts: rows.map((c) => ({
        label: data.actions.find((a) => a.id === c.action_id)?.short_name ?? c.action_id,
        value: `${Math.round(c.recovery_rate * 100)}% (n=${c.n})`,
        source: "campaign-history.json",
      })),
      caveat: "Recovery rates are placeholders from simulated campaigns, not measured Orange campaign results.",
      followUps: ["How many customers are at risk?", "Is the pilot working?"],
    };
  }

  // 7 — approvals / workload ---------------------------------------------
  if (has(q, "approv", "pending", "queue", "workload", "how long", "backlog")) {
    const awaiting = queue.filter((r) => r.status === "new").length;
    return {
      intent: "approvals",
      question: questionRaw.trim(),
      answer:
        `${data.run.actions_awaiting_approval} actions are waiting for approval across the flagged population, ` +
        `and ${awaiting} of the ${report.flagged} pilot cases are newly flagged and unopened. ` +
        `${data.interventions.length} actions have already been approved and executed in this pilot. ` +
        `Nothing in Resolve AI sends without a human sign-off.`,
      facts: [
        { label: "Awaiting approval", value: String(data.run.actions_awaiting_approval), source: "detection-run.json" },
        { label: "New in pilot queue", value: String(awaiting), source: "customers.json queue_status" },
        { label: "Executed in pilot", value: String(data.interventions.length), source: "interventions.json" },
      ],
      followUps: ["Which segment needs the most attention?", "Is the pilot working?"],
    };
  }

  // 8 — trust in the model ------------------------------------------------
  if (has(q, "sure", "confiden", "accurate", "trust", "agree", "verify", "correct")) {
    const low = queue.filter((r) => {
      const cls = classifyReason(data, r.customer.id);
      return cls.primary && cls.primary.confidence < 0.8;
    }).length;
    return {
      intent: "trust",
      question: questionRaw.trim(),
      answer:
        `Analysts reviewed ${report.agreement.reviewed} classifications and agreed with ${report.agreement.agreed} ` +
        `(${report.agreement.pct}%). That is a sample of ${report.agreement.reviewed} cases, not an accuracy measure. ` +
        `${low} classified cases in the queue sit below the 80% confidence gate, and those route to a human before ` +
        `any action is suggested.`,
      facts: [
        { label: "Reviewed", value: `${report.agreement.reviewed} cases`, source: "human-review.json" },
        { label: "Agreed", value: `${report.agreement.agreed}/${report.agreement.reviewed}`, source: "human-review.json" },
        { label: "Below the gate", value: `${low} cases`, source: "classifyReason() confidence < 0.8" },
      ],
      caveat: "Agreement on three cases says the review loop exists. It does not say the classifier is accurate.",
      followUps: ["Why are customers disengaging?", "Tell me about LR-20417"],
    };
  }

  // 9 — honest refusal -----------------------------------------------------
  return {
    intent: "unknown",
    question: questionRaw.trim(),
    answer:
      "I only answer from the data loaded in this workbench, and I did not find a match for that question. " +
      "I can talk about the flagged population, a segment, the likely reasons, an action for a reason, a single case, the pilot result, or the approval queue.",
    facts: [
      { label: "Datasets loaded", value: "10 synthetic files", source: "data/" },
      { label: "Cases in scope", value: String(report.flagged), source: "customers.json" },
    ],
    caveat: "No external model is called, so the copilot cannot guess outside these aggregates.",
    followUps: SUGGESTED_QUESTIONS.slice(0, 4),
  };
}
