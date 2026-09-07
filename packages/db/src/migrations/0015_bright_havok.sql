CREATE TYPE "public"."device_push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "device_push_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"platform" "device_push_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_push_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "device_push_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_push_token" ADD CONSTRAINT "device_push_token_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_push_token" ADD CONSTRAINT "device_push_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "device_push_token" AS PERMISSIVE FOR ALL TO "rmixerp_app" USING (company_id = current_setting('app.current_company_id', true)::uuid) WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);