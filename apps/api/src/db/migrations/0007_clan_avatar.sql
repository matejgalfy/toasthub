ALTER TABLE "clan" ADD COLUMN "avatar_id" smallint;--> statement-breakpoint
ALTER TABLE "clan" ADD CONSTRAINT "clan_avatar_id_range" CHECK ("clan"."avatar_id" BETWEEN 1 AND 6);