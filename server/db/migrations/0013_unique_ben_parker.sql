ALTER TABLE "events" ADD COLUMN "handover_to" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "handover_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_handover_to_members_id_fk" FOREIGN KEY ("handover_to") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;