ALTER TABLE community_posts ADD COLUMN community_type text;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_community_type_check
 CHECK (community_type IS NULL OR community_type IN ('question','review'));
UPDATE community_posts SET community_type='question' WHERE kind='discussion';
ALTER TABLE community_posts DROP CONSTRAINT community_posts_kind_check;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_kind_check
 CHECK (kind IN ('offer_submission','product_comment','discussion','reply','review_submission'));
UPDATE community_posts SET community_type='review' WHERE kind='product_comment';
UPDATE community_posts SET community_type='review' WHERE kind='review_submission';
INSERT INTO community_retailer_checks(post_id)
SELECT id FROM community_posts WHERE kind='review_submission' AND product_url IS NOT NULL
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION queue_community_retailer_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.kind='offer_submission' AND coalesce(NEW.offer_terms->>'type','product')='product') OR NEW.kind='review_submission' THEN
  INSERT INTO community_retailer_checks(post_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE INDEX community_posts_type_feed_idx ON community_posts(community_type,status,published_at DESC)
 WHERE community_type IS NOT NULL;
