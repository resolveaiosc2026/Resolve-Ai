ALTER TABLE "actions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "interventions" ADD COLUMN "delivery_window" text;--> statement-breakpoint
ALTER TABLE "interventions" ADD COLUMN "simulated_through" timestamp with time zone;