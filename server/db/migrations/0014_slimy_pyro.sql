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
ALTER TABLE "member_codes" ADD CONSTRAINT "member_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_email" ADD CONSTRAINT "member_email_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;