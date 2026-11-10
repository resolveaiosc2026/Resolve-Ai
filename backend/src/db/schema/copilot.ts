import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import type { CopilotFact } from './json-types.js';

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/**
 * Copilot questions and answers. Stores REFERENCES to the facts used (with provenance),
 * not a source of truth: every number comes from the backend's own aggregates.
 */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid().notNull(),
    question: text().notNull(),
    intent: text().notNull(),
    /** `keywords` or `llm`. */
    routedBy: text().notNull(),
    facts: jsonb().$type<CopilotFact[]>().notNull(),
    draftAnswer: text().notNull(),
    answer: text().notNull(),
    /** `template` or `llm:<model>`. */
    phrasedBy: text().notNull(),
    caveat: text(),
    followUps: jsonb()
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index('ai_conversations_conversation_idx').on(t.conversationId, t.createdAt)],
);
