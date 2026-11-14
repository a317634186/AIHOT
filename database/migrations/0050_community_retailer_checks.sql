CREATE TABLE community_retailer_checks (
 post_id text PRIMARY KEY REFERENCES community_posts(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','out_of_stock','unverified')),
 product_name text,
 seller text,
 price_cents integer CHECK (price_cents IS NULL OR price_cents>=0),
 checked_at timestamptz,
 next_check_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_retailer_checks_due_idx ON community_retailer_checks(next_check_at);
INSERT INTO community_retailer_checks(post_id)
SELECT id FROM community_posts WHERE kind='offer_submission' AND coalesce(offer_terms->>'type','product')='product'
ON CONFLICT DO NOTHING;
CREATE FUNCTION queue_community_retailer_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.kind='offer_submission' AND coalesce(NEW.offer_terms->>'type','product')='product') OR NEW.kind='review_submission' THEN
  INSERT INTO community_retailer_checks(post_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_retailer_check_on_insert AFTER INSERT ON community_posts
FOR EACH ROW EXECUTE FUNCTION queue_community_retailer_check();
