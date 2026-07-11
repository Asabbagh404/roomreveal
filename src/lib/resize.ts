/**
 * Canonical pixel-space primitives (AR-PIXELS / AD-2). A single client-side
 * decode at upload produces the canonical photo (long side <= MAX_LONG_SIDE,
 * ratio preserved, encoded once as JPEG) that the whole pipeline shares, plus a
 * detection-only copy at a higher resolution (DETECTION_MAX_LONG_SIDE).
 *
 * [AD-2 amendment — calibrated live 2026-07-11] SAM 3 returns zero segments
 * below ~1536px, so detection runs on the higher-res copy; the mask it returns
 * is reduced to canonical dimensions when loaded into the editable buffer
 * (Story 2.2). The pipeline (mask/inpaint/video) stays at MAX_LONG_SIDE, so fal
 * cost is unchanged. Leaf layer (src/lib/): imports nothing from state/ or pipeline/.
 */

export const MAX_LONG_SIDE = 1024;
/** Detection needs more pixels than the pipeline canonical (AD-2 amendment). */
export const DETECTION_MAX_LONG_SIDE = 1536;
export const JPEG_QUALITY = 0.92;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Scales dimensions so the long side is at most maxLongSide, preserving the
 * aspect ratio. Never upscales (an already-small image is returned unchanged).
 * Pure — this is the testable core of the resize (jsdom-safe).
 */
export function computeCanonicalDimensions(
  width: number,
  height: number,
  maxLongSide: number = MAX_LONG_SIDE,
): Dimensions {
  const longSide = Math.max(width, height);
  if (longSide <= maxLongSide) {
    return { width, height };
  }
  const scale = maxLongSide / longSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Draws a decoded bitmap to a JPEG Blob at the given long-side cap (one encode). */
function encodeAtLongSide(
  bitmap: ImageBitmap,
  maxLongSide: number,
): Promise<Blob> {
  const { width, height } = computeCanonicalDimensions(
    bitmap.width,
    bitmap.height,
    maxLongSide,
  );
  const canvas = document.createElement("canvas");
  // Guard against a zero dimension from an extreme aspect ratio (round-to-0).
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas encoding failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** The two JPEG variants produced from a single decode at upload. */
export interface NormalizedUpload {
  /** Canonical photo (<= MAX_LONG_SIDE) — the pipeline's shared image (AD-2). */
  canonical: Blob;
  /** Higher-res copy (<= DETECTION_MAX_LONG_SIDE) — detection input only. */
  detection: Blob;
}

/**
 * Decodes `file` ONCE and produces both the canonical and detection JPEGs.
 * Rejects when the image cannot be decoded (corrupt input) so the caller can
 * surface a French message. Uses browser canvas APIs — verified in real
 * browsers (Playwright), NOT jsdom.
 */
export async function normalizeUpload(file: File): Promise<NormalizedUpload> {
  const bitmap = await createImageBitmap(file);
  try {
    const canonical = await encodeAtLongSide(bitmap, MAX_LONG_SIDE);
    const detection = await encodeAtLongSide(bitmap, DETECTION_MAX_LONG_SIDE);
    return { canonical, detection };
  } finally {
    bitmap.close();
  }
}
