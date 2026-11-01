-- Approved file bytes stay addressable after the current catalog projection changes.
CREATE TABLE catalog_version_files (
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  format TEXT NOT NULL,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  PRIMARY KEY (template_id,version,format)
) WITHOUT ROWID;
CREATE INDEX catalog_version_hash ON catalog_version_files(template_id,sha256);
INSERT INTO catalog_version_files(template_id,version,format,object_key,sha256,size_bytes,filename,mime)
SELECT template_id,version,format,object_key,sha256,size_bytes,filename,mime FROM downloadable_assets
WHERE template_id IS NOT NULL AND document_id IS NULL;
CREATE TRIGGER immutable_catalog_file_update BEFORE UPDATE ON catalog_version_files BEGIN
  SELECT RAISE(ABORT,'Approved catalog versions are immutable');
END;
CREATE TRIGGER immutable_catalog_file_delete BEFORE DELETE ON catalog_version_files BEGIN
  SELECT RAISE(ABORT,'Approved catalog versions are immutable');
END;
CREATE TRIGGER capture_catalog_file_insert AFTER INSERT ON downloadable_assets
WHEN NEW.template_id IS NOT NULL AND NEW.published=1 BEGIN
  INSERT INTO catalog_version_files VALUES(NEW.template_id,NEW.version,NEW.format,NEW.object_key,NEW.sha256,NEW.size_bytes,NEW.filename,NEW.mime)
  ON CONFLICT(template_id,version,format) DO UPDATE SET sha256=excluded.sha256
  WHERE object_key<>excluded.object_key OR sha256<>excluded.sha256 OR size_bytes<>excluded.size_bytes OR mime<>excluded.mime;
END;
CREATE TRIGGER capture_catalog_file_update AFTER UPDATE OF version,published,format,object_key,sha256,size_bytes,mime ON downloadable_assets
WHEN NEW.template_id IS NOT NULL AND NEW.published=1 BEGIN
  INSERT INTO catalog_version_files VALUES(NEW.template_id,NEW.version,NEW.format,NEW.object_key,NEW.sha256,NEW.size_bytes,NEW.filename,NEW.mime)
  ON CONFLICT(template_id,version,format) DO UPDATE SET sha256=excluded.sha256
  WHERE object_key<>excluded.object_key OR sha256<>excluded.sha256 OR size_bytes<>excluded.size_bytes OR mime<>excluded.mime;
END;
