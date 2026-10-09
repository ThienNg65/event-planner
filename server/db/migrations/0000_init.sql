CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"stage" text NOT NULL,
	"poll_days" date[] DEFAULT '{}' NOT NULL,
	"starts_at" timestamp with time zone,
	"venue" text,
	"venue_link" text,
	"capacity" integer,
	"bill_total" integer,
	"bank_id" text,
	"bank_account" text,
	"bank_holder" text,
	"created_by" integer NOT NULL,
	"manage_key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_stage" CHECK ("events"."stage" in ('poll', 'rsvp', 'bill', 'settled'))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"event_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"days" date[] DEFAULT '{}' NOT NULL,
	"venue_ids" integer[] DEFAULT '{}' NOT NULL,
	"status" text,
	"guests" integer DEFAULT 0 NOT NULL,
	"going_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	CONSTRAINT "responses_event_id_member_id_pk" PRIMARY KEY("event_id","member_id"),
	CONSTRAINT "responses_status" CHECK ("responses"."status" in ('going', 'maybe', 'no')),
	CONSTRAINT "responses_guests" CHECK ("responses"."guests" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"added_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_added_by_members_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;