ALTER TABLE "driver" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "driver" ADD CONSTRAINT "driver_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver" ADD CONSTRAINT "driver_user_id_unique" UNIQUE("user_id");