ALTER TABLE "events" ADD COLUMN "planned_capacity" integer;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "no_show" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_no_show" CHECK (not "responses"."no_show" or "responses"."status" = 'no');