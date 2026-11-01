CREATE TABLE member_closures (
  user_id TEXT PRIMARY KEY, requested INTEGER NOT NULL, billing_cleared INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX expired_drafts ON member_documents(deleted,updated);
