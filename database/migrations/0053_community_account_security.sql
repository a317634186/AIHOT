CREATE TABLE community_recovery_codes (
 user_id text NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 code_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,code_hash)
);

CREATE TABLE community_password_resets (
 user_id text PRIMARY KEY REFERENCES community_users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);

CREATE TABLE community_security_limits (
 key_hash text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1
);
