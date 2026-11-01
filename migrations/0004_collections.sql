CREATE TABLE saved_templates (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 template_id TEXT NOT NULL, collection TEXT NOT NULL, saved INTEGER NOT NULL,
 PRIMARY KEY(user_id,template_id,collection)
);
CREATE INDEX saved_collections ON saved_templates(user_id,collection,saved DESC);
