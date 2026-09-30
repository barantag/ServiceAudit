CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"import_id" uuid,
	"asset_code" varchar(120) NOT NULL,
	"location_code" varchar(120),
	"warranty_start_date" date NOT NULL,
	"warranty_end_date" date NOT NULL,
	"provider_name" varchar(255),
	"description" text,
	"source_file_name" varchar(255),
	"source_row_number" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warranties_org_asset_idx" ON "warranties" USING btree ("organization_id","asset_code");