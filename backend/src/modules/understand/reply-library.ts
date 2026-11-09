/**
 * Synthetic Liberian-English replies used ONLY by the demo simulation of an Orange channel
 * returning an answer (same wording as the prototype's generator). Not real customer text.
 */
export const SIMULATED_REPLIES: readonly string[] = [
  'Money hard this month. Buy small weekly.',
  'Price too high now. I wait for salary before I buy bundle.',
  'School fees finish my money. I use only what last.',
  'I travel upcountry next month. No need big bundle here.',
  'Work finish for this season. I no need data plenty.',
  'Another network price good for me now. I use their line.',
  'Network slow inside my area. Data no load some days.',
  'I no know how to buy the big bundle. The menu confuse me.',
];

/** Deterministic pick per request id, so a re-run of the demo gives the same reply. */
export function pickSimulatedReply(requestId: string): string {
  let hash = 0;
  for (const ch of requestId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SIMULATED_REPLIES[hash % SIMULATED_REPLIES.length] ?? SIMULATED_REPLIES[0] ?? '';
}
