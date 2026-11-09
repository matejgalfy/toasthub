CREATE INDEX "toast_session_created_at_idx" ON "toast_session" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
-- Every profile is public (SPEC §12 D67). The column stays until a later release, as the previous one reads it.
UPDATE "user" SET "profile_visibility" = 'public' WHERE "profile_visibility" <> 'public';
