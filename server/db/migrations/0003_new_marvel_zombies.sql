CREATE TABLE "cohosts" (
	"event_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"status" text NOT NULL,
	"invite_hash" text,
	"key_hash" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "cohosts_event_id_member_id_pk" PRIMARY KEY("event_id","member_id"),
	CONSTRAINT "cohosts_inviteHash_unique" UNIQUE("invite_hash"),
	CONSTRAINT "cohosts_keyHash_unique" UNIQUE("key_hash"),
	CONSTRAINT "cohosts_status" CHECK ("cohosts"."status" in ('invited', 'active')),
	CONSTRAINT "cohosts_invite" CHECK (("cohosts"."status" = 'invited') = ("cohosts"."invite_hash" is not null)),
	CONSTRAINT "cohosts_key" CHECK (("cohosts"."status" = 'active') = ("cohosts"."key_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "cohosts" ADD CONSTRAINT "cohosts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohosts" ADD CONSTRAINT "cohosts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;