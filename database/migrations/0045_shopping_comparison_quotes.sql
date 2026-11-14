-- Search-assisted retailer quotes are separate from product price history and never imply that
-- the merchant page itself was verified. Keep one dated comparison observation per retailer/day.
CREATE TABLE shopping_comparison_quotes (
 id bigserial PRIMARY KEY,
 article_id text NOT NULL REFERENCES shopping_offers(article_id) ON DELETE CASCADE,
 merchant_id text NOT NULL,
 observed_day date NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),
 url text NOT NULL,
 title text NOT NULL,
 seller text,
 price_cents bigint NOT NULL CHECK (price_cents >= 0),
 currency text NOT NULL CHECK (currency='USD'),
 basis text NOT NULL CHECK (basis IN ('search-reported','merchant-verified')),
 evidence_url text NOT NULL,
 evidence_title text,
 match_evidence text,
 UNIQUE(article_id,merchant_id,observed_day)
);
CREATE INDEX shopping_comparison_quote_recent ON shopping_comparison_quotes(article_id,observed_at DESC);
