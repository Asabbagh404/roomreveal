import { describe, expect, it } from "vitest";
import {
  MAX_BRUSH,
  MAX_ZOOM,
  MIN_BRUSH,
  MIN_ZOOM,
  clampBrush,
  clampZoom,
  screenToBuffer,
  stepBrush,
} from "./mask-tools";

describe("mask-tools brush/zoom bounds (pure)", () => {
  it("clampBrush stays within [MIN, MAX] and rounds", () => {
    expect(clampBrush(0)).toBe(MIN_BRUSH);
    expect(clampBrush(999)).toBe(MAX_BRUSH);
    expect(clampBrush(17.6)).toBe(18);
  });

  it("stepBrush grows and shrinks, saturating at the bounds", () => {
    expect(stepBrush(MIN_BRUSH, -1)).toBe(MIN_BRUSH);
    expect(stepBrush(MAX_BRUSH, 1)).toBe(MAX_BRUSH);
    expect(stepBrush(20, 1)).toBeGreaterThan(20);
    expect(stepBrush(20, -1)).toBeLessThan(20);
  });

  it("clampZoom stays within [100%, 400%]", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
  });
});

describe("screenToBuffer (pure display-transform inverse, AD-7)", () => {
  const rect = { left: 0, top: 0, width: 512, height: 384 };
  const base = { rect, bufferWidth: 1024, bufferHeight: 768 };

  it("maps at zoom 1, no pan (baseScale 0.5)", () => {
    const p = screenToBuffer({
      ...base,
      clientX: 256,
      clientY: 192,
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    expect(p).toEqual({ x: 512, y: 384 });
  });

  it("accounts for pan", () => {
    const p = screenToBuffer({
      ...base,
      clientX: 256,
      clientY: 192,
      zoom: 1,
      pan: { x: 56, y: 0 },
    });
    expect(p.x).toBe(400);
    expect(p.y).toBe(384);
  });

  it("accounts for zoom", () => {
    const p = screenToBuffer({
      ...base,
      clientX: 256,
      clientY: 192,
      zoom: 2,
      pan: { x: 0, y: 0 },
    });
    expect(p).toEqual({ x: 256, y: 192 });
  });

  it("accounts for the element offset (rect.left/top)", () => {
    const p = screenToBuffer({
      ...base,
      rect: { left: 100, top: 40, width: 512, height: 384 },
      clientX: 356,
      clientY: 232,
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    expect(p).toEqual({ x: 512, y: 384 });
  });
});
