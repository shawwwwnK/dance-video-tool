import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDataDirectory = vi.hoisted(() => {
  const directory = `/private/tmp/lindyloop-api-test-${process.pid}-${Date.now()}`;
  process.env.LINDYLOOP_DATA_DIR = directory;
  return directory;
});
const { createDatabase } = await import("./database.js");
const { parseByteRange } = await import("./media.js");
const { localRequestOnly } = await import("./security.js");
const { extensionFor, finiteNumber } = await import("./validation.js");

describe("backend safeguards", () => {
  it("parses normal, open-ended, suffix, and unsatisfiable ranges", () => {
    expect(parseByteRange("bytes=0-2", 10)).toEqual({ start: 0, end: 2 });
    expect(parseByteRange("bytes=3-", 10)).toEqual({ start: 3, end: 9 });
    expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=20-", 10)).toBeNull();
    expect(parseByteRange("items=0-1", 10)).toBeNull();
  });

  it("accepts only common video extensions and finite player values", () => {
    expect(extensionFor("rehearsal.MOV")).toBe(".mov");
    expect(() => extensionFor("notes.txt")).toThrow("Choose an MP4");
    expect(finiteNumber(.73, "Speed", .25, 1.5)).toBe(.73);
    expect(() => finiteNumber(Number.NaN, "Speed", .25, 1.5)).toThrow("Speed");
  });

  it("requires the local Origin and explicit mutation header", () => {
    const next = vi.fn();
    const respond = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const request = (origin?: string, header?: string) => ({ method: "POST", get: (name: string) => name === "host" ? "127.0.0.1:5174" : name === "origin" ? origin : header });
    localRequestOnly(request(undefined, undefined) as never, respond as never, next);
    expect(respond.status).toHaveBeenCalledWith(403);
    next.mockClear(); respond.status.mockClear();
    localRequestOnly(request("http://127.0.0.1:5173", "1") as never, respond as never, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    localRequestOnly(request("https://evil.example", "1") as never, respond as never, next);
    expect(respond.status).toHaveBeenCalledWith(403);
  });
});

describe("SQLite persistence", () => {
  let db: ReturnType<typeof createDatabase>;
  beforeAll(() => { db = createDatabase(); });
  afterAll(async () => { db.close(); await fs.rm(testDataDirectory, { recursive: true, force: true }); });
  it("keeps a fractional seek setting across database handles", () => {
    db.prepare("UPDATE settings SET value=? WHERE key='seek_step_seconds'").run("1.5");
    expect((db.prepare("SELECT value FROM settings WHERE key='seek_step_seconds'").get() as { value: string }).value).toBe("1.5");
  });
});
