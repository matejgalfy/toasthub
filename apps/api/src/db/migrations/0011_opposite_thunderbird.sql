CREATE TABLE "comment_like" (
	"user_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_like_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;