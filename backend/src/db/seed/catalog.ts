/** Catalog rows: reasons, next-best-action library, campaign history, bundles (all synthetic). */
import { CURRENCY, type Channel } from '../../config/rules.js';
import type { actionReasons, actions, bundles, campaignHistory, reasons } from '../schema/index.js';
import type { PilotDataset } from './pilot-dataset.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

/** The prototype's channel display names → Orange channel ids. */
const CHANNEL_BY_LABEL: Record<string, Channel> = {
  'Orange SMS': 'sms',
  'Call centre': 'customer_service',
};

export function toChannel(label: string): Channel {
  const channel = CHANNEL_BY_LABEL[label];
  if (!channel) throw new Error(`Unknown channel label "${label}"`);
  return channel;
}

/** What each action is meant to achieve (shown with a recommendation). */
export const ACTION_OBJECTIVES: Record<string, string> = {
  daily_mini_600: 'Keep the customer buying at a price they can afford now',
  monthly_mini_2g: 'Move the customer back to a larger bundle within the pilot price cap',
  care_bridge: 'Get the network fault fixed so the customer can use data again',
  ussd_guide: 'Remove the activation barrier so the customer can buy their usual bundle',
  competitor_match: 'Keep the customer from moving their data spend to another network',
  reduced_need_checkin: 'Confirm the drop is a real change in need and avoid an unnecessary offer',
};

/** Synthetic bundle catalog: each size sold in USD and LRD (LRD at the configured rate). */
const BUNDLE_SIZES = [
  { key: 'daily_600mb', name: 'Daily 600 MB', validity: 'daily', dataMb: 600, usd: 0.6 },
  { key: 'weekly_1_5gb', name: 'Weekly 1.5 GB', validity: 'weekly', dataMb: 1536, usd: 1.5 },
  { key: 'monthly_4gb', name: 'Monthly 4 GB', validity: 'monthly', dataMb: 4096, usd: 4 },
] as const;

export const BUNDLES: Row<typeof bundles>[] = BUNDLE_SIZES.flatMap((b) => [
  {
    id: `${b.key}_usd`,
    name: `${b.name} (USD)`,
    validity: b.validity,
    dataMb: b.dataMb,
    price: b.usd,
    currency: 'USD' as const,
  },
  {
    id: `${b.key}_lrd`,
    name: `${b.name} (LRD)`,
    validity: b.validity,
    dataMb: b.dataMb,
    price: Math.round(b.usd * CURRENCY.lrdPerUsd),
    currency: 'LRD' as const,
  },
]);

export type CatalogRows = {
  reasons: Row<typeof reasons>[];
  actions: Row<typeof actions>[];
  actionReasons: Row<typeof actionReasons>[];
  campaignHistory: Row<typeof campaignHistory>[];
  bundles: Row<typeof bundles>[];
};

export function buildCatalog(data: PilotDataset): CatalogRows {
  return {
    reasons: data.reasons.map((r, i) => ({ id: r.id, label: r.label, icon: r.icon, sortOrder: i })),
    actions: data.actions.map((a) => ({
      id: a.id,
      name: a.name,
      shortName: a.short_name,
      price: a.price_usd,
      currency: 'USD' as const,
      sizeMb: a.size_mb,
      validityHours: a.validity_hours,
      channel: toChannel(a.channel),
      deliveryWindow: a.window,
      messageBody: a.body,
      mismatchNote: a.mismatch_note,
      eligibilityRules: a.eligibility,
    })),
    actionReasons: data.actions.flatMap((a) =>
      a.reasons.map((reasonId) => ({ actionId: a.id, reasonId })),
    ),
    campaignHistory: data.campaigns.map((c) => ({
      reasonId: c.reason,
      actionId: c.action_id,
      recoveryRate: c.recovery_rate,
      sampleSize: c.n,
      simulated: true,
    })),
    bundles: BUNDLES,
  };
}
