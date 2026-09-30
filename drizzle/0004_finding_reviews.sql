CREATE TABLE "finding_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"finding_key" varchar(255) NOT NULL,
	"finding_type" varchar(80) NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finding_reviews_org_key_unique" ON "finding_reviews" USING btree ("organization_id","finding_key");--> statement-breakpoint
CREATE INDEX "finding_reviews_org_status_idx" ON "finding_reviews" USING btree ("organization_id","status");