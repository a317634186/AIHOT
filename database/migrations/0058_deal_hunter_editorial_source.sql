UPDATE sources
SET name='AI Deal Hunter', kind='external',
    config=coalesce(config,'{}'::jsonb)||'{"discovery_method":"autonomous_research"}'::jsonb,
    tier='T2', participation_mode='editorial', interval_minutes=1440,
    enabled=true, health=CASE WHEN health='paused' THEN 'unknown' ELSE health END,
    tags=ARRAY['ai_agent','autonomous_research','US'], updated_at=now()
WHERE id='ai_deal_hunter';
