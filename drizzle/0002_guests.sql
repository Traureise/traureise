CREATE TABLE "guest_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"is_child" boolean DEFAULT false NOT NULL,
	"attending" boolean,
	"event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meal_option_id" text,
	"allergies" text DEFAULT '' NOT NULL,
	"poll_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"from_request" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_event_ids" jsonb,
	"message" text DEFAULT '' NOT NULL,
	"poll_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rsvp_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question" text NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"allow_other" boolean DEFAULT false NOT NULL,
	"per" text DEFAULT 'person' NOT NULL,
	"options" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvp_settings" (
	"website_id" uuid PRIMARY KEY NOT NULL,
	"reply_by" date,
	"event_ids" jsonb,
	"meal" jsonb,
	"notify" text DEFAULT 'off' NOT NULL,
	"whatsapp_message" text,
	"last_summary_at" timestamp with time zone,
	"retention_warned_for" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_polls" ADD CONSTRAINT "rsvp_polls_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_settings" ADD CONSTRAINT "rsvp_settings_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_requests_household_idx" ON "guest_requests" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "guests_household_idx" ON "guests" USING btree ("household_id","position");--> statement-breakpoint
CREATE INDEX "households_website_idx" ON "households" USING btree ("website_id","created_at");--> statement-breakpoint
CREATE INDEX "rsvp_polls_website_idx" ON "rsvp_polls" USING btree ("website_id","position");