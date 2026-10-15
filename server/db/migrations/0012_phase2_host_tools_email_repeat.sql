CREATE TABLE "mail_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_codes" (
	"member_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"target_email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fails" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sends_today" integer DEFAULT 1 NOT NULL,
	"sends_day" date DEFAULT current_date NOT NULL,
	CONSTRAINT "member_codes_member_id_purpose_pk" PRIMARY KEY("member_id","purpose"),
	CONSTRAINT "member_codes_purpose" CHECK ("member_codes"."purpose" in ('verify', 'recover'))
);
--> statement-breakpoint
CREATE TABLE "member_email" (
	"member_id" integer PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_version" text NOT NULL,
	"locale" text DEFAULT 'vi' NOT NULL,
	"muted_kinds" text[] DEFAULT '{}' NOT NULL,
	"prev_email" text,
	"prev_until" timestamp with time zone,
	"recovery_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_sends" (
	"notification_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "notification_sends_notification_id_member_id_pk" PRIMARY KEY("notification_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"event_id" integer NOT NULL,
	"member_id" integer,
	"fact" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_until" timestamp with time zone,
	CONSTRAINT "notifications_kind" CHECK ("notifications"."kind" in ('planSet', 'paymentRequested', 'paymentRecorded', 'cancelled', 'tomorrow', 'paymentReminder'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "max_guests" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hide_votes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "handover_to" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "handover_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "repeat" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "repeat_until" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "series_id" integer;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "maybe_days" date[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "maybe_venue_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_codes" ADD CONSTRAINT "member_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_email" ADD CONSTRAINT "member_email_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once" ON "notifications" USING btree ("kind","event_id",coalesce("member_id", 0),"fact");--> statement-breakpoint
CREATE INDEX "notifications_due" ON "notifications" USING btree ("next_at") WHERE "notifications"."done_at" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_handover_to_members_id_fk" FOREIGN KEY ("handover_to") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_series_starts" ON "events" USING btree ("series_id","starts_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_max_guests" CHECK ("events"."max_guests" between 0 and 10);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_repeat" CHECK ("events"."repeat" in ('weekly', 'biweekly', 'monthly'));