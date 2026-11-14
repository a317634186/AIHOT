-- Reprocess comments previously held for manual review under automatic moderation.
UPDATE community_posts
SET status='pending_ai', ai_reason='Queued for automatic moderation.', updated_at=now()
WHERE kind IN ('product_comment','reply') AND status='pending_review';
