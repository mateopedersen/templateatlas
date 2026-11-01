-- One recoverable producer per logical artifact, regardless of browser retry keys.
CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES member_documents(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  format TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed')),
  lease_token TEXT,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created INTEGER NOT NULL,
  UNIQUE(document_id,revision,format)
);
CREATE INDEX export_jobs_pending ON export_jobs(state,next_attempt);
