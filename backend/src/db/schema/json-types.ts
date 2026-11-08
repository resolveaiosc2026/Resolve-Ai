/** Shapes stored in jsonb columns. Kept in one place so services and the API share them. */

export type EligibilityRule = { code: string; label: string };

export type EligibilityCheck = EligibilityRule & { passed: boolean; detail: string };

/** One visible part of the priority score (e.g. "Usage drop: 39 of 40 points"). */
export type ScoreContribution = {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
};

export type ReasonCandidate = { reasonId: string; confidence: number };

export type EvidenceItem = {
  kind: 'behavioural' | 'usage' | 'exclusion';
  title: string;
  body: string;
};

/** An action that was considered for a case, and why it was or wasn't chosen. */
export type ActionAlternative = {
  actionId: string;
  predictedRecovery: number;
  eligible: boolean;
  rejectedReason: string | null;
};

/** Synthetic population figures for a detection run (the wide screen, not the pilot sample). */
export type PopulationSummary = {
  windowDays: number;
  subscribersScored: number;
  flaggedTotal: number;
  riskBands: { high: number; medium: number; low: number };
  awaitingReply: number;
  readyForAction: number;
  actionsAwaitingApproval: number;
  minimumDaysInactive: number;
  pilotSampleSize: number;
  pilotWindowDays: number;
  churnedCustomerIds: string[];
  marginImpactChangePct: number;
  approvalsThisWeek: number;
  simulated: true;
};
