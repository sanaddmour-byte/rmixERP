CREATE TYPE "public"."accounting_period_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "accounting_period" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"year_month" varchar(7) NOT NULL,
	"status" "accounting_period_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"reopened_at" timestamp with time zone,
	"reopened_by" uuid,
	"reopen_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "accounting_period_company_year_month_unique" UNIQUE("company_id","year_month")
);
--> statement-breakpoint
ALTER TABLE "accounting_period" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounting_period" ADD CONSTRAINT "accounting_period_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "accounting_period" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);