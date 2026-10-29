CREATE TYPE "public"."clan_role" AS ENUM('owner', 'officer', 'member');--> statement-breakpoint
CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('count_threshold', 'photo_report');--> statement-breakpoint
CREATE TYPE "public"."toast_status" AS ENUM('active', 'rejected');--> statement-breakpoint
CREATE TABLE "user_achievement" (
	"user_id" uuid NOT NULL,
	"achievement_code" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievement_user_id_achievement_code_pk" PRIMARY KEY("user_id","achievement_code"),
	CONSTRAINT "user_achievement_code_known" CHECK ("user_achievement"."achievement_code" IN ('first_bite', 'shutterbug', 'week_warrior', 'toast_devotee', 'centurion', 'toastmaster', 'clansman', 'golden_toast', 'early_bird', 'midnight_snack'))
);
--> statement-breakpoint
CREATE TABLE "clan" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(40) NOT NULL,
	"description" varchar(280),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_join_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"clan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_membership" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"clan_id" uuid NOT NULL,
	"role" "clan_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" "flag_type" NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"toast_id" uuid,
	"local_date" date,
	"reporter_id" uuid,
	"reason" varchar(280),
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_count_threshold_has_date" CHECK ("flag"."type" <> 'count_threshold' OR "flag"."local_date" IS NOT NULL),
	CONSTRAINT "flag_photo_report_has_toast" CHECK ("flag"."type" <> 'photo_report' OR "flag"."toast_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toast_fact" (
	"id" serial PRIMARY KEY NOT NULL,
	"text_sk" text NOT NULL,
	"text_en" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "like" (
	"user_id" uuid NOT NULL,
	"toast_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "like_toast_id_user_id_pk" PRIMARY KEY("toast_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "toast" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"clan_id" uuid,
	"eaten_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_date" date GENERATED ALWAYS AS ((eaten_at AT TIME ZONE 'Europe/Bratislava')::date) STORED NOT NULL,
	"photo_key" text,
	"photo_hidden_at" timestamp with time zone,
	"status" "toast_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toast_of_the_week" (
	"week_start" date PRIMARY KEY NOT NULL,
	"toast_id" uuid,
	"drawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drawn_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toast_of_the_week_monday" CHECK (extract(isodow from "toast_of_the_week"."week_start") = 1)
);
--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_join_request" ADD CONSTRAINT "clan_join_request_clan_id_clan_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_join_request" ADD CONSTRAINT "clan_join_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_join_request" ADD CONSTRAINT "clan_join_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_membership" ADD CONSTRAINT "clan_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_membership" ADD CONSTRAINT "clan_membership_clan_id_clan_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag" ADD CONSTRAINT "flag_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag" ADD CONSTRAINT "flag_toast_id_toast_id_fk" FOREIGN KEY ("toast_id") REFERENCES "public"."toast"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag" ADD CONSTRAINT "flag_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag" ADD CONSTRAINT "flag_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "like" ADD CONSTRAINT "like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "like" ADD CONSTRAINT "like_toast_id_toast_id_fk" FOREIGN KEY ("toast_id") REFERENCES "public"."toast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toast" ADD CONSTRAINT "toast_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toast" ADD CONSTRAINT "toast_clan_id_clan_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toast_of_the_week" ADD CONSTRAINT "toast_of_the_week_toast_id_toast_id_fk" FOREIGN KEY ("toast_id") REFERENCES "public"."toast"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toast_of_the_week" ADD CONSTRAINT "toast_of_the_week_drawn_by_user_id_fk" FOREIGN KEY ("drawn_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clan_name_unique" ON "clan" USING btree (lower("name")) WHERE "clan"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clan_join_request_one_pending" ON "clan_join_request" USING btree ("user_id") WHERE "clan_join_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "clan_join_request_pending_idx" ON "clan_join_request" USING btree ("clan_id","id") WHERE "clan_join_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "clan_membership_clan_id_idx" ON "clan_membership" USING btree ("clan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clan_membership_one_owner" ON "clan_membership" USING btree ("clan_id") WHERE "clan_membership"."role" = 'owner';--> statement-breakpoint
CREATE UNIQUE INDEX "flag_subject_type_local_date_unique" ON "flag" USING btree ("subject_user_id","type","local_date");--> statement-breakpoint
CREATE INDEX "flag_status_id_idx" ON "flag" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "toast_user_id_local_date_idx" ON "toast" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "toast_clan_id_local_date_idx" ON "toast" USING btree ("clan_id","local_date");--> statement-breakpoint
CREATE INDEX "toast_photo_local_date_idx" ON "toast" USING btree ("local_date") WHERE "toast"."photo_key" IS NOT NULL;