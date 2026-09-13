CREATE TYPE "public"."clearance_status" AS ENUM('pending', 'cleared', 'rejected', 'retrying');--> statement-breakpoint
CREATE TABLE "clearance_icv_counter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"next_icv" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "clearance_icv_counter_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "clearance_icv_counter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_status" "clearance_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_icv" integer;--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_qr_payload" varchar(2000);--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_provider_reference" varchar(200);--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_error" varchar(2000);--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_submitted_payload" jsonb;--> statement-breakpoint
ALTER TABLE "credit_note" ADD COLUMN "clearance_response_payload" jsonb;--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_status" "clearance_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_icv" integer;--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_qr_payload" varchar(2000);--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_provider_reference" varchar(200);--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_error" varchar(2000);--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_submitted_payload" jsonb;--> statement-breakpoint
ALTER TABLE "debit_note" ADD COLUMN "clearance_response_payload" jsonb;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_status" "clearance_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_icv" integer;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_qr_payload" varchar(2000);--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_provider_reference" varchar(200);--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_error" varchar(2000);--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_submitted_payload" jsonb;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "clearance_response_payload" jsonb;--> statement-breakpoint
ALTER TABLE "clearance_icv_counter" ADD CONSTRAINT "clearance_icv_counter_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "clearance_icv_counter" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);