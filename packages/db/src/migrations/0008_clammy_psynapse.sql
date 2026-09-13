CREATE TYPE "public"."invoice_line_tax_treatment" AS ENUM('taxable', 'exempt');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending_clearance', 'cleared', 'issued', 'partially_paid', 'paid', 'rejected');--> statement-breakpoint
CREATE TABLE "credit_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"note_number" varchar(40) NOT NULL,
	"amount_fils" bigint NOT NULL,
	"tax_fils" bigint DEFAULT 0 NOT NULL,
	"total_fils" bigint NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "credit_note_note_number_unique" UNIQUE("note_number")
);
--> statement-breakpoint
ALTER TABLE "credit_note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "debit_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"note_number" varchar(40) NOT NULL,
	"amount_fils" bigint NOT NULL,
	"tax_fils" bigint DEFAULT 0 NOT NULL,
	"total_fils" bigint NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "debit_note_note_number_unique" UNIQUE("note_number")
);
--> statement-breakpoint
ALTER TABLE "debit_note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_number" varchar(40) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"invoiced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"related_invoice_id" uuid,
	"subtotal_fils" bigint DEFAULT 0 NOT NULL,
	"tax_fils" bigint DEFAULT 0 NOT NULL,
	"total_fils" bigint DEFAULT 0 NOT NULL,
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "invoice_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"delivery_order_id" uuid,
	"tax_treatment" "invoice_line_tax_treatment" NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity_m3" numeric(10, 3),
	"unit_price_fils" bigint,
	"net_fils" bigint NOT NULL,
	"tax_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"tax_fils" bigint DEFAULT 0 NOT NULL,
	"total_fils" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "invoice_line_delivery_order_tax_treatment_unique" UNIQUE("delivery_order_id","tax_treatment")
);
--> statement-breakpoint
ALTER TABLE "invoice_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_number_counter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"year_month" varchar(4) NOT NULL,
	"next_seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_number_counter_branch_year_month_unique" UNIQUE("branch_id","year_month")
);
--> statement-breakpoint
ALTER TABLE "invoice_number_counter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"route" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_company_key_unique" UNIQUE("company_id","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_key" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD COLUMN "sales_order_line_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note" ADD CONSTRAINT "debit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_delivery_order_id_delivery_order_id_fk" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_counter" ADD CONSTRAINT "invoice_number_counter_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_counter" ADD CONSTRAINT "invoice_number_counter_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_sales_order_line_id_sales_order_line_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "credit_note" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "debit_note" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_line" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_number_counter" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "idempotency_key" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);