ALTER TABLE "responses" ADD COLUMN "sponsor_amount" integer;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_sponsor_amount" CHECK ("responses"."sponsor_amount" >= 0);