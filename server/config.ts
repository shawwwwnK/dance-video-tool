import os from "node:os";
import path from "node:path";

/** App data never lives in the repository unless a test explicitly overrides it. */
export const dataDirectory = path.resolve(
  process.env.LINDYLOOP_DATA_DIR ||
    path.join(os.homedir(), "Library", "Application Support", "LindyLoop"),
);
export const mediaDirectory = path.join(dataDirectory, "media");
export const tempDirectory = path.join(dataDirectory, "tmp");
export const databasePath = path.join(dataDirectory, "lindyloop.sqlite");
export const serverPort = Number(process.env.LINDYLOOP_API_PORT || 5174);

const twoGiB = 2 * 1024 * 1024 * 1024;
const configuredUploadLimit = Number(process.env.LINDYLOOP_MAX_UPLOAD_BYTES || twoGiB);
export const maxUploadBytes =
  Number.isSafeInteger(configuredUploadLimit) && configuredUploadLimit > 0
    ? configuredUploadLimit
    : twoGiB;

export const allowedVideoExtensions = new Set([".mp4", ".mov", ".webm", ".m4v", ".mkv"]);
