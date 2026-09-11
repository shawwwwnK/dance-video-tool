export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Native HTML video exposes timeline time, not decoded-frame access. This is
// a practical 30 fps source-time step and stays independent of playback rate.
export const FRAME_STEP_SECONDS = 1 / 30;

export function stepFrame(currentTime: number, direction: -1 | 1, duration: number) {
  return clamp(currentTime + direction * FRAME_STEP_SECONDS, 0, Number.isFinite(duration) ? duration : currentTime);
}

export function formatTime(milliseconds: number, withMillis = false) {
  const safe = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor(safe / 60_000) % 60;
  const seconds = Math.floor(safe / 1000) % 60;
  const base = hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
  return withMillis ? `${base}.${String(safe % 1000).padStart(3, "0")}` : base;
}

/** Parses seconds or MM:SS(.mmm), returning milliseconds. */
export function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const match = /^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match || Number(match[2]) >= 60) return null;
  const fraction = (match[3] ?? "").padEnd(3, "0");
  return Number(match[1]) * 60_000 + Number(match[2]) * 1000 + Number(fraction || 0);
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}
