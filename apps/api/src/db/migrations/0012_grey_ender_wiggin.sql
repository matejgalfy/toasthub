ALTER TYPE "public"."flag_type" ADD VALUE 'comment_report';--> statement-breakpoint
ALTER TABLE "flag" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "flag" ADD CONSTRAINT "flag_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE set null ON UPDATE no action;