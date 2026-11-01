CREATE TABLE billing_checkout_attempts (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  session_id TEXT UNIQUE
);
