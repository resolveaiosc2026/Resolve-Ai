/**
 * `npm run db:verify`: checks the seeded database against the anchor figures the
 * frontend quotes (frontend/scripts/verify-anchors.mjs), plus generator parity.
 * Exit code 0 only when every check passes.
 */
import { TransactionRollbackError, and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { detectCustomer, detectionWindows } from '../../modules/detect/detection.compute.js';
import { loadDetectionSignals } from '../../modules/detect/detect.repository.js';
import { executeDetection, type RunSummary } from '../../modules/detect/detect.service.js';
import { summarizeUsage } from '../../modules/detect/scoring.js';
import { applyApprove } from '../../modules/act/act.service.js';
import {
  applyAdvance,
  applyOutcome,
  measureViewWith,
} from '../../modules/measure/measure.service.js';
import {
  applyPersistRecommendation,
  recommendationViewWith,
} from '../../modules/recommend/recommend.service.js';
import { summaryWith } from '../../modules/report/report.service.js';
import {
  applyHandOff,
  applyReply,
  prepareReply,
} from '../../modules/understand/channels.service.js';
import {
  applyEvidence,
  getReasons,
  getReasonsWith,
} from '../../modules/understand/understand.service.js';
import { closeDatabase, db } from '../client.js';
import {
  campaignHistory,
  cases,
  customerFeedback,
  customerMetrics,
  customerWeeklyUsage,
  customers,
  detectionRuns,
  feedbackRequests,
  interventions,
  outcomes,
  reasonClassifications,
  recommendations,
} from '../schema/index.js';
import { checkParity, frontendDataAvailable, type CheckResult } from './parity.js';
import { buildPilotDataset } from './pilot-dataset.js';

const HERO = 'LR-20417';
const NEGATIVE_CASE = 'LR-10168';

const results: CheckResult[] = [];
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(
    ok
      ? { label, ok }
      : {
          label,
          ok,
          detail: `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
        },
  );
}

async function caseOf(customerId: string) {
  const [row] = await db.select().from(cases).where(eq(cases.customerId, customerId)).limit(1);
  if (!row) throw new Error(`No case for ${customerId}`);
  return row;
}

async function main(): Promise<void> {
  const data = buildPilotDataset();

  // 1. Parity with the frontend's generated JSON (when the folder is present).
  if (frontendDataAvailable()) results.push(...checkParity(data));
  else results.push({ label: 'parity (skipped: frontend/data not found)', ok: true });

  // 2. Sample size and queue.
  check('customers', await db.$count(customers), 45);
  check('cases', await db.$count(cases), 45);
  const statusRows = await db
    .select({ status: cases.queueStatus, n: sql<number>`count(*)::int` })
    .from(cases)
    .groupBy(cases.queueStatus)
    .orderBy(cases.queueStatus);
  check('queue statuses', Object.fromEntries(statusRows.map((r) => [r.status, r.n])), {
    new: 13,
    awaiting_reply: 9,
    unclassified: 5,
    action_done: 18,
  });

  // 3. LR-20417 usage, activations, priority.
  const weeks = await db
    .select({ gb: customerWeeklyUsage.dataGb })
    .from(customerWeeklyUsage)
    .where(eq(customerWeeklyUsage.customerId, HERO))
    .orderBy(asc(customerWeeklyUsage.weekStart));
  const usage = summarizeUsage(weeks.map((w) => w.gb));
  check(`${HERO} baseline GB/month`, usage.baselineGb, 6.5);
  check(`${HERO} current GB/month`, usage.currentGb, 2.0);
  check(`${HERO} change %`, usage.changePct, -69);

  const metrics = await db
    .select()
    .from(customerMetrics)
    .where(eq(customerMetrics.customerId, HERO));
  const metric = (period: 'baseline' | 'current') => metrics.find((m) => m.period === period);
  check(`${HERO} baseline activations/month`, metric('baseline')?.activations, 18);
  check(`${HERO} current activations/month`, metric('current')?.activations, 6);
  check(`${HERO} days since last activity`, metric('current')?.daysSinceLastActivity, 22);

  const hero = await caseOf(HERO);
  check(`${HERO} priority total`, hero.priorityScore, 87);
  check(`${HERO} priority band`, hero.priorityBand, 'high');
  const [top] = await db
    .select({ customerId: cases.customerId })
    .from(cases)
    .orderBy(desc(cases.priorityScore), asc(cases.customerId))
    .limit(1);
  check('top of queue', top?.customerId, HERO);

  // 4. Activation metrics reproduce the prototype for every customer.
  const allCurrent = await db
    .select()
    .from(customerMetrics)
    .where(eq(customerMetrics.period, 'current'));
  const allBaseline = await db
    .select()
    .from(customerMetrics)
    .where(eq(customerMetrics.period, 'baseline'));
  const mismatches = data.customers.filter((c) => {
    const cur = allCurrent.find((m) => m.customerId === c.id);
    const base = allBaseline.find((m) => m.customerId === c.id);
    return (
      cur?.activations !== c.activations_per_month_now ||
      base?.activations !== c.baseline_activations_per_month ||
      cur?.daysSinceLastActivity !== c.days_since_last_activity ||
      cur?.careContacts30d !== c.care_contacts_30d ||
      cur?.networkFaultReports30d !== c.network_fault_reports_30d
    );
  });
  check(
    'all 45: activations, days inactive, care, faults match',
    mismatches.map((c) => c.id),
    [],
  );

  // 5. LR-20417 classification.
  const [heroClass] = await db
    .select()
    .from(reasonClassifications)
    .where(eq(reasonClassifications.caseId, hero.id))
    .limit(1);
  check(`${HERO} reason`, heroClass?.reasonId, 'affordability');
  check(`${HERO} confidence ≥ 0.80`, (heroClass?.confidence ?? 0) >= 0.8, true);
  const distribution =
    (heroClass?.confidence ?? 0) +
    (heroClass?.alternatives ?? []).reduce((s, a) => s + a.confidence, 0);
  check(`${HERO} distribution sums to 1`, Math.round(distribution * 100) / 100, 1);

  // 6. Campaign history drives predicted recovery.
  const [campaign] = await db
    .select({ rate: campaignHistory.recoveryRate })
    .from(campaignHistory)
    .where(
      and(
        eq(campaignHistory.reasonId, 'affordability'),
        eq(campaignHistory.actionId, 'daily_mini_600'),
      ),
    );
  check('affordability × daily_mini_600 recovery', campaign?.rate, 0.62);

  // 7. LR-10168: negative pilot result and an ordered timeline.
  const neg = await caseOf(NEGATIVE_CASE);
  const [negOutcome] = await db
    .select()
    .from(outcomes)
    .where(and(eq(outcomes.caseId, neg.id), eq(outcomes.cohort, 'treated')));
  check(`${NEGATIVE_CASE} recovered`, negOutcome?.recovered, false);
  check(`${NEGATIVE_CASE} vs baseline %`, negOutcome?.changePct, -67);

  const [req] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.caseId, neg.id));
  const [reply] = await db
    .select()
    .from(customerFeedback)
    .where(and(eq(customerFeedback.caseId, neg.id), eq(customerFeedback.channel, 'sms')));
  const [cls] = await db
    .select()
    .from(reasonClassifications)
    .where(eq(reasonClassifications.caseId, neg.id));
  const [rec] = await db.select().from(recommendations).where(eq(recommendations.caseId, neg.id));
  const [int] = await db.select().from(interventions).where(eq(interventions.caseId, neg.id));
  const timeline = [
    neg.flaggedAt,
    req?.createdAt,
    reply?.receivedAt,
    cls?.createdAt,
    rec?.createdAt,
    int?.approvedAt,
    int?.handedOffAt,
    negOutcome?.measuredAt,
  ].map((d) => d?.getTime() ?? Number.NaN);
  check(`${NEGATIVE_CASE} timeline complete (8 events)`, timeline.every(Number.isFinite), true);
  check(
    `${NEGATIVE_CASE} timeline in order`,
    timeline.every((t, i) => i === 0 || t >= (timeline[i - 1] ?? 0)),
    true,
  );
  check(
    `${NEGATIVE_CASE} outcome window closed`,
    (negOutcome?.measuredAt.getTime() ?? Infinity) < Date.now(),
    true,
  );

  // 8. Treated vs control, human review agreement.
  const cohort = async (name: 'treated' | 'control') => {
    const rows = await db.select().from(outcomes).where(eq(outcomes.cohort, name));
    return `${rows.filter((r) => r.recovered).length}/${rows.length}`;
  };
  check('treated recovered', await cohort('treated'), '2/6');
  check('control recovered', await cohort('control'), '2/8');
  const reviewed = (await db.select().from(reasonClassifications)).filter((r) => r.reviewedBy);
  check(
    'human review agreed',
    `${reviewed.filter((r) => r.reviewedReasonId === r.reasonId).length}/${reviewed.length}`,
    '3/3',
  );

  // 9. Synthetic population figures (on the seeded run, not on later re-runs).
  const [run] = await db
    .select()
    .from(detectionRuns)
    .where(isNotNull(detectionRuns.populationSummary))
    .limit(1);
  const pop = run?.populationSummary;
  check('flagged population', pop?.flaggedTotal, 1284);
  check(
    'band sum = flagged',
    pop ? pop.riskBands.high + pop.riskBands.medium + pop.riskBands.low : null,
    1284,
  );

  // 10. F3: the live detection service reproduces every seeded case from raw data.
  if (!run) throw new Error('Seeded detection run not found');
  const asOf = run.runAt;
  const seededCases = await db.select().from(cases);
  const detections = (await loadDetectionSignals(db, detectionWindows(asOf))).map((s) =>
    detectCustomer(s, asOf),
  );
  const drift = seededCases.filter((c) => {
    const d = detections.find((x) => x.customerId === c.customerId);
    return (
      !d ||
      !d.flagged ||
      d.priority.total !== c.priorityScore ||
      d.priority.band !== c.priorityBand ||
      d.usage.changePct !== c.changePct
    );
  });
  check(
    'detection from raw data reproduces all cases',
    drift.map((c) => c.customerId),
    [],
  );

  // 11. F3: a full re-run (rolled back) updates scores but never queue status.
  const runsBefore = await db.$count(detectionRuns);
  type Snapshot = { id: string; status: string; score: number }[];
  let rerun: { summary: RunSummary; before: Snapshot; after: Snapshot } | undefined;
  const snapshot = (rows: { id: string; queueStatus: string; priorityScore: number }[]) =>
    rows
      .map((r) => ({ id: r.id, status: r.queueStatus, score: r.priorityScore }))
      .sort((a, b) => a.id.localeCompare(b.id));
  try {
    await db.transaction(async (tx) => {
      const before = snapshot(await tx.select().from(cases));
      const summary = await executeDetection(tx, asOf);
      const after = snapshot(await tx.select().from(cases));
      rerun = { summary, before, after };
      tx.rollback();
    });
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err;
  }
  check(
    're-run updates all open cases, creates none',
    [rerun?.summary.updatedCases, rerun?.summary.newCases],
    [45, 0],
  );
  check(
    're-run keeps every queue status',
    rerun?.after.map((r) => r.status),
    rerun?.before.map((r) => r.status),
  );
  check(
    're-run keeps every priority',
    rerun?.after.map((r) => r.score),
    rerun?.before.map((r) => r.score),
  );
  check('re-run rolled back (no run left behind)', await db.$count(detectionRuns), runsBefore);

  // 12. F4: evidence assessment ("Reason known?").
  const strongestOf = (v: Awaited<ReturnType<typeof getReasons>>) => v.assessment.signals[0];
  const activation = await getReasons('LR-14806');
  check(
    'LR-14806 evidence → activation_difficulty ≥ 0.80, use_evidence',
    [
      strongestOf(activation)?.reasonId,
      (strongestOf(activation)?.strength ?? 0) >= 0.8,
      activation.assessment.nextStep,
    ],
    ['activation_difficulty', true, 'use_evidence'],
  );
  const network = await getReasons('LR-00714');
  check(
    'LR-00714 evidence → network_quality ≥ 0.80, use_evidence',
    [
      strongestOf(network)?.reasonId,
      (strongestOf(network)?.strength ?? 0) >= 0.8,
      network.assessment.nextStep,
    ],
    ['network_quality', true, 'use_evidence'],
  );
  const heroView = await getReasons(HERO);
  check(
    `${HERO} view → classified affordability with reply`,
    [
      heroView.status,
      heroView.primary?.id,
      heroView.assessment.nextStep,
      heroView.feedback?.verbatim,
    ],
    ['classified', 'affordability', 'classified', 'Money hard this month. Buy small weekly.'],
  );

  // 13. F4: accepting evidence (rolled back) stores the reason and moves the case to ready.
  const classificationsBefore = await db.$count(reasonClassifications);
  let accepted: { status?: string; source?: string } = {};
  try {
    await db.transaction(async (tx) => {
      await applyEvidence(tx, 'LR-14806', 'db-verify');
      const [kase] = await tx.select().from(cases).where(eq(cases.customerId, 'LR-14806'));
      const [cls] = await tx
        .select()
        .from(reasonClassifications)
        .where(eq(reasonClassifications.caseId, kase?.id ?? ''));
      accepted = { status: kase?.queueStatus, source: cls?.source };
      tx.rollback();
    });
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err;
  }
  check('accept evidence → case ready, source evidence', accepted, {
    status: 'ready',
    source: 'evidence',
  });
  check(
    'accept evidence rolled back',
    await db.$count(reasonClassifications),
    classificationsBefore,
  );

  // 14. F6: recommendation for LR-20417 (same as the prototype's recommendAction).
  const heroRec = await recommendationViewWith(db, HERO);
  check(
    `${HERO} recommended action, recovery, checks`,
    [
      heroRec.recommended?.action.id,
      Math.round((heroRec.recommended?.predictedRecovery ?? 0) * 100),
      heroRec.recommended?.checks.every((c) => c.passed),
    ],
    ['daily_mini_600', 62, true],
  );
  check(
    `${HERO} runner-up and rejected bridge`,
    [
      heroRec.candidates[1]?.action.id,
      heroRec.notRecommended.some((c) => c.action.id === 'care_bridge'),
    ],
    ['monthly_mini_2g', true],
  );

  // 15. F8: measure view for the documented negative pilot result.
  const negView = await measureViewWith(db, NEGATIVE_CASE);
  const times = negView.events.map((e) => e.at);
  check(
    `${NEGATIVE_CASE} measure view`,
    [
      negView.verdict,
      negView.vsBaselinePct,
      negView.events.length >= 8,
      times.every((t, i) => i === 0 || t >= (times[i - 1] ?? '')),
    ],
    ['not_recovered', -67, true, true],
  );

  // 16. F9: report summary (same as the prototype's reportView; CI uses the correct Wilson formula).
  const report = await summaryWith(db);
  check(
    'report treated / control / agreement / flagged',
    [
      `${report.treated.recovered}/${report.treated.n}`,
      `${report.control.recovered}/${report.control.n}`,
      `${report.agreement.agreed}/${report.agreement.reviewed}`,
      report.flagged,
    ],
    ['2/6', '2/8', '3/3', 45],
  );

  // 17. Full loop on LR-08222, rolled back: hand-off → reply → reason → recommend → approve
  //     → simulated window → outcome → report. Keyword fallback forced (no AI dependency).
  let journey: Record<string, unknown> = {};
  try {
    await db.transaction(async (tx) => {
      const { request } = await applyHandOff(tx, 'LR-08222', {
        channel: 'voice_call',
        reviewerName: 'db-verify',
      });
      const prepared = await prepareReply(
        tx,
        request.id,
        'Money hard this month. Price too high now.',
        { useLlm: false },
      );
      await applyReply(tx, prepared, {
        text: 'Money hard this month. Price too high now.',
        simulated: true,
      });
      const reasons = await getReasonsWith(tx, 'LR-08222');
      const created = await applyPersistRecommendation(tx, 'LR-08222');
      const { interventionId } = await applyApprove(tx, created.id, { reviewerName: 'db-verify' });
      await applyAdvance(tx, interventionId, 'recover');
      const { outcome } = await applyOutcome(tx, interventionId, { reviewerName: 'db-verify' });
      const after = await summaryWith(tx);
      journey = {
        reason: reasons.primary?.id,
        classifiedBy: prepared.classification.classifiedBy,
        action: created.actionId,
        outcome: outcome.outcomeType,
        treated: `${after.treated.recovered}/${after.treated.n}`,
      };
      tx.rollback();
    });
  } catch (err) {
    if (!(err instanceof TransactionRollbackError)) throw err;
  }
  check('full loop LR-08222 (rolled back)', journey, {
    reason: 'affordability',
    classifiedBy: 'keyword_fallback',
    action: 'daily_mini_600',
    outcome: 're_engaged',
    treated: '3/7',
  });
  check('full loop rolled back (report unchanged)', (await summaryWith(db)).treated.n, 6);
}

main()
  .catch((err: unknown) => {
    results.push({
      label: 'verification run',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  })
  .finally(async () => {
    for (const r of results) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? `: ${r.detail}` : ''}`);
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exitCode = failed ? 1 : 0;
    await closeDatabase();
  });
