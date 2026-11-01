CREATE TABLE search_releases (
 revision TEXT PRIMARY KEY, expected INTEGER NOT NULL, completed INTEGER
);
CREATE TABLE search_active (id INTEGER PRIMARY KEY CHECK(id=1), revision TEXT NOT NULL REFERENCES search_releases(revision));
CREATE TABLE search_templates (
 row_id INTEGER PRIMARY KEY, revision TEXT NOT NULL REFERENCES search_releases(revision), template_id TEXT NOT NULL,
 title TEXT NOT NULL, subject TEXT NOT NULL, keyword TEXT NOT NULL, summary TEXT NOT NULL, category TEXT NOT NULL,
 path TEXT NOT NULL, preview TEXT NOT NULL, memberships TEXT NOT NULL, assets TEXT NOT NULL,
 paper_sha TEXT, first_seen INTEGER NOT NULL, UNIQUE(revision,template_id)
);
CREATE INDEX search_current ON search_templates(revision,template_id);
CREATE VIRTUAL TABLE search_fts USING fts5(title,subject,keyword,summary,category,content='search_templates',content_rowid='row_id',
 tokenize='unicode61 remove_diacritics 2',prefix='2 3 4');
CREATE TRIGGER search_new AFTER INSERT ON search_templates BEGIN
 INSERT INTO search_fts(rowid,title,subject,keyword,summary,category)
 VALUES(new.row_id,new.title,new.subject,new.keyword,new.summary,new.category);
END;
CREATE TRIGGER search_removed AFTER DELETE ON search_templates BEGIN
 INSERT INTO search_fts(search_fts,rowid,title,subject,keyword,summary,category)
 VALUES('delete',old.row_id,old.title,old.subject,old.keyword,old.summary,old.category);
END;
