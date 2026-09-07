CREATE TYPE "public"."delivery_order_status" AS ENUM('planned', 'dispatched', 'delivered', 'invoiced');--> statement-breakpoint
CREATE TABLE "driver" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(30),
	"license_number" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "driver" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "truck" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"plate_number" varchar(30) NOT NULL,
	"capacity_m3" numeric(6, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "truck" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delivery_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"production_order_id" uuid,
	"batch_record_id" uuid,
	"truck_id" uuid,
	"driver_id" uuid,
	"quantity_m3" numeric(10, 3) NOT NULL,
	"status" "delivery_order_status" DEFAULT 'planned' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"credit_check_policy" "credit_policy",
	"credit_check_outstanding_fils" bigint,
	"credit_check_exceeds_by_fils" bigint,
	"credit_override" boolean DEFAULT false NOT NULL,
	"credit_override_reason" varchar(500),
	"credit_override_by" uuid,
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "delivery_order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proof_of_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"delivery_order_id" uuid NOT NULL,
	"received_quantity_m3" numeric(10, 3) NOT NULL,
	"signed_by_name" varchar(200) NOT NULL,
	"signature_data" text NOT NULL,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "proof_of_delivery_delivery_order_unique" UNIQUE("delivery_order_id")
);
--> statement-breakpoint
ALTER TABLE "proof_of_delivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "driver" ADD CONSTRAINT "driver_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver" ADD CONSTRAINT "driver_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_production_order_id_production_order_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_batch_record_id_batch_record_id_fk" FOREIGN KEY ("batch_record_id") REFERENCES "public"."batch_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_driver_id_driver_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_delivery_order_id_delivery_order_id_fk" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "driver" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "truck" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "delivery_order" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "proof_of_delivery" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);