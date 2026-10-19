CREATE TABLE "card_deliveries" (
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"shared_via" text,
	"email_queued_at" timestamp with time zone,
	"email_claimed_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"email_error" text,
	"reminder_offset" integer,
	"reminder_queued_at" timestamp with time zone,
	"reminder_claimed_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"reminder_error" text,
	CONSTRAINT "card_deliveries_household_id_kind_pk" PRIMARY KEY("household_id","kind")
);
--> statement-breakpoint
CREATE TABLE "card_opens" (
	"card_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_opens_card_id_household_id_pk" PRIMARY KEY("card_id","household_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer NOT NULL,
	"shared_at" timestamp with time zone,
	"theme_id" text NOT NULL,
	"palette_id" text,
	"font_pairing_id" text,
	"layout_id" text,
	"envelope" boolean DEFAULT true NOT NULL,
	"photo_key" text,
	"content" jsonb NOT NULL,
	"message" text,
	"reminder_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reminder_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"provider" text NOT NULL,
	"purchase_ref" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_purchase_ref_unique" UNIQUE("purchase_ref")
);
--> statement-breakpoint
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
CREATE TABLE "household_versions" (
	"household_id" uuid NOT NULL,
	"item" text NOT NULL,
	"card_id" uuid,
	"website_id" uuid,
	CONSTRAINT "household_versions_household_id_item_pk" PRIMARY KEY("household_id","item"),
	CONSTRAINT "household_versions_one_target" CHECK (num_nonnulls("household_versions"."card_id", "household_versions"."website_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_event_ids" jsonb,
	"message" text DEFAULT '' NOT NULL,
	"poll_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"responded_at" timestamp with time zone,
	"email" text,
	"personal_line" text DEFAULT '' NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rsvp_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
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
	"wedding_id" uuid PRIMARY KEY NOT NULL,
	"reply_by" date,
	"event_ids" jsonb,
	"meal" jsonb,
	"notify" text DEFAULT 'off' NOT NULL,
	"whatsapp_message" text,
	"last_summary_at" timestamp with time zone,
	"retention_warned_for" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "section_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"wedding_id" uuid,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_sections" (
	"website_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"visible" boolean DEFAULT true NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	CONSTRAINT "website_sections_website_id_kind_pk" PRIMARY KEY("website_id","kind")
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"slug" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"hidden_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"welcome_message" text DEFAULT '' NOT NULL,
	"hashtag" text DEFAULT '' NOT NULL,
	"show_countdown" boolean DEFAULT false NOT NULL,
	"cover_image_key" text,
	"theme_id" text NOT NULL,
	"palette_id" text,
	"font_pairing_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "websites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "wedding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"wedding_date" date,
	"location" text,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weddings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "card_deliveries" ADD CONSTRAINT "card_deliveries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_opens" ADD CONSTRAINT "card_opens_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_opens" ADD CONSTRAINT "card_opens_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_versions" ADD CONSTRAINT "household_versions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_versions" ADD CONSTRAINT "household_versions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_versions" ADD CONSTRAINT "household_versions_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_polls" ADD CONSTRAINT "rsvp_polls_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_settings" ADD CONSTRAINT "rsvp_settings_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_items" ADD CONSTRAINT "section_items_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_sections" ADD CONSTRAINT "website_sections_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_opens_household_idx" ON "card_opens" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "cards_wedding_kind_idx" ON "cards" USING btree ("wedding_id","kind","position");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_wedding_kind_slug_idx" ON "cards" USING btree ("wedding_id","kind","slug");--> statement-breakpoint
CREATE INDEX "entitlements_wedding_idx" ON "entitlements" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX "guest_requests_household_idx" ON "guest_requests" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "guests_household_idx" ON "guests" USING btree ("household_id","position");--> statement-breakpoint
CREATE INDEX "households_wedding_idx" ON "households" USING btree ("wedding_id","created_at");--> statement-breakpoint
CREATE INDEX "rsvp_polls_wedding_idx" ON "rsvp_polls" USING btree ("wedding_id","position");--> statement-breakpoint
CREATE INDEX "section_items_website_kind_idx" ON "section_items" USING btree ("website_id","kind","position");--> statement-breakpoint
CREATE INDEX "uploads_wedding_idx" ON "uploads" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX "websites_wedding_idx" ON "websites" USING btree ("wedding_id","position");--> statement-breakpoint
CREATE INDEX "wedding_events_wedding_idx" ON "wedding_events" USING btree ("wedding_id","position");--> statement-breakpoint
CREATE INDEX "weddings_owner_idx" ON "weddings" USING btree ("owner_id");