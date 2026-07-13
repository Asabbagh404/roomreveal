import { describe, expect, it } from "vitest";
import { maskBoundingBox } from "./retexture-region";
import type { MaskBuffer } from "./mask-buffer";

/** Build a WxH binary mask, turning on the listed [x,y] pixels. */
function mask(width: number, height: number, on: Array<[number, number]>): MaskBuffer {
  const data = new Uint8Array(width * height);
  for (const [x, y] of on) data[y * width + x] = 255;
  return { data, width, height };
}

describe("maskBoundingBox", () => {
  it("returns null for an empty mask", () => {
    expect(maskBoundingBox(mask(4, 4, []))).toBeNull();
  });

  it("returns a 1x1 box for a single on-pixel", () => {
    expect(maskBoundingBox(mask(4, 4, [[2, 1]]))).toEqual({ x: 2, y: 1, width: 1, height: 1 });
  });

  it("returns the tight box around scattered on-pixels", () => {
    // corners of a rectangle from (1,1) to (3,2) → x1,y1,w3,h2
    const b = maskBoundingBox(mask(5, 5, [[1, 1], [3, 2], [2, 1]]));
    expect(b).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  });

  it("spans the full image when corners are on", () => {
    const b = maskBoundingBox(mask(3, 3, [[0, 0], [2, 2]]));
    expect(b).toEqual({ x: 0, y: 0, width: 3, height: 3 });
  });

  it("treats sub-threshold bytes (<128) as off", () => {
    const buffer = mask(4, 4, [[1, 1]]);
    buffer.data[0] = 100; // (0,0) below threshold → ignored
    expect(maskBoundingBox(buffer)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
});
