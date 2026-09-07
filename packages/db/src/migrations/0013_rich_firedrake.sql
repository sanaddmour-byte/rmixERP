ALTER TABLE "company" ADD COLUMN "document_expiry_warning_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver" ADD COLUMN "license_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "truck" ADD COLUMN "registration_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "truck" ADD COLUMN "insurance_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "truck" ADD COLUMN "inspection_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD COLUMN "document_expiry_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_order" ADD COLUMN "document_expiry_override_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "delivery_order" ADD COLUMN "document_expiry_override_by" uuid;