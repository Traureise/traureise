-- No instance holds real data yet (CLAUDE.md): the tables that hung off websites are dropped here and
-- recreated around weddings in 0006_weddings (website versions, events, card versions, version choices).
DROP TABLE "card_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "cards" CASCADE;--> statement-breakpoint
DROP TABLE "entitlements" CASCADE;--> statement-breakpoint
DROP TABLE "guest_requests" CASCADE;--> statement-breakpoint
DROP TABLE "guests" CASCADE;--> statement-breakpoint
DROP TABLE "households" CASCADE;--> statement-breakpoint
DROP TABLE "rsvp_polls" CASCADE;--> statement-breakpoint
DROP TABLE "rsvp_settings" CASCADE;--> statement-breakpoint
DROP TABLE "section_items" CASCADE;--> statement-breakpoint
DROP TABLE "uploads" CASCADE;--> statement-breakpoint
DROP TABLE "website_sections" CASCADE;--> statement-breakpoint
DROP TABLE "websites" CASCADE;