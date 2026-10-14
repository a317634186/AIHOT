-- Additive shopping evidence. The original articles, analyses, and publications remain intact.
CREATE TABLE IF NOT EXISTS shopping_offers (
 article_id text PRIMARY KEY REFERENCES articles(id),
 input_revision integer NOT NULL,
 data jsonb NOT NULL,
 identity_key text,
 next_check_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopping_recheck_idx ON shopping_offers(next_check_at);
CREATE INDEX IF NOT EXISTS shopping_identity_idx ON shopping_offers(identity_key);
CREATE TABLE IF NOT EXISTS shopping_checks (
 id bigserial PRIMARY KEY, article_id text NOT NULL REFERENCES articles(id),
 checked_at timestamptz NOT NULL DEFAULT now(), url text, status text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}', error text
);
