-- Price-drop watches: a reader asks to be told when an offer's price falls. Channels are e-mail
-- (double opt-in through a token link) and browser push (the subscription itself is the consent).
CREATE TABLE price_watches (
  id bigserial PRIMARY KEY,
  article_id text NOT NULL REFERENCES articles(id),
  channel text NOT NULL CHECK (channel IN ('email','push')),
  address text NOT NULL,
  push_keys jsonb,
  token text NOT NULL UNIQUE,
  baseline_cents integer NOT NULL,
  confirmed_at timestamptz,
  last_notified_cents integer,
  last_notified_at timestamptz,
  failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, channel, address)
);
CREATE INDEX price_watches_confirmed ON price_watches (article_id) WHERE confirmed_at IS NOT NULL;
