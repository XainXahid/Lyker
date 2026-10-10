import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../data/db/", import.meta.url));
mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(dir + "lyker.sqlite");

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY,
    token       TEXT NOT NULL,
    first_name  TEXT NOT NULL,
    last_name   TEXT,
    email       TEXT,
    phone       TEXT,
    consent_at  TEXT NOT NULL,
    prefs       TEXT,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fub_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
    fub_error   TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS swipes (
    id          INTEGER PRIMARY KEY,
    lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    listing_id  INTEGER NOT NULL,
    action      TEXT NOT NULL,                    -- like | star | pass
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fub_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
    fub_error   TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (lead_id, listing_id)
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id          INTEGER PRIMARY KEY,
    lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    listing_id  INTEGER,                          -- null for a general question
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fub_status  TEXT NOT NULL DEFAULT 'pending',
    fub_error   TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0
  );
`);
