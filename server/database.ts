import Database from "better-sqlite3";
import fs from "node:fs";
import { dataDirectory, databasePath, mediaDirectory, tempDirectory } from "./config.js";

export type VideoRow = {
  id: string;
  display_name: string;
  original_filename: string;
  byte_size: number;
  imported_at: string;
  media_filename: string | null;
  duration_ms: number | null;
  content_hash: string;
  player_position_ms: number;
  playback_rate: number;
  mirrored: number;
  missing: number;
};

export type BookmarkRow = {
  id: string;
  video_id: string;
  timestamp_ms: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export function ensureDataDirectories() {
  for (const directory of [dataDirectory, mediaDirectory, tempDirectory]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
}

export function createDatabase() {
  ensureDataDirectories();
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
      imported_at TEXT NOT NULL,
      media_filename TEXT UNIQUE,
      duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms >= 0),
      content_hash TEXT NOT NULL,
      player_position_ms INTEGER NOT NULL DEFAULT 0 CHECK(player_position_ms >= 0),
      playback_rate REAL NOT NULL DEFAULT 1 CHECK(playback_rate >= .25 AND playback_rate <= 1.5),
      mirrored INTEGER NOT NULL DEFAULT 0 CHECK(mirrored IN (0, 1)),
      missing INTEGER NOT NULL DEFAULT 0 CHECK(missing IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY NOT NULL,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      timestamp_ms INTEGER NOT NULL CHECK(timestamp_ms >= 0),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookmarks_video_time ON bookmarks(video_id, timestamp_ms, created_at, id);
    INSERT OR IGNORE INTO settings(key, value, updated_at)
      VALUES ('seek_step_seconds', '1', CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
  `);
  return db;
}

export type Db = ReturnType<typeof createDatabase>;
