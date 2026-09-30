CREATE TABLE "service_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_code" varchar(120),
	"location_name" varchar(255),
	"asset_code" varchar(120),
	"asset_type" varchar(160),
	"vendor_name" varchar(255),
	"service_date" date NOT NULL,
	"failure_type" varchar(255),
	"description" text,
	"amount" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'TRY',
	"invoice_number" varchar(120),
	"source_file_name" varchar(255),
	"source_row_number" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;