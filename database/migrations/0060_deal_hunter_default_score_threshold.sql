-- Keep the configured quality floor at the requested default while discovery runs unlimited.
UPDATE settings
SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{scoreThreshold}', '80'::jsonb, true),
    updated_by = 'migration',
    updated_at = now()
WHERE key = 'deal_hunter.config'
  AND COALESCE((value->>'scoreThreshold')::integer, 80) < 80;
