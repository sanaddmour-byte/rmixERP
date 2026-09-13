ALTER TABLE "invoice_number_counter" DROP CONSTRAINT "invoice_number_counter_branch_year_month_unique";--> statement-breakpoint
ALTER TABLE "invoice_number_counter" ADD COLUMN "doc_type" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_number_counter" ADD CONSTRAINT "invoice_number_counter_branch_doc_type_year_month_unique" UNIQUE("branch_id","doc_type","year_month");