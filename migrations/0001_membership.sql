-- Better Auth core schema for the D1 / Kysely adapter.
CREATE TABLE user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY, expiresAt DATE NOT NULL, token TEXT NOT NULL UNIQUE, createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_user ON session(userId);
CREATE TABLE account (
  id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT,
  accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE, scope TEXT, password TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL,
  UNIQUE(providerId,accountId)
);
CREATE INDEX account_user ON account(userId);
CREATE TABLE verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt DATE NOT NULL, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE rateLimit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE,count INTEGER NOT NULL,lastRequest INTEGER NOT NULL);
CREATE TABLE first_verifications (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, verified_at INTEGER NOT NULL);
-- The trigger and the auth library's verification write commit together, even if the Worker stops.
CREATE TRIGGER verified_update AFTER UPDATE OF emailVerified ON user WHEN NEW.emailVerified=1 BEGIN
  INSERT OR IGNORE INTO first_verifications VALUES(NEW.id,unixepoch());
END;
CREATE TRIGGER verified_insert AFTER INSERT ON user WHEN NEW.emailVerified=1 BEGIN
  INSERT OR IGNORE INTO first_verifications VALUES(NEW.id,unixepoch());
END;
CREATE TABLE billing_customers (user_id TEXT PRIMARY KEY REFERENCES user(id), stripe_id TEXT UNIQUE NOT NULL);
CREATE TABLE billing_events (event_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, received INTEGER NOT NULL, applied INTEGER);
CREATE INDEX billing_pending ON billing_events(applied,received);
CREATE TABLE member_documents (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, template_id TEXT, revision INTEGER NOT NULL CHECK(revision>=1),
  current_key TEXT NOT NULL, title TEXT NOT NULL, updated INTEGER NOT NULL, deleted INTEGER
);
CREATE INDEX documents_owner ON member_documents(owner,deleted);
CREATE TABLE member_revisions (
  document_id TEXT NOT NULL REFERENCES member_documents(id), revision INTEGER NOT NULL, object_key TEXT NOT NULL,
  PRIMARY KEY(document_id,revision)
);
CREATE TABLE downloadable_assets (
  id TEXT PRIMARY KEY, template_id TEXT, version TEXT NOT NULL, format TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64), size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  filename TEXT NOT NULL, mime TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  document_id TEXT REFERENCES member_documents(id), document_revision INTEGER, renderer_version TEXT,
  CHECK((template_id IS NOT NULL AND document_id IS NULL) OR (template_id IS NULL AND document_id IS NOT NULL AND document_revision IS NOT NULL))
);
CREATE UNIQUE INDEX current_asset ON downloadable_assets(template_id,format) WHERE published=1 AND document_id IS NULL;
CREATE UNIQUE INDEX current_export ON downloadable_assets(document_id,document_revision,format) WHERE published=1;
CREATE TABLE export_receipts (
  owner TEXT NOT NULL, idem TEXT NOT NULL, fingerprint TEXT NOT NULL, asset_id TEXT REFERENCES downloadable_assets(id),
  PRIMARY KEY(owner,idem)
);
CREATE TABLE guest_transfers (guest TEXT PRIMARY KEY, target TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
ALTER TABLE member_documents ADD COLUMN source_version TEXT;
