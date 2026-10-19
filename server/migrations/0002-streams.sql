ALTER TABLE sync_records ADD COLUMN stream TEXT NOT NULL DEFAULT '';
CREATE INDEX sync_vault_stream_time ON sync_records (vault, stream, time DESC, id DESC);
CREATE TABLE sync_streams (
  vault TEXT NOT NULL, stream TEXT NOT NULL, seq INTEGER NOT NULL,
  PRIMARY KEY (vault, stream)
) WITHOUT ROWID;
INSERT INTO sync_streams (vault, stream, seq)
SELECT vault, stream, MAX(seq) FROM sync_records GROUP BY vault, stream;
CREATE TRIGGER sync_stream_inserted AFTER INSERT ON sync_records
BEGIN
  INSERT INTO sync_streams (vault, stream, seq) VALUES (NEW.vault, NEW.stream, NEW.seq)
  ON CONFLICT (vault, stream) DO UPDATE SET seq = MAX(seq, excluded.seq);
END;
CREATE TRIGGER sync_stream_updated AFTER UPDATE OF stream ON sync_records
WHEN NEW.stream <> OLD.stream
BEGIN
  INSERT INTO sync_streams (vault, stream, seq) VALUES (NEW.vault, NEW.stream, NEW.seq)
  ON CONFLICT (vault, stream) DO UPDATE SET seq = MAX(seq, excluded.seq);
END;
