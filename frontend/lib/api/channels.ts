/**
 * Orange-owned channels: display label ↔ API id. Labels match the backend's
 * CHANNEL_LABELS (backend/src/config/rules.ts). Resolve AI hands work to these
 * channels; it never contacts customers itself.
 */
export const CHANNEL_IDS = {
  "Orange SMS": "sms",
  "Orange USSD": "ussd",
  "Orange voice call": "voice_call",
  "Field agent interview": "field_agent_interview",
  "Call centre": "customer_service",
} as const;

export type ChannelLabel = keyof typeof CHANNEL_IDS;
export type ChannelId = (typeof CHANNEL_IDS)[ChannelLabel];

/** Channels an intervention can be delivered through (Act screen). */
export const DELIVERY_CHANNELS: ChannelLabel[] = ["Orange SMS", "Orange USSD", "Call centre"];

/** Channels a feedback ask can be handed to (Understand screen). */
export const ASK_CHANNELS: ChannelLabel[] = ["Orange SMS", "Orange voice call", "Orange USSD", "Field agent interview"];

export function channelId(label: string): ChannelId | undefined {
  return (CHANNEL_IDS as Record<string, ChannelId>)[label];
}
