ALTER TABLE "responses" ADD COLUMN "maybe_days" date[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "maybe_venue_ids" integer[] DEFAULT '{}' NOT NULL;