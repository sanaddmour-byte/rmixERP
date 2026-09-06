CREATE TABLE "qc_cube_test_set" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"batch_record_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"age_days" integer NOT NULL,
	"design_age_days" integer DEFAULT 28 NOT NULL,
	"cast_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"average_strength_mpa" numeric(6, 2) NOT NULL,
	"pass" boolean,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "qc_cube_test_set" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "qc_cube_test_specimen" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"cube_test_set_id" uuid NOT NULL,
	"specimen_number" integer NOT NULL,
	"strength_mpa" numeric(6, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "qc_cube_test_specimen" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "qc_fresh_test" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"batch_record_id" uuid NOT NULL,
	"slump_mm" numeric(6, 1) NOT NULL,
	"concrete_temperature_c" numeric(5, 1),
	"ambient_temperature_c" numeric(5, 1),
	"air_content_percent" numeric(5, 2),
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "qc_fresh_test" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"type" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"message" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"read_by" uuid
);
--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "batch_record" ADD COLUMN "qc_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_record" ADD COLUMN "qc_flag_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "qc_cube_test_set" ADD CONSTRAINT "qc_cube_test_set_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_cube_test_set" ADD CONSTRAINT "qc_cube_test_set_batch_record_id_batch_record_id_fk" FOREIGN KEY ("batch_record_id") REFERENCES "public"."batch_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_cube_test_specimen" ADD CONSTRAINT "qc_cube_test_specimen_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_cube_test_specimen" ADD CONSTRAINT "qc_cube_test_specimen_cube_test_set_id_qc_cube_test_set_id_fk" FOREIGN KEY ("cube_test_set_id") REFERENCES "public"."qc_cube_test_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_fresh_test" ADD CONSTRAINT "qc_fresh_test_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_fresh_test" ADD CONSTRAINT "qc_fresh_test_batch_record_id_batch_record_id_fk" FOREIGN KEY ("batch_record_id") REFERENCES "public"."batch_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_read_by_app_user_id_fk" FOREIGN KEY ("read_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "qc_cube_test_set" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "qc_cube_test_specimen" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "qc_fresh_test" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notification" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);