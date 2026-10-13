ALTER TABLE "events" ADD COLUMN "co_host_key_hash" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "vote_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "notice" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "paid_amount" integer;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_paid_amount" CHECK ("responses"."paid_amount" >= 0);