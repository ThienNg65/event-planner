ALTER TABLE "events" ADD COLUMN "reconfirm_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "first_voted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "derived" text;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_derived" CHECK ("responses"."derived" in ('going', 'reconfirm'));--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_derived_going" CHECK ("responses"."derived" is null or "responses"."status" = 'going');--> statement-breakpoint
UPDATE "responses" SET "first_voted_at" = now() WHERE cardinality("days") > 0 OR cardinality("venue_ids") > 0;
