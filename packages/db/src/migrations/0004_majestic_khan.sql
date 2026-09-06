CREATE TYPE "public"."production_order_status" AS ENUM('planned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "mix_design" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mix_design" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mix_design_ingredient" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"mix_design_id" uuid NOT NULL,
	"raw_material_id" uuid NOT NULL,
	"quantity_per_m3" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mix_design_ingredient" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_adjustment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"raw_material_id" uuid NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"unit_cost_fils" bigint,
	"resulting_quantity_on_hand" numeric(14, 3) NOT NULL,
	"resulting_average_cost_fils" bigint NOT NULL,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stock_adjustment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_balance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"raw_material_id" uuid NOT NULL,
	"quantity_on_hand" numeric(14, 3) DEFAULT 0 NOT NULL,
	"average_cost_fils" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	CONSTRAINT "stock_balance_branch_material_unique" UNIQUE("branch_id","raw_material_id")
);
--> statement-breakpoint
ALTER TABLE "stock_balance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "batch_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"batch_number" integer NOT NULL,
	"target_quantity_m3" numeric(10, 3) NOT NULL,
	"actual_quantity_m3" numeric(10, 3) NOT NULL,
	"moisture_adjustment_basis_points" integer DEFAULT 0 NOT NULL,
	"batched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "batch_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "material_consumption" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"batch_record_id" uuid NOT NULL,
	"raw_material_id" uuid NOT NULL,
	"mix_design_quantity_per_m3" numeric(12, 3) NOT NULL,
	"quantity_consumed" numeric(14, 3) NOT NULL,
	"unit_cost_fils" bigint NOT NULL,
	"total_cost_fils" bigint NOT NULL,
	"went_negative" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "material_consumption" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "production_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"mix_design_id" uuid NOT NULL,
	"sales_order_id" uuid,
	"planned_quantity_m3" numeric(10, 3) NOT NULL,
	"status" "production_order_status" DEFAULT 'planned' NOT NULL,
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "production_order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "returned_concrete" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"quantity_m3" numeric(10, 3) NOT NULL,
	"reason" varchar(500),
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "returned_concrete" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mix_design" ADD CONSTRAINT "mix_design_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_design" ADD CONSTRAINT "mix_design_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_design" ADD CONSTRAINT "mix_design_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_design_ingredient" ADD CONSTRAINT "mix_design_ingredient_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_design_ingredient" ADD CONSTRAINT "mix_design_ingredient_mix_design_id_mix_design_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_design"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_design_ingredient" ADD CONSTRAINT "mix_design_ingredient_raw_material_id_raw_material_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_raw_material_id_raw_material_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_raw_material_id_raw_material_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_record" ADD CONSTRAINT "batch_record_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_record" ADD CONSTRAINT "batch_record_production_order_id_production_order_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_batch_record_id_batch_record_id_fk" FOREIGN KEY ("batch_record_id") REFERENCES "public"."batch_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_raw_material_id_raw_material_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_mix_design_id_mix_design_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_design"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returned_concrete" ADD CONSTRAINT "returned_concrete_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returned_concrete" ADD CONSTRAINT "returned_concrete_production_order_id_production_order_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "mix_design" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "mix_design_ingredient" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_adjustment" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_balance" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "batch_record" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "material_consumption" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_order" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "returned_concrete" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);