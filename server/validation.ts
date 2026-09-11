import path from "node:path";
import { allowedVideoExtensions } from "./config.js";

export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const hashPattern = /^[a-f0-9]{64}$/i;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "bad_request") {
    super(message);
  }
}

export function assertId(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new ApiError(400, "Invalid ID.");
  return value;
}

export function text(value: unknown, label: string, maxLength: number, required = true): string {
  if (typeof value !== "string") throw new ApiError(400, `${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ApiError(400, `${label} is required.`);
  if (value.length > maxLength) throw new ApiError(400, `${label} is too long.`);
  return value;
}

export function finiteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ApiError(400, `${label} must be between ${min} and ${max}.`);
  }
  return value;
}

export function integer(value: unknown, label: string, min: number, max: number): number {
  const numeric = finiteNumber(value, label, min, max);
  if (!Number.isInteger(numeric)) throw new ApiError(400, `${label} must be an integer.`);
  return numeric;
}

export function extensionFor(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (!allowedVideoExtensions.has(extension)) {
    throw new ApiError(415, "Choose an MP4, MOV, WebM, M4V, or MKV video file.", "unsupported_file_type");
  }
  return extension;
}

export function safeBasename(filename: string): string {
  const basename = path.basename(filename).replace(/[\0/\\]/g, "_");
  return basename.slice(0, 255) || "video";
}
