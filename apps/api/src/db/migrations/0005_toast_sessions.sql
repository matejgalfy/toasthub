CREATE TABLE "discarded_photo" (
	"key" text PRIMARY KEY NOT NULL,
	"toast_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toast_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'Europe/Bratislava')::date) STORED NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "toast" ADD COLUMN "session_id" uuid;--> statement-breakpoint
-- Every existing toast becomes its own session, logged when it was eaten (so its day matches) and
-- reusing the toast's id.
INSERT INTO "toast_session" ("id", "user_id", "deleted_at", "created_at")
  SELECT "id", "user_id", "deleted_at", "eaten_at" FROM "toast";--> statement-breakpoint
UPDATE "toast" SET "session_id" = "id";--> statement-breakpoint
ALTER TABLE "toast" ALTER COLUMN "session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "discarded_photo" ADD CONSTRAINT "discarded_photo_toast_id_toast_id_fk" FOREIGN KEY ("toast_id") REFERENCES "public"."toast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toast_session" ADD CONSTRAINT "toast_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discarded_photo_toast_id_idx" ON "discarded_photo" USING btree ("toast_id");--> statement-breakpoint
CREATE INDEX "toast_session_user_id_created_at_idx" ON "toast_session" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "toast" ADD CONSTRAINT "toast_session_id_toast_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."toast_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "toast_session_id_idx" ON "toast" USING btree ("session_id");