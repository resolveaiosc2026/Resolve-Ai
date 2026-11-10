CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"question" text NOT NULL,
	"intent" text NOT NULL,
	"routed_by" text NOT NULL,
	"facts" jsonb NOT NULL,
	"draft_answer" text NOT NULL,
	"answer" text NOT NULL,
	"phrased_by" text NOT NULL,
	"caveat" text,
	"follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_conversations_conversation_idx" ON "ai_conversations" USING btree ("conversation_id","created_at");