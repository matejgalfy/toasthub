ALTER TABLE "user" DROP CONSTRAINT "user_avatar_id_range";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_avatar_id_range" CHECK ("user"."avatar_id" BETWEEN 1 AND 8);