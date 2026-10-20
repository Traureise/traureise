-- No real data exists yet (CLAUDE.md): old fixed sections are dropped rather than migrated.
DELETE FROM "website_sections";--> statement-breakpoint
CREATE TABLE "section_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "section_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "section_items" CASCADE;--> statement-breakpoint
DROP INDEX "wedding_events_wedding_idx";--> statement-breakpoint
ALTER TABLE "website_sections" DROP CONSTRAINT "website_sections_website_id_kind_pk";--> statement-breakpoint
ALTER TABLE "website_sections" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "position" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "website_sections" ADD COLUMN "suggested_type" text;--> statement-breakpoint
ALTER TABLE "section_blocks" ADD CONSTRAINT "section_blocks_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_blocks" ADD CONSTRAINT "section_blocks_section_id_website_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."website_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "section_blocks_section_idx" ON "section_blocks" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "website_sections_website_idx" ON "website_sections" USING btree ("website_id","position");--> statement-breakpoint
CREATE INDEX "wedding_events_wedding_idx" ON "wedding_events" USING btree ("wedding_id");--> statement-breakpoint
ALTER TABLE "website_sections" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "website_sections" DROP COLUMN "body";--> statement-breakpoint
ALTER TABLE "websites" DROP COLUMN "hidden_event_ids";--> statement-breakpoint
ALTER TABLE "wedding_events" DROP COLUMN "position";