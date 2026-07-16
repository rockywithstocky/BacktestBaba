-- PostgreSQL schema for BacktestBaba persistence layer
-- Ported from D1 (SQLite) migration 001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  plan            TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'priority')),
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  max_signals     INTEGER NOT NULL DEFAULT 100,
  max_file_size_mb INTEGER NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_hash         TEXT NOT NULL,
  filename          TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size         INTEGER NOT NULL,
  source_info       TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'processing', 'completed', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_file_hash ON ingestion_log(file_hash);
CREATE INDEX IF NOT EXISTS idx_ingestion_status ON ingestion_log(status);

CREATE TABLE IF NOT EXISTS uploads (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_hash       TEXT NOT NULL,
  filename        TEXT NOT NULL,
  entry_mode      TEXT NOT NULL DEFAULT 'next_close'
                  CHECK (entry_mode IN ('next_close', 'next_open')),
  signal_count    INTEGER NOT NULL DEFAULT 0,
  trade_count     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'partial', 'failed')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_file_hash ON uploads(file_hash);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);

CREATE TABLE IF NOT EXISTS signal_hashes (
  id              TEXT PRIMARY KEY,
  upload_id       TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  row_hash        TEXT NOT NULL UNIQUE,
  symbol          TEXT NOT NULL,
  signal_date     TEXT NOT NULL,
  entry_date      TEXT,
  entry_price     REAL,
  entry_mode      TEXT NOT NULL,
  status          TEXT NOT NULL,
  results_json    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_hashes_row_hash ON signal_hashes(row_hash);
CREATE INDEX IF NOT EXISTS idx_signal_hashes_upload_id ON signal_hashes(upload_id);
CREATE INDEX IF NOT EXISTS idx_signal_hashes_user_id ON signal_hashes(user_id);

CREATE TABLE IF NOT EXISTS quota (
  id              INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  total_writes    INTEGER NOT NULL DEFAULT 0,
  write_limit     INTEGER NOT NULL DEFAULT 1000000,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO quota (total_writes, write_limit)
SELECT 0, 1000000
WHERE NOT EXISTS (SELECT 1 FROM quota);
