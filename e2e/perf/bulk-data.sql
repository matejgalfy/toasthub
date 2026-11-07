-- Synthetic volume for the performance checks (e2e/perf, docs/DEPLOY.md → Performance): 1,000 users who
-- toasted on about half the days of the last year, 1–3 toasts a time (~180k sessions, ~360k toasts).
-- Run it on a dev or test database after `db:seed`, never in production. Running it again adds nothing.

INSERT INTO "user" (display_name, email, email_verified)
SELECT 'Perf ' || n, 'perf-' || n || '@example.com', true
FROM generate_series(1, 1000) AS n
ON CONFLICT (email) DO NOTHING;

WITH sessions AS (
  INSERT INTO toast_session (user_id, created_at)
  SELECT u.id, day + interval '7 hours' + random() * interval '14 hours'
  FROM "user" AS u
  CROSS JOIN generate_series(current_date - 365, current_date - 1, interval '1 day') AS day
  WHERE u.email LIKE 'perf-%@example.com'
    AND random() < 0.5
    AND NOT EXISTS (SELECT 1 FROM toast_session AS s WHERE s.user_id = u.id)
  RETURNING id, user_id, created_at
)
INSERT INTO toast (user_id, session_id, eaten_at)
SELECT s.user_id, s.id, s.created_at
FROM sessions AS s
-- 1–3 toasts, taken from the session id so each session gets its own count.
CROSS JOIN LATERAL generate_series(1, 1 + get_byte(uuid_send(s.id), 15) % 3) AS n;

ANALYZE;
