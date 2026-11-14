ALTER TABLE community_posts DROP CONSTRAINT community_posts_author_id_fkey;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_author_id_fkey FOREIGN KEY(author_id) REFERENCES community_users(id) ON DELETE CASCADE;
