CREATE TABLE "customer_weekly_usage" (
	"customer_id" text NOT NULL,
	"week_start" date NOT NULL,
	"data_gb" numeric(6, 2) NOT NULL,
	CONSTRAINT "customer_weekly_usage_customer_id_week_start_pk" PRIMARY KEY("customer_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "customer_weekly_usage" ADD CONSTRAINT "customer_weekly_usage_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;