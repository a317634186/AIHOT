-- Keep recurring link checks and retries efficient without changing historical check records.
CREATE INDEX IF NOT EXISTS shopping_checks_integrity_lookup_idx
 ON shopping_checks(article_id,url,checked_at DESC) WHERE status='LinkMismatch';
