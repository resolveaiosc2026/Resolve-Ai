/**
 * One function per endpoint the workbench uses. Reads return adapted view
 * models (lib/types.ts shapes); writes return what the screen needs next.
 */
import { api } from "./client";
import {
  toClassification,
  toCustomer,
  toMeasure,
  toQueueRow,
  toRecommendation,
  toReport,
  toUsage,
} from "./adapters";
import type { ChannelId } from "./channels";
import type {
  ApiApproveResult,
  ApiClassification,
  ApiCopilotAnswer,
  ApiDetectionRun,
  ApiDetectSummary,
  ApiHealth,
  ApiInterventionRow,
  ApiMeasureView,
  ApiQueueRow,
  ApiRecommendationSummary,
  ApiRecommendationView,
  ApiReport,
} from "./types";
import type { ReasonId } from "../types";

const enc = encodeURIComponent;

/* ---------------------------------------------------------------- reads */

export const getHealth = async () => (await api<ApiHealth>("/health")).data;

export const getLatestRun = async () => (await api<ApiDetectionRun>("/detection-runs/latest")).data;

export const getQueue = async () => (await api<ApiQueueRow[]>("/risk?pageSize=100")).data.map(toQueueRow);

export const getDetectSummary = async () => (await api<ApiDetectSummary>("/risk/summary")).data;

export async function getCustomer(id: string) {
  const { data } = await api<ApiQueueRow>(`/customers/${enc(id)}`);
  return { ...toQueueRow(data), customer: toCustomer(data.customer), usage: toUsage(data.usage) };
}

export const getReasons = async (id: string) =>
  toClassification((await api<ApiClassification>(`/customers/${enc(id)}/reasons`)).data, id);

export const getRecommendation = async (id: string) =>
  toRecommendation((await api<ApiRecommendationView>(`/customers/${enc(id)}/recommendation`)).data);

export const getMeasure = async (id: string) =>
  toMeasure((await api<ApiMeasureView>(`/customers/${enc(id)}/measure`)).data);

export const getInterventions = async () =>
  (await api<ApiInterventionRow[]>("/interventions?pageSize=100")).data;

export const getReport = async () => toReport((await api<ApiReport>("/reports/summary")).data);

export const getCopilotSuggestions = async () => (await api<string[]>("/copilot/suggestions")).data;

/* --------------------------------------------------------------- writes */

export async function acceptEvidence(customerId: string, reviewerName: string) {
  await api(`/customers/${enc(customerId)}/reasons/evidence`, { method: "POST", body: { reviewerName } });
}

export async function handOffAsk(customerId: string, channel: ChannelId, reviewerName: string) {
  await api(`/customers/${enc(customerId)}/feedback-requests`, {
    method: "POST",
    body: { channel, reviewerName },
  });
}

/** DEMO: Orange's channel returns the customer's reply (simulation mode only). */
export async function simulateReply(requestId: string, text?: string) {
  await api(`/simulation/feedback-requests/${enc(requestId)}/reply`, {
    method: "POST",
    body: text ? { text } : {},
  });
}

export async function correctReason(classificationId: string, reasonId: ReasonId, reviewerName: string, note?: string) {
  await api(`/reasons/${enc(classificationId)}`, {
    method: "PATCH",
    body: note ? { reasonId, reviewerName, note } : { reasonId, reviewerName },
  });
}

/** Reuses the case's pending recommendation, or persists the current best action as one. */
export async function ensurePendingRecommendation(
  customerId: string,
  current: ApiRecommendationSummary | null,
  reviewerName: string,
): Promise<string> {
  if (current?.status === "pending") return current.id;
  const { data } = await api<{ id: string }>(`/customers/${enc(customerId)}/recommendations`, {
    method: "POST",
    body: { reviewerName },
  });
  return data.id;
}

export async function approveAction(
  recommendationId: string,
  body: { reviewerName: string; actionId?: string; channel?: ChannelId; window?: string; note?: string },
) {
  return (await api<ApiApproveResult>(`/actions/${enc(recommendationId)}/approve`, { method: "POST", body })).data;
}

export async function rejectAction(recommendationId: string, reviewerName: string, note: string) {
  await api(`/actions/${enc(recommendationId)}/reject`, { method: "POST", body: { reviewerName, note } });
}

export type Scenario = "recover" | "partial" | "no_change" | "decline";

/** DEMO: deliver the intervention and simulate the customer's next 30 days (simulation mode only). */
export async function advanceIntervention(reference: string, scenario?: Scenario) {
  await api(`/simulation/interventions/${enc(reference)}/advance`, {
    method: "POST",
    body: scenario ? { scenario } : {},
  });
}

export async function recordOutcome(reference: string, reviewerName: string) {
  await api(`/interventions/${enc(reference)}/outcome`, { method: "POST", body: { reviewerName } });
}

export async function askCopilot(question: string, conversationId: string | null, style: "natural" | "template") {
  const body: Record<string, string> = { question, style };
  if (conversationId) body.conversationId = conversationId;
  return (await api<ApiCopilotAnswer>("/copilot/chat", { method: "POST", body })).data;
}
