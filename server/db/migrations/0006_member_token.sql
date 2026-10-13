ALTER TABLE "members" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_tokenHash_unique" UNIQUE("token_hash");