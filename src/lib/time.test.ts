import { describe, expect, it } from "vitest";
import { clamp, formatTime, parseTimestamp, stepFrame } from "./time";

describe("player time helpers", () => {
  it("clamps source-time seeks without considering playback rate", () => {
    expect(clamp(12.4 + 0.1, 0, 12.5)).toBe(12.5);
    expect(clamp(0.2 - 1, 0, 12.5)).toBe(0);
  });

  it("steps an estimated video frame and clamps at timeline edges", () => {
    expect(stepFrame(1, 1, 10)).toBeCloseTo(1 + 1 / 30);
    expect(stepFrame(0, -1, 10)).toBe(0);
    expect(stepFrame(10, 1, 10)).toBe(10);
  });

  it("formats and parses bookmark timestamps with milliseconds", () => {
    expect(formatTime(84_350, true)).toBe("1:24.350");
    expect(parseTimestamp("1:24.350")).toBe(84_350);
    expect(parseTimestamp("0.73")).toBe(730);
  });

  it("rejects malformed timestamps", () => {
    expect(parseTimestamp("1:61")).toBeNull();
    expect(parseTimestamp("hello")).toBeNull();
  });
});
