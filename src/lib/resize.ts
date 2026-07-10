/**
 * Canonical pixel-space primitives (AR-PIXELS / AD-2). A single client-side
 * resize at upload produces the canonical photo: long side <= MAX_LONG_SIDE,
 * ratio preserved, encoded once as image/jpeg. Never re-encoded afterwards.
 * Leaf layer (src/lib/): imports nothing from state/ or pipeline/.
 */

export const MAX_LONG_SIDE = 1024;
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

/**
 * Decodes `file`, scales it to canonical dimensions, and encodes it ONCE as a
 * JPEG Blob (AD-2). The original File is discarded by the caller after this.
 * Rejects when the image cannot be decoded (corrupt input) so the caller can
 * surface a French message. Uses browser canvas APIs — verified in real
 * browsers (Playwright), NOT jsdom.
 */
export async function resizeToCanonicalJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeCanonicalDimensions(
      bitmap.width,
      bitmap.height,
    );
    const canvas = document.createElement("canvas");
    // Guard against a zero dimension from an extreme aspect ratio (round-to-0).
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("2D canvas context unavailable");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (blob === null) {
      throw new Error("Canvas encoding failed");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
