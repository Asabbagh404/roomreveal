import type { MaskBuffer } from "./mask-buffer";

/** A pixel rectangle in canonical image space. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tight bounding box of the "on" (>=128) pixels of a binary mask, or `null` when
 * the mask is empty. Pure (no DOM) — the unit-tested core of the « Modifier »
 * crop+composite flow: it tells the adapter which region of the working image to
 * hand to Kontext and where to paste the result back. Leaf layer (src/lib/).
 */
export function maskBoundingBox(buffer: MaskBuffer): Box | null {
  const { data, width, height } = buffer;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // no on-pixels
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Fetches an image URL into an ImageBitmap. fal result URLs are cross-origin but
 * send permissive CORS (proven for downloadFile/mask-decode), so the bitmap is
 * not tainted and its pixels are readable. Browser-only.
 */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`retexture: fetch failed (${res.status})`);
  return createImageBitmap(await res.blob());
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("retexture: encode failed"))),
      "image/png",
    ),
  );
}

function newCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("retexture: no 2d context");
  return [canvas, ctx];
}

/**
 * Reads the pixel dimensions of an image URL. Browser-only (live-verify).
 */
export async function imageSize(url: string): Promise<{ width: number; height: number }> {
  const bmp = await loadBitmap(url);
  return { width: bmp.width, height: bmp.height };
}

/**
 * Crops `imageUrl` to `box` and returns a PNG of just that region — the object
 * the user selected, isolated so Kontext can only retexture IT (not wander onto
 * the floor/walls). Browser-only (canvas); not unit-tested in jsdom — live-verify,
 * mirroring encodeMaskPng/decodeMaskToBuffer. Leaf layer (src/lib/).
 */
export async function cropRegion(imageUrl: string, box: Box): Promise<Blob> {
  const bmp = await loadBitmap(imageUrl);
  const [canvas, ctx] = newCanvas(box.width, box.height);
  ctx.drawImage(bmp, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return toPngBlob(canvas);
}

/**
 * Pastes the retextured patch back into the base image at `box`, but ONLY where
 * the mask is on (>=128) — every other pixel stays exactly the base's, so only
 * the user's selection changes (strict locality; AD-7 verbatim mask). The patch
 * (Kontext output, arbitrary dims) is scaled to the box, then applied pixel-by-
 * pixel gated by the mask. Output PNG is at the mask's canonical dims. Browser-
 * only (canvas); live-verify, not unit-tested. Leaf layer (src/lib/).
 */
export async function compositeWithinMask(
  baseUrl: string,
  patchUrl: string,
  buffer: MaskBuffer,
  box: Box,
): Promise<Blob> {
  const [base, patch] = await Promise.all([loadBitmap(baseUrl), loadBitmap(patchUrl)]);
  const { width: W, height: H, data: mask } = buffer;

  const [out, octx] = newCanvas(W, H);
  octx.drawImage(base, 0, 0, W, H);
  const outData = octx.getImageData(0, 0, W, H);

  // Rasterize the patch scaled to the box, so patch pixel (px,py) maps 1:1 to
  // base pixel (box.x+px, box.y+py).
  const [, pctx] = newCanvas(box.width, box.height);
  pctx.drawImage(patch, 0, 0, box.width, box.height);
  const patchData = pctx.getImageData(0, 0, box.width, box.height).data;

  for (let py = 0; py < box.height; py++) {
    for (let px = 0; px < box.width; px++) {
      const gx = box.x + px;
      const gy = box.y + py;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      if (mask[gy * W + gx] < 128) continue; // outside the selection → keep base
      const o = (gy * W + gx) * 4;
      const p = (py * box.width + px) * 4;
      outData.data[o] = patchData[p];
      outData.data[o + 1] = patchData[p + 1];
      outData.data[o + 2] = patchData[p + 2];
      outData.data[o + 3] = 255;
    }
  }
  octx.putImageData(outData, 0, 0);
  return toPngBlob(out);
}
