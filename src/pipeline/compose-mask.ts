import { uploadArtifact } from "./client";

/**
 * Composition of the N per-segment SAM masks into a single mask (AD-5: this
 * belongs in the pipeline, never the UI/reducer). SAM 3 returns one binary mask
 * per detected instance (e.g. ~12 kitchen units); a single prompt covers far
 * more of the scene when the instances are unioned than the model's combined
 * `image` preview does (calibrated live: ~36% vs ~17%).
 *
 * The union is a per-pixel max ("lighten"): a pixel is masked if ANY segment
 * marks it. Dimensions stay at the segments' native (detection) resolution;
 * reduction to canonical happens later (AD-2 amendment, mask-raster). The result
 * is uploaded like every fal artifact (AD-9 lifecycle via uploadArtifact).
 *
 * Browser-only (Image decode + canvas) — [LIVE-VERIFY], not unit-tested; the
 * detect adapter mocks this module at its boundary.
 */

/** Loads a cross-origin fal mask with CORS so the canvas is not tainted. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("mask segment load failed"));
    img.src = url;
  });
}

export async function composeMask(maskUrls: string[]): Promise<string> {
  const images = await Promise.all(maskUrls.map(loadImage));
  const width = Math.max(...images.map((i) => i.naturalWidth || i.width));
  const height = Math.max(...images.map((i) => i.naturalHeight || i.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");
  // Black base so transparent/unmarked areas read as 0; "lighten" then keeps the
  // brightest (masked) pixel across every segment → a true union.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighten";
  for (const img of images) ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("mask encode failed"))),
      "image/png",
    );
  });
  return uploadArtifact(blob);
}
