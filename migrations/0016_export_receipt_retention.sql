-- Replay receipts are not download tickets, grants, assets, or accounting records.
-- Keep the original request timestamp; replay does not extend its retention.
ALTER TABLE export_receipts ADD COLUMN made INTEGER NOT NULL DEFAULT 0;
CREATE INDEX export_receipts_made ON export_receipts(made);
-- D1 serializes writes. This guard commits or rolls back with the owning export
-- job in its batch; concurrent last-slot claims cannot exceed either ceiling.
CREATE TRIGGER export_receipts_bound BEFORE INSERT ON export_receipts
WHEN NOT EXISTS(SELECT 1 FROM export_receipts WHERE owner=NEW.owner AND idem=NEW.idem)
BEGIN
  DELETE FROM export_receipts WHERE made < unixepoch()-86400;
  SELECT CASE WHEN (SELECT COUNT(*) FROM export_receipts WHERE owner=NEW.owner)>=1024
    OR (SELECT COUNT(*) FROM export_receipts)>=100000
    THEN RAISE(ABORT,'EXPORT_RECEIPT_LIMIT') END;
END;
