CREATE TABLE community_users (
 id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{20,40}$'),
 handle text NOT NULL,
 handle_key text NOT NULL UNIQUE,
 email text,
 password_salt text NOT NULL,
 password_hash text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
 points integer NOT NULL DEFAULT 0 CHECK (points>=0),
 level smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 4),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_login_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX community_users_email_unique ON community_users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE community_sessions (
 id_hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 csrf_token text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 user_agent text
);
CREATE INDEX community_sessions_user_idx ON community_sessions(user_id,expires_at DESC);

CREATE TABLE community_posts (
 id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{20,40}$'),
 author_id text NOT NULL REFERENCES community_users(id),
 kind text NOT NULL CHECK (kind IN ('offer_submission','product_comment','discussion','reply')),
 article_id text REFERENCES articles(id) ON DELETE CASCADE,
 parent_id text REFERENCES community_posts(id) ON DELETE CASCADE,
 category text,
 title text,
 body text NOT NULL,
 merchant_id text,
 product_url text,
 reported_price_cents integer CHECK (reported_price_cents IS NULL OR reported_price_cents>=0),
 price_currency text NOT NULL DEFAULT 'USD' CHECK (price_currency='USD'),
 offer_terms jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending_ai' CHECK (status IN ('pending_ai','reviewing','pending_review','published','rejected','removed')),
 ai_decision text CHECK (ai_decision IN ('allow','reject','review')),
 ai_confidence numeric(4,3) CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
 ai_flags text[] NOT NULL DEFAULT '{}',
 ai_reason text,
 ai_reviewed_at timestamptz,
 moderated_by bigint REFERENCES admin_users(id),
 moderation_reason text,
 ip_hash text,
 content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(author_id,content_hash)
);
CREATE INDEX community_posts_feed_idx ON community_posts(kind,status,published_at DESC);
CREATE INDEX community_posts_item_idx ON community_posts(article_id,status,created_at DESC);
CREATE INDEX community_posts_parent_idx ON community_posts(parent_id,status,created_at);
CREATE INDEX community_posts_moderation_idx ON community_posts(status,created_at) WHERE status IN ('pending_ai','pending_review','reviewing');
CREATE INDEX community_posts_ip_recent_idx ON community_posts(ip_hash,created_at DESC) WHERE ip_hash IS NOT NULL;

CREATE TABLE community_votes (
 user_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 target_type text NOT NULL CHECK (target_type IN ('article','post')),
 target_id text NOT NULL,
 value smallint NOT NULL CHECK (value IN (-1,1)),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,target_type,target_id)
);
CREATE INDEX community_votes_target_idx ON community_votes(target_type,target_id);

CREATE TABLE community_bookmarks (
 user_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 article_id text NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,article_id)
);
CREATE INDEX community_bookmarks_user_idx ON community_bookmarks(user_id,created_at DESC);
ALTER TABLE price_watches ADD COLUMN community_user_id text REFERENCES community_users(id) ON DELETE SET NULL;
CREATE INDEX price_watches_member_idx ON price_watches(community_user_id,created_at DESC) WHERE community_user_id IS NOT NULL;

CREATE TABLE community_notifications (
 id bigserial PRIMARY KEY,
 user_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 kind text NOT NULL,
 post_id text REFERENCES community_posts(id) ON DELETE CASCADE,
 message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz
);
CREATE INDEX community_notifications_user_idx ON community_notifications(user_id,created_at DESC);

CREATE TABLE community_point_events (
 id bigserial PRIMARY KEY,
 user_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 post_id text REFERENCES community_posts(id) ON DELETE CASCADE,
 reason text NOT NULL,
 points integer NOT NULL CHECK (points>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,post_id,reason)
);

CREATE TABLE community_reports (
 id bigserial PRIMARY KEY,
 post_id text NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
 reporter_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
 UNIQUE(post_id,reporter_id)
);
CREATE INDEX community_reports_queue_idx ON community_reports(status,created_at DESC);
