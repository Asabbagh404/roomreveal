/**
 * Pure tool-state math for the mask editor: brush-size and zoom bounds, and the
 * screen→buffer coordinate mapping. Kept in lib/ (leaf, no state/ coupling) so
 * it is fully unit-testable without a canvas — the parts jsdom cannot run
 * (actual rendering, pointer events) stay in the component. AD-7: zoom and
 * devicePixelRatio are display transforms only; the buffer is never resampled.
 */

import type { Point } from "./mask-buffer";

/** Brush/eraser diameter bounds in canonical pixels (UX-DR8). */
export const MIN_BRUSH = 4;
export const MAX_BRUSH = 128;
/** Step applied by the `[` / `]` shortcuts. */
export const BRUSH_STEP = 4;

/** Display zoom bounds: 100 % … 400 % (UX-DR7). */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function clampBrush(size: number): number {
  return Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(size)));
}

/** Grows (`dir > 0`) or shrinks the brush by one step, staying within bounds. */
export function stepBrush(size: number, dir: 1 | -1): number {
  return clampBrush(size + dir * BRUSH_STEP);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The displayed canvas box in CSS pixels (element.getBoundingClientRect()). */
export interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenToBufferArgs {
  clientX: number;
  clientY: number;
  rect: DisplayRect;
  zoom: number;
  pan: Point;
  bufferWidth: number;
  bufferHeight: number;
}

/**
 * Maps a screen (clientX/Y) point to canonical buffer coordinates, inverting the
 * display transform `viewport = pan + zoom * baseScale * buffer` where
 * `baseScale` fits the buffer into the display box. Separate x/y scales make it
 * exact regardless of the element's aspect ratio. Never touches devicePixelRatio
 * — the buffer lives in canonical space, DPR only affects the backing store.
 */
export function screenToBuffer(args: ScreenToBufferArgs): Point {
  const { clientX, clientY, rect, zoom, pan, bufferWidth, bufferHeight } = args;
  const scaleX = rect.width / bufferWidth;
  const scaleY = rect.height / bufferHeight;
  const vx = clientX - rect.left;
  const vy = clientY - rect.top;
  return {
    x: (vx - pan.x) / (zoom * scaleX),
    y: (vy - pan.y) / (zoom * scaleY),
  };
}
