import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import Busboy from "busboy";
import express from "express";
import type { Request, Response } from "express";
import { maxUploadBytes, mediaDirectory, tempDirectory } from "./config.js";
import { createDatabase, type BookmarkRow, type Db, type VideoRow } from "./database.js";
import { managedMediaPath, serveMedia } from "./media.js";
import { localRequestOnly } from "./security.js";
import { ApiError, assertId, extensionFor, finiteNumber, hashPattern, integer, safeBasename, text } from "./validation.js";

const jsonLimit = "2mb";
const now = () => new Date().toISOString();

function videoDto(row: VideoRow) {
  return {
    id: row.id, displayName: row.display_name, originalFilename: row.original_filename,
    byteSize: row.byte_size, importedAt: row.imported_at, durationMs: row.duration_ms,
    contentHash: row.content_hash, positionMs: row.player_position_ms, playbackRate: row.playback_rate,
    mirrored: Boolean(row.mirrored), missing: Boolean(row.missing), mediaUrl: `/api/videos/${row.id}/media`,
  };
}
function bookmarkDto(row: BookmarkRow) {
  return { id: row.id, videoId: row.video_id, timestampMs: row.timestamp_ms, title: row.title, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}
function getVideo(db: Db, id: string): VideoRow {
  const row = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow | undefined;
  if (!row) throw new ApiError(404, "Video not found.", "not_found");
  return row;
}
function getBookmark(db: Db, id: string): BookmarkRow {
  const row = db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(id) as BookmarkRow | undefined;
  if (!row) throw new ApiError(404, "Bookmark not found.", "not_found");
  return row;
}
function setting(db: Db, key: string): string | undefined {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value;
}
function setSetting(db: Db, key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(key, value, now());
}
function appSettings(db: Db) {
  const seek = Number(setting(db, "seek_step_seconds") || 1);
  return { seekStepSeconds: seek, lastVideoId: setting(db, "last_video_id") || null, dataDirectory: path.dirname(mediaDirectory), mediaDirectory };
}

type UploadedFile = { tempPath: string; originalFilename: string; extension: string; bytes: number; hash: string };
/** Streams one multipart file through a hash transform; no video bytes are buffered in memory. */
function receiveUpload(req: Request): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    let upload: UploadedFile | undefined;
    let failed: Error | undefined;
    let fileCount = 0;
    const cleanup = () => { if (upload) void fsp.rm(upload.tempPath, { force: true }); };
    let writerDone: Promise<void> = Promise.resolve();
    let parser: ReturnType<typeof Busboy>;
    try { parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxUploadBytes, fields: 8, parts: 10 } }); }
    catch { reject(new ApiError(400, "Expected a multipart video upload.")); return; }
    parser.on("file", (_field, stream, info) => {
      fileCount += 1;
      if (fileCount > 1) { stream.resume(); failed = new ApiError(400, "Upload exactly one video file."); return; }
      try {
        const originalFilename = safeBasename(info.filename || "video");
        const extension = extensionFor(originalFilename);
        const tempPath = path.join(tempDirectory, `${crypto.randomUUID()}.upload`);
        const hash = crypto.createHash("sha256");
        let bytes = 0;
        const meter = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; hash.update(chunk); callback(null, chunk); } });
        const output = fs.createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
        upload = { tempPath, originalFilename, extension, bytes: 0, hash: "" };
        stream.on("limit", () => { failed = new ApiError(413, `Video exceeds the ${Math.floor(maxUploadBytes / 1024 / 1024)} MB import limit.`, "file_too_large"); });
        stream.on("error", (error) => { failed = error; });
        writerDone = new Promise((resolve, reject) => {
          output.once("error", reject);
          output.once("finish", () => { if (upload) { upload.bytes = bytes; upload.hash = hash.digest("hex"); } resolve(); });
        });
        stream.pipe(meter).pipe(output);
      } catch (error) { stream.resume(); failed = error as Error; }
    });
    parser.on("error", (error) => { cleanup(); reject(error); });
    parser.on("finish", () => {
      // Wait until the destination writer flushes, including a slow disk.
      const settle = async () => {
        try { await writerDone; } catch (error) { failed = error as Error; }
        if (failed || !upload || !upload.hash) { cleanup(); reject(failed || new ApiError(400, "Choose one video file to import.")); }
        else resolve(upload);
      };
      void settle();
    });
    req.on("aborted", () => { failed = new ApiError(499, "Import cancelled.", "cancelled"); cleanup(); });
    req.pipe(parser);
  });
}

