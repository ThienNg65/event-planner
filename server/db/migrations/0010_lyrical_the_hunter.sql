ALTER TABLE "events" ADD COLUMN "join_key" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
-- Organizers are participants: creators and active co-hosts of existing events get an (empty) answer row.
INSERT INTO "responses" ("event_id", "member_id") SELECT "id", "created_by" FROM "events" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "responses" ("event_id", "member_id") SELECT "event_id", "member_id" FROM "cohosts" WHERE "status" = 'active' ON CONFLICT DO NOTHING;
