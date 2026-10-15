ALTER TABLE "events" ADD COLUMN "repeat" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "repeat_until" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "series_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "events_series_starts" ON "events" USING btree ("series_id","starts_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_repeat" CHECK ("events"."repeat" in ('weekly', 'biweekly', 'monthly'));