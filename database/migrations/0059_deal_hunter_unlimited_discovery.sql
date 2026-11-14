-- AI Deal Hunter currently runs without a daily submission cap. Keep the quota ledger
-- for concurrency-safe accounting and future policy changes; zero means unlimited.
UPDATE settings
SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{dailyLimit}', '0'::jsonb, true),
    updated_by = 'migration',
    updated_at = now()
WHERE key = 'deal_hunter.config';
