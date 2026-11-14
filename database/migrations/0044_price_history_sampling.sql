-- Keep unchanged retailer prices as daily evidence instead of recording every 30-minute check.
-- Price changes and a return to an earlier price are always recorded immediately.
CREATE OR REPLACE FUNCTION capture_shopping_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 basis text;
 previous shopping_price_observations%ROWTYPE;
BEGIN
 IF NEW.data->>'currency' <> 'USD' OR NEW.data->>'kind' NOT IN ('product_deal','coupon_offer','cashback_offer','freebie') THEN RETURN NEW; END IF;
 IF NEW.data->>'listedPriceCents' IS NULL AND NEW.data->>'checkoutPriceCents' IS NULL THEN RETURN NEW; END IF;
 basis := CASE WHEN NEW.data->>'status'='Active' AND NEW.data->>'verifiedAt' IS NOT NULL THEN 'merchant-verified' ELSE 'source-reported' END;
 IF TG_OP='UPDATE' AND shopping_price_context(NEW.data)=shopping_price_context(OLD.data)
  AND NEW.data->'listedPriceCents' IS NOT DISTINCT FROM OLD.data->'listedPriceCents'
  AND NEW.data->'checkoutPriceCents' IS NOT DISTINCT FROM OLD.data->'checkoutPriceCents' THEN
  IF basis<>'merchant-verified' OR NEW.data->'verifiedAt' IS NOT DISTINCT FROM OLD.data->'verifiedAt' THEN RETURN NEW; END IF;
  SELECT * INTO previous FROM shopping_price_observations
   WHERE article_id=NEW.article_id AND offer_context=shopping_price_context(NEW.data) AND basis='merchant-verified'
   ORDER BY observed_at DESC,id DESC LIMIT 1;
  IF FOUND AND previous.observed_at>now()-interval '24 hours'
   AND previous.listed_price_cents IS NOT DISTINCT FROM (NEW.data->>'listedPriceCents')::bigint
   AND previous.checkout_price_cents IS NOT DISTINCT FROM (NEW.data->>'checkoutPriceCents')::bigint THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO shopping_price_observations(article_id,offer_context,listed_price_cents,checkout_price_cents,currency,basis,source_url)
 SELECT NEW.article_id,shopping_price_context(NEW.data),(NEW.data->>'listedPriceCents')::bigint,(NEW.data->>'checkoutPriceCents')::bigint,
  NEW.data->>'currency',basis,CASE WHEN basis='merchant-verified' THEN COALESCE(NEW.data->>'buyUrl',a.url) ELSE a.url END
 FROM articles a WHERE a.id=NEW.article_id;
 RETURN NEW;
END $$;

CREATE INDEX shopping_price_article_basis_time ON shopping_price_observations(article_id,basis,observed_at DESC);
