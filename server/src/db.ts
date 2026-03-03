import { Pool } from "pg";

export const HAS_DATABASE = !!process.env.DATABASE_URL;

let _pool: Pool | null = null;
let _inited = false;

export function getPool(): Pool {
  if (!HAS_DATABASE) throw new Error("DATABASE_URL not set");
  if (_pool) return _pool;

  // Railway Postgres often works without SSL inside the private network,
  // but enabling rejectUnauthorized=false makes it robust for managed SSL endpoints.
  const useSsl = String(process.env.PGSSLMODE || "").toLowerCase() !== "disable" &&
    (process.env.NODE_ENV === "production" || String(process.env.PGSSL || "") === "1");

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });

  return _pool;
}

export async function ensureSchema() {
  if (!HAS_DATABASE) return;
  if (_inited) return;

  const pool = getPool();
  // Lightweight schema: keep the whole store as JSONB + separate events table for analytics.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_store (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(
    `INSERT INTO app_store (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_events (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT now(),
      tg_id BIGINT,
      session_id TEXT,
      event_name TEXT NOT NULL,
      props JSONB,
      app_version TEXT,
      platform TEXT,
      path TEXT
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_events_ts ON app_events(ts);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_events_event ON app_events(event_name);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_events_tg ON app_events(tg_id);`);

  _inited = true;
}
