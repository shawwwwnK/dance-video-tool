import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import type { Db, VideoRow } from "./database.js";
import { mediaDirectory } from "./config.js";

function mediaPath(filename: string) {
  const resolved = path.resolve(mediaDirectory, filename);
  if (!resolved.startsWith(`${mediaDirectory}${path.sep}`)) throw new Error("Unsafe media filename.");
  return resolved;
}

function contentType(filename: string) {
  switch (path.extname(filename).toLowerCase()) {
    case ".mp4": case ".m4v": return "video/mp4";
    case ".mov": return "video/quicktime";
    case ".webm": return "video/webm";
    case ".mkv": return "video/x-matroska";
    default: return "application/octet-stream";
  }
}

export function parseByteRange(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  let start: number; let end: number;
  if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function mediaFileFor(db: Db, video: VideoRow): Promise<string | null> {
  if (!video.media_filename) return null;
  const file = mediaPath(video.media_filename);
  try { await fsp.access(file, fs.constants.R_OK); return file; } catch {
    db.prepare("UPDATE videos SET missing = 1 WHERE id = ?").run(video.id);
    return null;
  }
}

export async function serveMedia(db: Db, req: Request, res: Response, video: VideoRow) {
  const file = await mediaFileFor(db, video);
  if (!file) return res.status(404).json({ error: "The app-managed media copy is missing.", code: "missing_media" });
  const stat = await fsp.stat(file);
  const size = stat.size;
  const range = req.headers.range;
  res.set({ "Accept-Ranges": "bytes", "Content-Type": contentType(file), "Cache-Control": "no-store" });
  if (!range) {
    res.set("Content-Length", String(size));
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file).pipe(res);
  }
  const parsed = parseByteRange(range, size);
  if (!parsed) {
    res.set("Content-Range", `bytes */${size}`); return res.status(416).end();
  }
  const { start, end } = parsed;
  res.status(206).set({ "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}

export function managedMediaPath(filename: string) { return mediaPath(filename); }
