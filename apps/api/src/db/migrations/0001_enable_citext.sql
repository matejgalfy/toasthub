-- Case-insensitive text for user.email (SPEC §7). Ships with Postgres; CloudNativePG allows it too.
CREATE EXTENSION IF NOT EXISTS citext;
