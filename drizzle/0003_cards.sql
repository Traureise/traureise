CREATE TABLE "card_deliveries" (
	"card_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"shared_via" text,
	"email_queued_at" timestamp with time zone,
	"email_claimed_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"email_error" text,
	"opened_at" timestamp with time zone,
	"reminder_offset" integer,
	"reminder_queued_at" timestamp with time zone,
	"reminder_claimed_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"reminder_error" text,
	CONSTRAINT "card_deliveries_card_id_household_id_pk" PRIMARY KEY("card_id","household_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"kind" text NOT NULL,
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
ALTER TABLE "households" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "personal_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_deliveries" ADD CONSTRAINT "card_deliveries_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_deliveries" ADD CONSTRAINT "card_deliveries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_deliveries_household_idx" ON "card_deliveries" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_website_kind_idx" ON "cards" USING btree ("website_id","kind");