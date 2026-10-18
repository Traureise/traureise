CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"provider" text NOT NULL,
	"purchase_ref" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_purchase_ref_unique" UNIQUE("purchase_ref")
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entitlements_website_idx" ON "entitlements" USING btree ("website_id");