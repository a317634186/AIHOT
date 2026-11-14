CREATE TABLE IF NOT EXISTS shopping_hub_seo_titles (
  path text PRIMARY KEY,
  seo_title text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
