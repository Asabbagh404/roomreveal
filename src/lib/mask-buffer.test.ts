import { describe, expect, it } from "vitest";
import {
  createBlankBuffer,
  isBufferEmpty,
  paintStroke,
  unionBuffers,
  type MaskBuffer,
} from "./mask-buffer";

const at = (buf: MaskBuffer, x: number, y: number): number =>
  buf.data[y * buf.width + x];

/** Every byte is strictly 0 or 255 — the binary invariant (AD-7). */
function assertBinary(buf: MaskBuffer): void {
  for (const v of buf.data) expect(v === 0 || v === 255).toBe(true);
}

describe("mask-buffer (pure, AD-7 binary)", () => {
  it("createBlankBuffer is all-zero and correctly sized", () => {
    const buf = createBlankBuffer(10, 8);
    expect(buf.width).toBe(10);
    expect(buf.height).toBe(8);
    expect(buf.data.length).toBe(80);
    expect(isBufferEmpty(buf)).toBe(true);
  });

  it("brush sets pixels inside the disc to 255 and leaves far pixels at 0", () => {
    const buf = createBlankBuffer(21, 21);
    const painted = paintStroke(buf, [{ x: 10, y: 10 }], 6, "brush");
    expect(at(painted, 10, 10)).toBe(255); // center
    expect(at(painted, 11, 10)).toBe(255); // within radius 3
    expect(at(painted, 0, 0)).toBe(0); // far corner untouched
    expect(isBufferEmpty(painted)).toBe(false);
  });

  it("keeps the input buffer unmutated (immutability)", () => {
    const buf = createBlankBuffer(21, 21);
    paintStroke(buf, [{ x: 10, y: 10 }], 8, "brush");
    expect(isBufferEmpty(buf)).toBe(true); // original still blank
  });

  it("eraser clears a previously painted area back to 0", () => {
    const buf = createBlankBuffer(21, 21);
    const painted = paintStroke(buf, [{ x: 10, y: 10 }], 8, "brush");
    expect(at(painted, 10, 10)).toBe(255);
    const erased = paintStroke(painted, [{ x: 10, y: 10 }], 8, "eraser");
    expect(at(erased, 10, 10)).toBe(0);
  });

  it("guarantees the binary invariant after mixed operations", () => {
    let buf = createBlankBuffer(30, 30);
    buf = paintStroke(buf, [{ x: 5, y: 5 }], 7, "brush");
    buf = paintStroke(buf, [{ x: 20, y: 20 }], 12, "brush");
    buf = paintStroke(buf, [{ x: 5, y: 5 }], 3, "eraser");
    assertBinary(buf);
  });

  it("clamps out-of-bounds strokes without throwing or writing", () => {
    const buf = createBlankBuffer(21, 21);
    const painted = paintStroke(buf, [{ x: -100, y: -100 }], 4, "brush");
    expect(isBufferEmpty(painted)).toBe(true);
  });

  it("draws a continuous multi-point stroke with no gap", () => {
    const buf = createBlankBuffer(21, 21);
    const painted = paintStroke(
      buf,
      [
        { x: 3, y: 10 },
        { x: 17, y: 10 },
      ],
      2,
      "brush",
    );
    // Every pixel along the traversed row between the endpoints is set.
    for (let x = 3; x <= 17; x++) expect(at(painted, x, 10)).toBe(255);
  });

  it("keeps the binary invariant for an odd (fractional-radius) brush size", () => {
    // Slider allows odd sizes (step 1) → radius 2.5 etc.; no partial coverage.
    const buf = createBlankBuffer(21, 21);
    const painted = paintStroke(buf, [{ x: 10, y: 10 }], 5, "brush");
    expect(at(painted, 10, 10)).toBe(255);
    assertBinary(painted);
  });

  it("empty stroke returns a fresh blank copy (no-op, still immutable)", () => {
    const buf = createBlankBuffer(4, 4);
    const painted = paintStroke(buf, [], 8, "brush");
    expect(painted).not.toBe(buf);
    expect(isBufferEmpty(painted)).toBe(true);
  });
});

describe("unionBuffers (Story 5.6 click-to-select)", () => {
  it("takes the per-pixel max so painted pixels accumulate", () => {
    const a = createBlankBuffer(4, 4);
    a.data[0] = 255; // top-left set in a
    const b = createBlankBuffer(4, 4);
    b.data[5] = 255; // a different pixel set in b
    const u = unionBuffers(a, b);
    expect(u.data[0]).toBe(255); // from a
    expect(u.data[5]).toBe(255); // from b
    expect(u.data[1]).toBe(0); // neither
  });

  it("is immutable — neither input is mutated", () => {
    const a = createBlankBuffer(2, 2);
    const b = createBlankBuffer(2, 2);
    b.data[0] = 255;
    const u = unionBuffers(a, b);
    expect(isBufferEmpty(a)).toBe(true); // a untouched
    expect(b.data[0]).toBe(255); // b untouched
    expect(u).not.toBe(a);
    expect(u).not.toBe(b);
  });

  it("keeps the binary invariant", () => {
    const a = createBlankBuffer(3, 3);
    a.data[4] = 255;
    const b = createBlankBuffer(3, 3);
    b.data[4] = 255; // overlap
    b.data[0] = 255;
    assertBinary(unionBuffers(a, b));
  });

  it("throws on a dimension mismatch (guards a bad decode)", () => {
    const a = createBlankBuffer(4, 4);
    const b = createBlankBuffer(2, 2);
    expect(() => unionBuffers(a, b)).toThrow();
  });
});
