-- Capture actual observations from now on; never backdate a historical price series.
CREATE TABLE shopping_price_observations (
 id bigserial PRIMARY KEY,
 article_id text NOT NULL REFERENCES articles(id),
 observed_at timestamptz NOT NULL DEFAULT now(),
 offer_context jsonb NOT NULL,
 listed_price_cents bigint,
 checkout_price_cents bigint,
 currency text NOT NULL,
 basis text NOT NULL CHECK (basis IN ('source-reported','merchant-verified')),
 source_url text NOT NULL,
 CHECK (listed_price_cents >= 0), CHECK (checkout_price_cents >= 0)
);
CREATE INDEX shopping_price_article_time ON shopping_price_observations(article_id, observed_at);
-- Price, stock and checking timestamps are excluded. A changed variant/condition/eligibility starts a separate series.
CREATE FUNCTION shopping_price_context(d jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('product',d->'product','model',d->'model','variant',d->'variant','condition',d->'condition',
 'merchantId',d->'merchantId','seller',d->'seller','buyUrl',d->'buyUrl','currency',d->'currency','coupon',d->'coupon',
 'restrictions',d->'restrictions','membership',d->'membership','subscription',d->'subscription','shipping',d->'shipping')
$$;
CREATE FUNCTION capture_shopping_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE basis text;
BEGIN
 IF NEW.data->>'currency' <> 'USD' OR NEW.data->>'kind' NOT IN ('product_deal','coupon_offer','cashback_offer','freebie') THEN RETURN NEW; END IF;
 IF NEW.data->>'listedPriceCents' IS NULL AND NEW.data->>'checkoutPriceCents' IS NULL THEN RETURN NEW; END IF;
 basis := CASE WHEN NEW.data->>'status'='Active' AND NEW.data->>'verifiedAt' IS NOT NULL THEN 'merchant-verified' ELSE 'source-reported' END;
 IF TG_OP='UPDATE' THEN
  IF shopping_price_context(NEW.data)=shopping_price_context(OLD.data)
   AND NEW.data->'listedPriceCents' IS NOT DISTINCT FROM OLD.data->'listedPriceCents'
   AND NEW.data->'checkoutPriceCents' IS NOT DISTINCT FROM OLD.data->'checkoutPriceCents'
   AND NOT (basis='merchant-verified' AND NEW.data->'verifiedAt' IS DISTINCT FROM OLD.data->'verifiedAt') THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO shopping_price_observations(article_id,offer_context,listed_price_cents,checkout_price_cents,currency,basis,source_url)
 SELECT NEW.article_id,shopping_price_context(NEW.data),(NEW.data->>'listedPriceCents')::bigint,(NEW.data->>'checkoutPriceCents')::bigint,
 NEW.data->>'currency',basis,CASE WHEN basis='merchant-verified' THEN COALESCE(NEW.data->>'buyUrl',a.url) ELSE a.url END
 FROM articles a WHERE a.id=NEW.article_id;
 RETURN NEW;
END $$;
CREATE TRIGGER shopping_price_capture AFTER INSERT OR UPDATE ON shopping_offers FOR EACH ROW EXECUTE FUNCTION capture_shopping_price();
-- Existing amounts form a single source-reported baseline recorded at migration time.
INSERT INTO shopping_price_observations(article_id,offer_context,listed_price_cents,checkout_price_cents,currency,basis,source_url)
SELECT d.article_id,shopping_price_context(d.data),(d.data->>'listedPriceCents')::bigint,(d.data->>'checkoutPriceCents')::bigint,'USD','source-reported',a.url
FROM shopping_offers d JOIN articles a ON a.id=d.article_id
WHERE d.data->>'currency'='USD' AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
AND (d.data->>'listedPriceCents' IS NOT NULL OR d.data->>'checkoutPriceCents' IS NOT NULL);
CREATE TABLE shopping_likes (
 article_id text NOT NULL REFERENCES articles(id),
 visitor_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(article_id,visitor_hash)
);
