CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"toast_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_body_length" CHECK (("comment"."body" IS NULL AND "comment"."deleted_at" IS NOT NULL) OR char_length("comment"."body") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_toast_id_toast_id_fk" FOREIGN KEY ("toast_id") REFERENCES "public"."toast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_toast_id_created_at_idx" ON "comment" USING btree ("toast_id","created_at","id");--> statement-breakpoint
CREATE INDEX "comment_parent_id_idx" ON "comment" USING btree ("parent_id");