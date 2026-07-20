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
  row_hash        TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  signal_date     TEXT NOT NULL,
  entry_date      TEXT,
  entry_price     REAL,
  entry_mode      TEXT NOT NULL,
  status          TEXT NOT NULL,
  results_json    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, row_hash)
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

CREATE TABLE IF NOT EXISTS symbol_freshness (
  symbol          TEXT PRIMARY KEY,
  last_fetched    TEXT NOT NULL,
  data_recency    TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Master Storage tables (Phase 2)
-- Added 2026-07-17
-- ============================================================

CREATE TABLE IF NOT EXISTS resolved_symbols (
  input_symbol    TEXT PRIMARY KEY,
  resolved_symbol TEXT NOT NULL,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS symbol_data_freshness (
  symbol            TEXT PRIMARY KEY,
  data_start_date   DATE,
  data_end_date     DATE,
  latest_price      REAL,
  latest_price_date DATE,
  last_fetched      TIMESTAMPTZ,
  next_refresh_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '1 day',
  fetch_count       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sdf_refresh ON symbol_data_freshness(next_refresh_at);

CREATE TABLE IF NOT EXISTS file_upload_map (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_hash       TEXT NOT NULL,
  entry_mode      TEXT NOT NULL,
  upload_id       TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  symbol_set_hash TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, file_hash, entry_mode)
);

CREATE TABLE IF NOT EXISTS signal_results (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_hash          TEXT NOT NULL,
  upload_id         TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  signal_date       TEXT NOT NULL,
  entry_date        TEXT,
  entry_price       REAL,
  entry_mode        TEXT NOT NULL CHECK (entry_mode IN ('next_close', 'next_open')),
  duration          INTEGER NOT NULL DEFAULT 90,
  results_json      TEXT NOT NULL DEFAULT '{}',
  max_high_90d      REAL,
  max_low_90d       REAL,
  sector            TEXT,
  market_cap        TEXT,
  status            TEXT NOT NULL,
  latest_price      REAL,
  latest_price_date TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, row_hash, duration)
);

CREATE INDEX IF NOT EXISTS idx_signal_results_user_id ON signal_results(user_id);
CREATE INDEX IF NOT EXISTS idx_signal_results_upload_id ON signal_results(upload_id);
CREATE INDEX IF NOT EXISTS idx_signal_results_row_hash ON signal_results(row_hash);

-- ============================================================
-- Migration: fix cross-user dedup in signal_hashes (v1→v2)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE signal_hashes DROP CONSTRAINT IF EXISTS signal_hashes_row_hash_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE signal_hashes ADD CONSTRAINT signal_hashes_unique_user_row UNIQUE (user_id, row_hash);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Migration: add entry_mode CHECK to signal_results (if missing)
DO $$ BEGIN
  ALTER TABLE signal_results ADD CONSTRAINT signal_results_entry_mode_check
    CHECK (entry_mode IN ('next_close', 'next_open'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
