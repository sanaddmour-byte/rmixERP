CREATE TYPE "public"."collection_method" AS ENUM('cash', 'bank_transfer', 'post_dated_cheque');--> statement-breakpoint
CREATE TYPE "public"."pdc_status" AS ENUM('pending', 'deposited', 'cleared', 'bounced', 'cancelled');--> statement-breakpoint
CREATE TABLE "collection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"method" "collection_method" NOT NULL,
	"receipt_number" varchar(40) NOT NULL,
	"amount_fils" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" varchar(200),
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "collection_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
ALTER TABLE "collection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "collection_allocation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_fils" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "collection_allocation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_dated_cheque" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"bank_name" varchar(200) NOT NULL,
	"cheque_number" varchar(100) NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"status" "pdc_status" DEFAULT 'pending' NOT NULL,
	"deposited_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"bounce_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "post_dated_cheque_collection_id_unique" UNIQUE("collection_id")
);
--> statement-breakpoint
ALTER TABLE "post_dated_cheque" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_allocation" ADD CONSTRAINT "collection_allocation_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_allocation" ADD CONSTRAINT "collection_allocation_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_allocation" ADD CONSTRAINT "collection_allocation_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_dated_cheque" ADD CONSTRAINT "post_dated_cheque_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_dated_cheque" ADD CONSTRAINT "post_dated_cheque_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_dated_cheque" ADD CONSTRAINT "post_dated_cheque_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_dated_cheque" ADD CONSTRAINT "post_dated_cheque_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "collection" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "collection_allocation" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "post_dated_cheque" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);