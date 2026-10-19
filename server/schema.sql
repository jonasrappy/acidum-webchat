CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  charged INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 0,
  lease TEXT NOT NULL DEFAULT '',
  lease_until INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL DEFAULT '',
  uploads INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sync_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS sync_records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  vault TEXT NOT NULL,
  id TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'log')),
  time INTEGER NOT NULL,
  iv TEXT NOT NULL,
  data TEXT NOT NULL,
  charge INTEGER NOT NULL,
  UNIQUE (vault, id)
);
CREATE INDEX IF NOT EXISTS sync_vault_time ON sync_records (vault, time DESC, id DESC);
CREATE INDEX IF NOT EXISTS sync_vault_seq ON sync_records (vault, seq);
CREATE INDEX IF NOT EXISTS sync_oldest ON sync_records (time, seq);

CREATE TRIGGER IF NOT EXISTS sync_capacity BEFORE INSERT ON sync_records
WHEN NOT EXISTS (SELECT 1 FROM sync_records WHERE vault = NEW.vault AND id = NEW.id)
BEGIN
  SELECT CASE WHEN (SELECT charged FROM sync_state WHERE id = 1) + NEW.charge > 280000000
    THEN RAISE(ABORT, 'sync_capacity') END;
  SELECT CASE WHEN (SELECT inserted FROM sync_state WHERE id = 1) >= 4000
    THEN RAISE(ABORT, 'sync_daily_limit') END;
END;
CREATE TRIGGER IF NOT EXISTS sync_inserted AFTER INSERT ON sync_records
BEGIN
  UPDATE sync_state SET charged = charged + NEW.charge, records = records + 1, inserted = inserted + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS sync_deleted AFTER DELETE ON sync_records
BEGIN
  UPDATE sync_state SET charged = MAX(0, charged - OLD.charge), records = MAX(0, records - 1) WHERE id = 1;
END;

CREATE INDEX IF NOT EXISTS sync_vault_log ON sync_records (vault, time DESC, id DESC) WHERE kind = 'log';

CREATE INDEX IF NOT EXISTS sync_vault_stream_time ON sync_records (vault, stream, time DESC, id DESC);
CREATE TABLE IF NOT EXISTS sync_streams (
  vault TEXT NOT NULL, stream TEXT NOT NULL, seq INTEGER NOT NULL,
  PRIMARY KEY (vault, stream)
) WITHOUT ROWID;
INSERT OR IGNORE INTO sync_streams (vault, stream, seq)
SELECT vault, stream, MAX(seq) FROM sync_records GROUP BY vault, stream;
CREATE TRIGGER IF NOT EXISTS sync_stream_inserted AFTER INSERT ON sync_records
BEGIN
  INSERT INTO sync_streams (vault, stream, seq) VALUES (NEW.vault, NEW.stream, NEW.seq)
  ON CONFLICT (vault, stream) DO UPDATE SET seq = MAX(seq, excluded.seq);
END;
CREATE TRIGGER IF NOT EXISTS sync_stream_updated AFTER UPDATE OF stream ON sync_records
WHEN NEW.stream <> OLD.stream
BEGIN
  INSERT INTO sync_streams (vault, stream, seq) VALUES (NEW.vault, NEW.stream, NEW.seq)
  ON CONFLICT (vault, stream) DO UPDATE SET seq = MAX(seq, excluded.seq);
END;
