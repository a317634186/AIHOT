-- Avoid ambiguity between the PL/pgSQL local variable and the observation table's basis column.
CREATE OR REPLACE FUNCTION capture_shopping_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 observation_basis text;
 previous shopping_price_observations%ROWTYPE;
BEGIN
 IF NEW.data->>'currency' <> 'USD' OR NEW.data->>'kind' NOT IN ('product_deal','coupon_offer','cashback_offer','freebie') THEN RETURN NEW; END IF;
 IF NEW.data->>'listedPriceCents' IS NULL AND NEW.data->>'checkoutPriceCents' IS NULL THEN RETURN NEW; END IF;
 observation_basis := CASE WHEN NEW.data->>'status'='Active' AND NEW.data->>'verifiedAt' IS NOT NULL THEN 'merchant-verified' ELSE 'source-reported' END;
 IF TG_OP='UPDATE' AND shopping_price_context(NEW.data)=shopping_price_context(OLD.data)
  AND NEW.data->'listedPriceCents' IS NOT DISTINCT FROM OLD.data->'listedPriceCents'
  AND NEW.data->'checkoutPriceCents' IS NOT DISTINCT FROM OLD.data->'checkoutPriceCents' THEN
  IF observation_basis<>'merchant-verified' OR NEW.data->'verifiedAt' IS NOT DISTINCT FROM OLD.data->'verifiedAt' THEN RETURN NEW; END IF;
  SELECT h.* INTO previous FROM shopping_price_observations h
   WHERE h.article_id=NEW.article_id AND h.offer_context=shopping_price_context(NEW.data) AND h.basis='merchant-verified'
   ORDER BY h.observed_at DESC,h.id DESC LIMIT 1;
  IF FOUND AND previous.observed_at>now()-interval '24 hours'
   AND previous.listed_price_cents IS NOT DISTINCT FROM (NEW.data->>'listedPriceCents')::bigint
   AND previous.checkout_price_cents IS NOT DISTINCT FROM (NEW.data->>'checkoutPriceCents')::bigint THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO shopping_price_observations(article_id,offer_context,listed_price_cents,checkout_price_cents,currency,basis,source_url)
 SELECT NEW.article_id,shopping_price_context(NEW.data),(NEW.data->>'listedPriceCents')::bigint,(NEW.data->>'checkoutPriceCents')::bigint,
  NEW.data->>'currency',observation_basis,CASE WHEN observation_basis='merchant-verified' THEN COALESCE(NEW.data->>'buyUrl',a.url) ELSE a.url END
 FROM articles a WHERE a.id=NEW.article_id;
 RETURN NEW;
END $$;
