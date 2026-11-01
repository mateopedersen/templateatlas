-- Owner-only, first-page draft previews have no download entitlement record.
CREATE TABLE document_previews (
 document_id TEXT NOT NULL REFERENCES member_documents(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 renderer_version TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 lease TEXT,
 try_after INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(document_id,revision,renderer_version)
) WITHOUT ROWID;
