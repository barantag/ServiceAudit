DROP INDEX "imports_org_file_hash_unique";--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "excluded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "exclusion_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "imports_org_file_hash_unique" ON "imports" USING btree ("organization_id","file_hash") WHERE "imports"."excluded_at" is null;