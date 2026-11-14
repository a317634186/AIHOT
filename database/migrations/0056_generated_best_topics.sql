CREATE TABLE IF NOT EXISTS generated_best_topics (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  topic jsonb NOT NULL,
  input_hash text NOT NULL,
  generated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_best_topics_generated_idx
  ON generated_best_topics (generated_at DESC);
