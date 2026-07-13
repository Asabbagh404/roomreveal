/**
 * Binary mask buffer primitives (AD-7 / AR-MASK-VERBATIM). The mask is a single
 * channel of bytes at canonical dimensions where each pixel is exactly 0 or 255
 * — never an intermediate value, never anti-aliased. Brush/eraser strokes are
 * rasterized here by writing 0/255 directly into the byte array (NOT via
 * canvas arc+fill, which would smooth edges). Leaf layer (src/lib/): imports
 * nothing from state/ or pipeline/. Pure and fully jsdom-testable.
 */

/** A binary mask: `data.length === width * height`, every byte 0 or 255. */
export interface MaskBuffer {
  data: Uint8Array;
  width: number;
  height: number;
}

export type StrokeMode = "brush" | "eraser";

/** Editor tools: the two painting modes plus click-to-select (Story 5.6). Only
 * `brush`/`eraser` reach paintStroke; `select` is handled by the host as a click
 * that segments an object (SAM point-prompt) and unions it into the buffer. */
export type MaskTool = StrokeMode | "select";

/**
 * A selection gesture in the select tool, in canonical buffer coordinates
 * (Story 5.6/5.7). `point` = a single click → SAM segments the salient object
 * under it (often a sub-part like a drawer). `box` = a drag rectangle → SAM
 * segments the whole object enclosed by the box (the fix for "clicked the drawer,
 * got the drawer, not the cabinet"). Corners are raw drag start/end; the adapter
 * normalises to min/max. */
export type SelectRegion =
  | { kind: "point"; x: number; y: number }
  | { kind: "box"; x0: number; y0: number; x1: number; y1: number };

export interface Point {
  x: number;
  y: number;
}

/** Value written for each mode: brush adds (255), eraser removes (0). */
const MASK_ON = 255;
const MASK_OFF = 0;

/** A fresh all-zero buffer at the given canonical dimensions. */
export function createBlankBuffer(width: number, height: number): MaskBuffer {
  return { data: new Uint8Array(width * height), width, height };
}

/** Stamps a filled binary disc (no anti-aliasing) centered at (cx, cy). */
function stampDisc(
  buffer: MaskBuffer,
  cx: number,
  cy: number,
  radius: number,
  value: number,
): void {
  const { data, width, height } = buffer;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const r2 = radius * radius;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Compare against the pixel center; membership is all-or-nothing (binary).
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        data[y * width + x] = value;
      }
    }
  }
}

/** Stamps discs densely along the segment a→b so a fast drag leaves no gap. */
function stampSegment(
  buffer: MaskBuffer,
  a: Point,
  b: Point,
  radius: number,
  value: number,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampDisc(buffer, a.x + dx * t, a.y + dy * t, radius, value);
  }
}

/**
 * Returns a NEW buffer with the stroke applied (immutable — the input's `data`
 * is never mutated). `size` is the tool diameter in canonical pixels; the disc
 * radius is size/2. `points` are canonical-space coordinates already mapped
 * from the screen (see mask-tools.screenToBuffer). An empty stroke is a no-op
 * copy. Out-of-bounds coordinates are clamped away (no throw).
 */
export function paintStroke(
  buffer: MaskBuffer,
  points: readonly Point[],
  size: number,
  mode: StrokeMode,
): MaskBuffer {
  const next: MaskBuffer = {
    data: new Uint8Array(buffer.data),
    width: buffer.width,
    height: buffer.height,
  };
  if (points.length === 0) return next;
  const value = mode === "brush" ? MASK_ON : MASK_OFF;
  const radius = size / 2;
  stampDisc(next, points[0].x, points[0].y, radius, value);
  for (let i = 1; i < points.length; i++) {
    stampSegment(next, points[i - 1], points[i], radius, value);
  }
  return next;
}

/** True when the buffer has at least one painted (255) pixel. Used by Story 2.3
 * to enable "Valider le Masque" only on a non-empty mask (UX-DR13). */
export function isBufferEmpty(buffer: MaskBuffer): boolean {
  return !buffer.data.some((v) => v !== MASK_OFF);
}

/**
 * Returns a NEW buffer = the per-pixel union (max) of two same-sized binary
 * buffers (Story 5.6). Click-to-select adds a segmented object's mask on top of
 * whatever is already drawn, so pixels accumulate. Immutable — neither input is
 * mutated. Throws on a dimension mismatch (a decode that produced the wrong size
 * must never silently corrupt the draft).
 */
export function unionBuffers(a: MaskBuffer, b: MaskBuffer): MaskBuffer {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("unionBuffers: dimension mismatch");
  }
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = a.data[i] >= b.data[i] ? a.data[i] : b.data[i];
  }
  return { data, width: a.width, height: a.height };
}
