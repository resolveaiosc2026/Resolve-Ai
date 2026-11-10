/** Copilot: Drizzle queries only. */
import { asc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import { aiConversations } from '../../db/schema/index.js';

export async function insertTurn(ex: Executor, row: typeof aiConversations.$inferInsert) {
  const [created] = await ex.insert(aiConversations).values(row).returning();
  return created;
}

export function findThread(ex: Executor, conversationId: string) {
  return ex
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.conversationId, conversationId))
    .orderBy(asc(aiConversations.createdAt));
}
