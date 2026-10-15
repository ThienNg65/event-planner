ALTER TABLE "events" ADD COLUMN "max_guests" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hide_votes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_max_guests" CHECK ("events"."max_guests" between 0 and 10);