async function moveIntoLibrary(upload: UploadedFile, id: string) {
  const filename = `${id}${upload.extension}`;
  const destination = managedMediaPath(filename);
  try { await fsp.rename(upload.tempPath, destination); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EXDEV") { await fsp.copyFile(upload.tempPath, destination, fs.constants.COPYFILE_EXCL); await fsp.rm(upload.tempPath, { force: true }); }
    else throw error;
  }
  return filename;
}

function validateBookmark(body: unknown, duration: number | null) {
  if (!body || typeof body !== "object") throw new ApiError(400, "Expected a JSON bookmark.");
  const value = body as Record<string, unknown>;
  const timestampMs = integer(value.timestampMs, "Timestamp", 0, Number.MAX_SAFE_INTEGER);
  if (duration !== null && timestampMs > duration) throw new ApiError(400, "Timestamp is beyond this video's duration.");
  return { timestampMs, title: text(value.title, "Title", 300), description: text(value.description ?? "", "Description", 10000, false) };
}

export function createApp(db = createDatabase()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(localRequestOnly);
  app.use(express.json({ limit: jsonLimit }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/config", (_req, res) => res.json({ maxUploadBytes, dataDirectory: path.dirname(mediaDirectory), mediaDirectory }));
  app.get("/api/settings", (_req, res) => res.json(appSettings(db)));
  app.put("/api/settings", (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "seekStepSeconds")) {
      const step = finiteNumber(body.seekStepSeconds, "Seek step", .1, 60);
      if (Math.round(step * 10) !== step * 10) throw new ApiError(400, "Seek step uses 0.1-second increments.");
      setSetting(db, "seek_step_seconds", String(step));
    }
    if (Object.prototype.hasOwnProperty.call(body, "lastVideoId")) {
      const id = body.lastVideoId;
      if (id !== null) getVideo(db, assertId(id));
      setSetting(db, "last_video_id", id === null ? "" : String(id));
    }
    res.json(appSettings(db));
  });

  app.get("/api/videos", (_req, res) => {
    const rows = db.prepare("SELECT * FROM videos ORDER BY imported_at DESC, id DESC").all() as VideoRow[];
    res.json({ videos: rows.map(videoDto) });
  });
  app.post("/api/videos", async (req, res, next) => {
    try {
      const upload = await receiveUpload(req); const id = crypto.randomUUID(); let filename: string | undefined;
      try {
        filename = await moveIntoLibrary(upload, id);
        const importedAt = now();
        db.prepare("INSERT INTO videos(id,display_name,original_filename,byte_size,imported_at,media_filename,duration_ms,content_hash,player_position_ms,playback_rate,mirrored,missing) VALUES(?,?,?,?,?,?,?,?,0,1,0,0)")
          .run(id, upload.originalFilename, upload.originalFilename, upload.bytes, importedAt, filename, null, upload.hash);
        res.status(201).json({ video: videoDto(getVideo(db, id)) });
      } catch (error) { if (filename) await fsp.rm(managedMediaPath(filename), { force: true }); throw error; }
    } catch (error) { next(error); }
  });
  app.patch("/api/videos/:id", (req, res) => {
    const id = assertId(req.params.id); const video = getVideo(db, id); const body = req.body as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(body, "displayName")) throw new ApiError(400, "Provide a display name.");
    const displayName = text(body.displayName, "Display name", 300);
    db.prepare("UPDATE videos SET display_name=? WHERE id=?").run(displayName, id);
    res.json({ video: videoDto({ ...video, display_name: displayName }) });
  });
  app.delete("/api/videos/:id", async (req, res, next) => {
    try {
      const id = assertId(req.params.id); const video = getVideo(db, id);
      const stagedName = video.media_filename ? `${crypto.randomUUID()}.delete` : undefined;
      if (video.media_filename) {
        try { await fsp.rename(managedMediaPath(video.media_filename), managedMediaPath(stagedName!)); }
        catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      try {
        db.transaction(() => { db.prepare("DELETE FROM videos WHERE id = ?").run(id); if (setting(db, "last_video_id") === id) setSetting(db, "last_video_id", ""); })();
      } catch (error) {
        if (video.media_filename && stagedName) await fsp.rename(managedMediaPath(stagedName), managedMediaPath(video.media_filename)).catch(() => undefined);
        throw error;
      }
      if (stagedName) await fsp.rm(managedMediaPath(stagedName), { force: true });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  app.put("/api/videos/:id/state", (req, res) => {
    const id = assertId(req.params.id); const video = getVideo(db, id); const body = req.body as Record<string, unknown>;
    const positionMs = Object.prototype.hasOwnProperty.call(body, "positionMs") ? integer(body.positionMs, "Position", 0, Number.MAX_SAFE_INTEGER) : video.player_position_ms;
    const playbackRate = Object.prototype.hasOwnProperty.call(body, "playbackRate") ? finiteNumber(body.playbackRate, "Playback rate", .25, 1.5) : video.playback_rate;
    const mirrored = Object.prototype.hasOwnProperty.call(body, "mirrored") ? body.mirrored : Boolean(video.mirrored);
    if (typeof mirrored !== "boolean") throw new ApiError(400, "Mirror must be true or false.");
    const durationMs = Object.prototype.hasOwnProperty.call(body, "durationMs") ? integer(body.durationMs, "Duration", 0, Number.MAX_SAFE_INTEGER) : video.duration_ms;
    if (durationMs !== null && positionMs > durationMs) throw new ApiError(400, "Position is beyond duration.");
    db.prepare("UPDATE videos SET player_position_ms=?, playback_rate=?, mirrored=?, duration_ms=COALESCE(?,duration_ms) WHERE id=?").run(positionMs, playbackRate, mirrored ? 1 : 0, durationMs, id);
    res.json({ video: videoDto(getVideo(db, id)) });
  });
  app.get("/api/videos/:id/media", async (req, res, next) => { try { await serveMedia(db, req, res, getVideo(db, assertId(req.params.id))); } catch (error) { next(error); } });
  app.head("/api/videos/:id/media", async (req, res, next) => { try { await serveMedia(db, req, res, getVideo(db, assertId(req.params.id))); } catch (error) { next(error); } });
  const reconnectVideo = async (req: Request, res: Response, next: express.NextFunction) => {
    try {
      const id = assertId(req.params.id); const video = getVideo(db, id); const upload = await receiveUpload(req);
      if (upload.hash !== video.content_hash) { await fsp.rm(upload.tempPath, { force: true }); throw new ApiError(409, "This file does not match the original imported video.", "hash_mismatch"); }
      const filename = await moveIntoLibrary(upload, id);
      if (video.media_filename && video.media_filename !== filename) await fsp.rm(managedMediaPath(video.media_filename), { force: true });
      db.prepare("UPDATE videos SET media_filename=?, byte_size=?, original_filename=?, missing=0 WHERE id=?").run(filename, upload.bytes, upload.originalFilename, id);
      res.json({ video: videoDto(getVideo(db, id)) });
    } catch (error) { next(error); }
  };
  app.post("/api/videos/:id/recover", reconnectVideo);
  app.post("/api/videos/:id/reconnect", reconnectVideo);

  app.get("/api/videos/:id/bookmarks", (req, res) => {
    const id = assertId(req.params.id); getVideo(db, id);
    const rows = db.prepare("SELECT * FROM bookmarks WHERE video_id=? ORDER BY timestamp_ms, created_at, id").all(id) as BookmarkRow[];
    res.json({ bookmarks: rows.map(bookmarkDto) });
  });
  app.post("/api/videos/:id/bookmarks", (req, res) => {
    const id = assertId(req.params.id); const video = getVideo(db, id); const input = validateBookmark(req.body, video.duration_ms); const timestamp = now(); const bookmark: BookmarkRow = { id: crypto.randomUUID(), video_id: id, timestamp_ms: input.timestampMs, title: input.title, description: input.description, created_at: timestamp, updated_at: timestamp };
    db.prepare("INSERT INTO bookmarks(id,video_id,timestamp_ms,title,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(bookmark.id, bookmark.video_id, bookmark.timestamp_ms, bookmark.title, bookmark.description, bookmark.created_at, bookmark.updated_at);
    res.status(201).json({ bookmark: bookmarkDto(bookmark) });
  });
  app.patch("/api/bookmarks/:id", (req, res) => {
    const id = assertId(req.params.id); const old = getBookmark(db, id); const video = getVideo(db, old.video_id); const body = req.body as Record<string, unknown>;
    const input = validateBookmark({ timestampMs: body.timestampMs ?? old.timestamp_ms, title: body.title ?? old.title, description: body.description ?? old.description }, video.duration_ms);
    const updated = now(); db.prepare("UPDATE bookmarks SET timestamp_ms=?,title=?,description=?,updated_at=? WHERE id=?").run(input.timestampMs, input.title, input.description, updated, id);
    res.json({ bookmark: bookmarkDto({ ...old, timestamp_ms: input.timestampMs, title: input.title, description: input.description, updated_at: updated }) });
  });
  app.delete("/api/bookmarks/:id", (req, res) => { const id = assertId(req.params.id); getBookmark(db, id); db.prepare("DELETE FROM bookmarks WHERE id=?").run(id); res.status(204).end(); });

  app.get("/api/metadata/export", (_req, res) => {
    const videos = db.prepare("SELECT * FROM videos ORDER BY imported_at,id").all() as VideoRow[];
    const bookmarks = db.prepare("SELECT * FROM bookmarks ORDER BY created_at,id").all() as BookmarkRow[];
    res.set("Content-Disposition", 'attachment; filename="lindyloop-metadata.json"').json({
      version: 1, exportedAt: now(), settings: (() => { const settings = appSettings(db); return { seekStepSeconds: settings.seekStepSeconds, lastVideoId: settings.lastVideoId }; })(),
      videos: videos.map((video) => ({ id: video.id, displayName: video.display_name, originalFilename: video.original_filename, byteSize: video.byte_size, importedAt: video.imported_at, durationMs: video.duration_ms, contentHash: video.content_hash, positionMs: video.player_position_ms, playbackRate: video.playback_rate, mirrored: Boolean(video.mirrored), missing: Boolean(video.missing) })),
      bookmarks: bookmarks.map(bookmarkDto),
    });
  });
  app.post("/api/metadata/import", (req, res) => {
    const result = importMetadata(db, req.body); res.json(result);
  });
  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const apiError = error instanceof ApiError ? error : new ApiError(500, "The local server could not complete that request.", "internal_error");
    if (!(error instanceof ApiError)) console.error(error);
    res.status(apiError.status).json({ error: apiError.message, code: apiError.code });
  });
  return app;
}

function importMetadata(db: Db, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Invalid metadata export.");
  const payload = input as Record<string, unknown>;
  if (payload.version !== 1 || !Array.isArray(payload.videos) || !Array.isArray(payload.bookmarks)) throw new ApiError(400, "Unsupported metadata export.");
  if (payload.videos.length > 10000 || payload.bookmarks.length > 100000) throw new ApiError(400, "Metadata export is too large.");
  const videos = payload.videos.map((raw) => {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "Invalid video metadata."); const v = raw as Record<string, unknown>;
    const id = assertId(v.id); if (typeof v.contentHash !== "string" || !hashPattern.test(v.contentHash)) throw new ApiError(400, "Invalid video hash.");
    return { id, displayName: text(v.displayName, "Display name", 300), originalFilename: safeBasename(text(v.originalFilename, "Original filename", 255)), byteSize: integer(v.byteSize, "Byte size", 0, Number.MAX_SAFE_INTEGER), importedAt: typeof v.importedAt === "string" && !Number.isNaN(Date.parse(v.importedAt)) ? v.importedAt : now(), durationMs: v.durationMs === null || v.durationMs === undefined ? null : integer(v.durationMs, "Duration", 0, Number.MAX_SAFE_INTEGER), contentHash: v.contentHash.toLowerCase(), positionMs: v.positionMs === undefined ? 0 : integer(v.positionMs, "Position", 0, Number.MAX_SAFE_INTEGER), playbackRate: v.playbackRate === undefined ? 1 : finiteNumber(v.playbackRate, "Playback rate", .25, 1.5), mirrored: v.mirrored === true };
  });
  if (new Set(videos.map((v) => v.id)).size !== videos.length) throw new ApiError(400, "Duplicate video IDs in metadata.");
  const videoIds = new Set(videos.map((v) => v.id));
  const bookmarks = payload.bookmarks.map((raw) => {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "Invalid bookmark metadata."); const b = raw as Record<string, unknown>; const videoId = assertId(b.videoId);
    if (!videoIds.has(videoId) && !db.prepare("SELECT 1 FROM videos WHERE id=?").get(videoId)) throw new ApiError(400, "Bookmark refers to an unknown video.");
    return { id: assertId(b.id), videoId, timestampMs: integer(b.timestampMs, "Timestamp", 0, Number.MAX_SAFE_INTEGER), title: text(b.title, "Title", 300), description: text(b.description ?? "", "Description", 10000, false), createdAt: typeof b.createdAt === "string" && !Number.isNaN(Date.parse(b.createdAt)) ? b.createdAt : now(), updatedAt: typeof b.updatedAt === "string" && !Number.isNaN(Date.parse(b.updatedAt)) ? b.updatedAt : now() };
  });
  if (new Set(bookmarks.map((b) => b.id)).size !== bookmarks.length) throw new ApiError(400, "Duplicate bookmark IDs in metadata.");
  const importedDurations = new Map(videos.map((video) => [video.id, video.durationMs]));
  for (const bookmark of bookmarks) {
    const duration = importedDurations.get(bookmark.videoId);
    if (duration !== undefined && duration !== null && bookmark.timestampMs > duration) throw new ApiError(400, "Bookmark timestamp is beyond its video's duration.");
  }
  let addedVideos = 0; let skippedVideos = 0; let addedBookmarks = 0; let skippedBookmarks = 0;
  const conflictingVideoIds = new Set<string>();
  db.transaction(() => {
    for (const v of videos) {
      const existing = db.prepare("SELECT content_hash FROM videos WHERE id=?").get(v.id) as { content_hash: string } | undefined;
      if (existing) { skippedVideos++; if (existing.content_hash !== v.contentHash) conflictingVideoIds.add(v.id); continue; }
      db.prepare("INSERT INTO videos(id,display_name,original_filename,byte_size,imported_at,media_filename,duration_ms,content_hash,player_position_ms,playback_rate,mirrored,missing) VALUES(?,?,?,?,?,NULL,?,?,?,?,?,1)").run(v.id, v.displayName, v.originalFilename, v.byteSize, v.importedAt, v.durationMs, v.contentHash, v.positionMs, v.playbackRate, v.mirrored ? 1 : 0); addedVideos++;
    }
    for (const b of bookmarks) {
      if (conflictingVideoIds.has(b.videoId)) { skippedBookmarks++; continue; }
      if (db.prepare("SELECT 1 FROM bookmarks WHERE id=?").get(b.id)) { skippedBookmarks++; continue; }
      // Do not create a bookmark if its imported video conflicted and is not present.
      if (!db.prepare("SELECT 1 FROM videos WHERE id=?").get(b.videoId)) { skippedBookmarks++; continue; }
      db.prepare("INSERT INTO bookmarks(id,video_id,timestamp_ms,title,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(b.id, b.videoId, b.timestampMs, b.title, b.description, b.createdAt, b.updatedAt); addedBookmarks++;
    }
    const settings = payload.settings;
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      const seek = (settings as Record<string, unknown>).seekStepSeconds;
      if (seek !== undefined && !setting(db, "seek_step_seconds")) setSetting(db, "seek_step_seconds", String(finiteNumber(seek, "Seek step", .1, 60)));
    }
  })();
  return { imported: addedVideos + addedBookmarks, skipped: skippedVideos + skippedBookmarks, addedVideos, skippedVideos, addedBookmarks, skippedBookmarks, conflictingVideoIds: [...conflictingVideoIds] };
}
