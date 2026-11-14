CREATE TABLE deal_hunter_runs (
  id bigserial PRIMARY KEY,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','paused')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  found_count integer NOT NULL DEFAULT 0,
  researched_count integer NOT NULL DEFAULT 0,
  validated_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  model_calls integer NOT NULL DEFAULT 0,
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE deal_hunter_candidates (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  title text NOT NULL,
  product_url text NOT NULL,
  original_source_url text NOT NULL,
  source_name text NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL DEFAULT 'discovered',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_status text NOT NULL DEFAULT 'pending' CHECK (submission_status IN ('pending','submitted','failed','duplicate','not_qualified')),
  submission_error text,
  article_id text,
  run_id bigint REFERENCES deal_hunter_runs(id) ON DELETE SET NULL,
  researched_at timestamptz,
  scored_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deal_hunter_candidates_stage_idx ON deal_hunter_candidates(stage, updated_at DESC);
CREATE INDEX deal_hunter_candidates_submission_idx ON deal_hunter_candidates(submission_status, score DESC NULLS LAST);

CREATE TABLE deal_hunter_daily_quota (
  quota_day date PRIMARY KEY,
  timezone text NOT NULL,
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  submitted integer NOT NULL DEFAULT 0 CHECK (submitted >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags)
VALUES ('ai_deal_hunter', 'AI Deal Hunter', 'external', '{"discovery_method":"autonomous_research"}', 'T2', 'editorial', 1440, true, 'unknown', ARRAY['ai_agent','autonomous_research','US'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO settings (key, value, updated_by)
VALUES ('deal_hunter.config', '{"enabled":false,"dailyLimit":50,"scoreThreshold":80,"timezone":"America/Los_Angeles"}', 'migration')
ON CONFLICT (key) DO NOTHING;
