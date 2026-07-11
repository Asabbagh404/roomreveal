/**
 * Seeds the editable binary buffer from the detected-mask URL (AD-2 amendment).
 * The SAM mask is produced at detection resolution (~1536px); here it is
 * decoded and drawn onto an offscreen canvas AT CANONICAL DIMENSIONS — the one
 * and only place the mask is reduced to canonical (AD-13) — then thresholded to
 * a strict 0/255 binary buffer (AD-7, no intermediate values).
 *
 * Browser-only: uses Image decode + canvas getImageData, which jsdom cannot
 * run. [LIVE-VERIFY] — covered by real-browser verification with FAL_KEY, not
 * unit tests. Leaf layer (src/lib/): no state/ or pipeline/ import.
 */

import { createBlankBuffer, type MaskBuffer } from "./mask-buffer";

/** Luminance*alpha at/above this (0–255) counts as masked (furniture). */
const BINARY_THRESHOLD = 128;

/** Loads a (possibly cross-origin fal) image with CORS so the canvas is not
 * tainted — getImageData would otherwise throw a SecurityError. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("mask image load failed"));
    img.src = url;
  });
}

/**
 * Decodes the mask at `url`, reduces it to `width`×`height` (canonical), and
 * thresholds every pixel to 0 or 255. Returns a blank buffer's shape on a
 * fully-black mask. Rejects if the image cannot be loaded.
 */
export async function rasterizeMaskUrl(
  url: string,
  width: number,
  height: number,
): Promise<MaskBuffer> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");
  // Downscale 1536 → canonical happens here (drawImage), never on the buffer.
  ctx.drawImage(img, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;

  const out = createBlankBuffer(width, height);
  for (let i = 0; i < out.data.length; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114) * (a / 255);
    out.data[i] = luminance >= BINARY_THRESHOLD ? 255 : 0;
  }
  return out;
}
