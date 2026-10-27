CREATE TABLE "wedding_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "wedding_members" (
	"wedding_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_members_wedding_id_user_id_pk" PRIMARY KEY("wedding_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "uploads" RENAME COLUMN "owner_id" TO "uploaded_by";--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "weddings" DROP CONSTRAINT "weddings_owner_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "weddings_owner_idx";--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "purchased_by" uuid;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "contact_user_id" uuid;--> statement-breakpoint
ALTER TABLE "wedding_invitations" ADD CONSTRAINT "wedding_invitations_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_invitations" ADD CONSTRAINT "wedding_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wedding_invitations_wedding_email_idx" ON "wedding_invitations" USING btree ("wedding_id","email");--> statement-breakpoint
CREATE INDEX "wedding_members_user_idx" ON "wedding_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_purchased_by_users_id_fk" FOREIGN KEY ("purchased_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_contact_user_id_users_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill (hand-written): every owner becomes the wedding's admin and contact, and the buyer of its packages.
INSERT INTO "wedding_members" ("wedding_id", "user_id", "role", "created_at") SELECT "id", "owner_id", 'admin', "created_at" FROM "weddings";--> statement-breakpoint
UPDATE "weddings" SET "contact_user_id" = "owner_id";--> statement-breakpoint
UPDATE "entitlements" e SET "purchased_by" = w."owner_id" FROM "weddings" w WHERE w."id" = e."wedding_id";--> statement-breakpoint
ALTER TABLE "weddings" DROP COLUMN "owner_id";