import { describe, expect, it } from "vitest";
import { computeCanonicalDimensions, MAX_LONG_SIDE } from "./resize";

describe("computeCanonicalDimensions (pure, AR-PIXELS)", () => {
  it("scales a 4000x3000 landscape to 1024x768 (4:3 preserved)", () => {
    expect(computeCanonicalDimensions(4000, 3000)).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("scales a portrait so the long side (height) is 1024", () => {
    expect(computeCanonicalDimensions(3000, 4000)).toEqual({
      width: 768,
      height: 1024,
    });
  });

  it("scales a square to 1024x1024", () => {
    expect(computeCanonicalDimensions(2048, 2048)).toEqual({
      width: 1024,
      height: 1024,
    });
  });

  it("never upscales an already-small image", () => {
    expect(computeCanonicalDimensions(800, 600)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("leaves an image exactly at the cap unchanged", () => {
    expect(computeCanonicalDimensions(1024, 500)).toEqual({
      width: 1024,
      height: 500,
    });
  });

  it("returns integer dimensions and keeps the long side within the cap", () => {
    const d = computeCanonicalDimensions(4001, 2999);
    expect(Number.isInteger(d.width)).toBe(true);
    expect(Number.isInteger(d.height)).toBe(true);
    expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(MAX_LONG_SIDE);
  });
});
