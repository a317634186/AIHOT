-- Separate a substantive offer edit from routine verification bookkeeping.
ALTER TABLE shopping_offers ADD COLUMN content_updated_at timestamptz;
UPDATE shopping_offers SET content_updated_at=updated_at;
ALTER TABLE shopping_offers ALTER COLUMN content_updated_at SET DEFAULT now();
ALTER TABLE shopping_offers ALTER COLUMN content_updated_at SET NOT NULL;
CREATE FUNCTION shopping_content_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.data - ARRAY['lastCheckedAt','verifiedAt','verificationNote']) IS DISTINCT FROM
    (OLD.data - ARRAY['lastCheckedAt','verifiedAt','verificationNote']) THEN
  NEW.content_updated_at=clock_timestamp();
 ELSE
  NEW.content_updated_at=OLD.content_updated_at;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shopping_content_timestamp BEFORE UPDATE ON shopping_offers FOR EACH ROW EXECUTE FUNCTION shopping_content_timestamp();
