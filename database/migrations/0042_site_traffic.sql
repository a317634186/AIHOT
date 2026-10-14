-- Anonymous traffic counters for the admin statistics page. No cookies: a visitor is the hash of
-- the request address and user agent under a salt that changes daily, so counts of distinct
-- visitors exist per day and cannot be joined across days or traced back.
CREATE TABLE traffic_hits (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('view','click')),
  path text NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, path)
);
CREATE TABLE traffic_visitors (
  day date NOT NULL,
  visitor text NOT NULL,
  PRIMARY KEY (day, visitor)
);
CREATE TABLE traffic_referrers (
  day date NOT NULL,
  host text NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, host)
);
