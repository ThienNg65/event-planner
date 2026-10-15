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
	CONSTRAINT "notifications_kind" CHECK ("notifications"."kind" in ('planSet', 'paymentRequested', 'paymentRecorded', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once" ON "notifications" USING btree ("kind","event_id",coalesce("member_id", 0),"fact");--> statement-breakpoint
CREATE INDEX "notifications_due" ON "notifications" USING btree ("next_at") WHERE "notifications"."done_at" is null;