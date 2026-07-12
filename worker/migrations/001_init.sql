-- 001_init.sql — D1 Persistence Schema
-- Order matters: tables with FK refs must be created after their parent.

-- ============================================================
-- USERS — identity, plan tier, admin flag
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  plan            TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'priority')),
  is_admin        INTEGER NOT NULL DEFAULT 0,
  max_signals     INTEGER NOT NULL DEFAULT 100,
  max_file_size_mb INTEGER NOT NULL DEFAULT 2,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);

-- ============================================================
-- SESSIONS — token-based auth, revocable
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  revoked         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- ============================================================
-- INGESTION_LOG — immediate write on file touch (Pillar 3)
-- Written BEFORE any processing. Filename stored raw for audit.
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion_log (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  file_hash         TEXT NOT NULL,
  filename          TEXT NOT NULL,       -- normalized
  original_filename TEXT NOT NULL,       -- raw, untrusted, as-received
  file_size         INTEGER NOT NULL,
  source_info       TEXT,                -- browser UA, tool name, etc.
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'processing', 'completed', 'failed')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_ingestion_file_hash ON ingestion_log(file_hash);
CREATE INDEX idx_ingestion_status ON ingestion_log(status);

-- ============================================================
-- UPLOADS — per-upload metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS uploads (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  file_hash       TEXT NOT NULL,
  filename        TEXT NOT NULL,
  entry_mode      TEXT NOT NULL DEFAULT 'next_close'
                  CHECK (entry_mode IN ('next_close', 'next_open')),
  signal_count    INTEGER NOT NULL DEFAULT 0,
  trade_count     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'partial', 'failed')),
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_uploads_file_hash ON uploads(file_hash);
CREATE INDEX idx_uploads_created_at ON uploads(created_at);

-- ============================================================
-- SIGNAL_HASHES — per-trade dedup + results (Pillar 4)
-- row_hash = SHA256(symbol + "|" + signal_date + "|" + entry_mode)
-- ============================================================
CREATE TABLE IF NOT EXISTS signal_hashes (
  id              TEXT PRIMARY KEY,
  upload_id       TEXT NOT NULL,
  user_id         TEXT,
  row_hash        TEXT NOT NULL UNIQUE,
  symbol          TEXT NOT NULL,
  signal_date     TEXT NOT NULL,
  entry_date      TEXT,
  entry_price     REAL,
  entry_mode      TEXT NOT NULL,
  status          TEXT NOT NULL,
  results_json    TEXT,                  -- ALL horizon data as JSON blob
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_signal_hashes_row_hash ON signal_hashes(row_hash);
CREATE INDEX idx_signal_hashes_upload_id ON signal_hashes(upload_id);
CREATE INDEX idx_signal_hashes_user_id ON signal_hashes(user_id);

-- ============================================================
-- QUOTA — singleton write counter (Pillar 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS quota (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  total_writes    INTEGER NOT NULL DEFAULT 0,
  write_limit     INTEGER NOT NULL DEFAULT 1000000,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO quota (id, total_writes, write_limit) VALUES (1, 0, 1000000);
