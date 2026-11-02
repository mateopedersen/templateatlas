CREATE TABLE IF NOT EXISTS collection_imports (
  id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL,
  files INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
