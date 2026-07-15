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
 * Erodes a binary mask by `radius` pixels (Chebyshev): a pixel stays on only if
 * every pixel within the square of that radius is on (out-of-bounds counts as
 * off). Pure — pulls the selection's edge inward so the retexture composite does
 * not leak a halo where a loose/anti-aliased selection overshot the object (live
 * 2026-07-14). `radius <= 0` returns a copy unchanged. Leaf layer (src/lib/).
 */
export function erodeMask(buffer: MaskBuffer, radius: number): MaskBuffer {
  const { data, width, height } = buffer;
  if (radius <= 0) return { data: new Uint8Array(data), width, height };
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < 128) continue; // off stays off
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[ny * width + nx] < 128) {
            keep = false;
            break;
          }
        }
      }
      if (keep) out[y * width + x] = 255;
    }
  }
  return { data: out, width, height };
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

/** An opaque RGB color (0–255 channels). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Side of the square canvas meanImageColor averages over — 64² px is plenty. */
const MEAN_SAMPLE_SIZE = 64;

/**
 * Mean RGB of an image URL, computed by rasterizing it onto a small canvas and
 * averaging every pixel. Used to read a texture swatch's BASE COLOR so the
 * « Modifier » init can anchor the selected object to the right hue. Browser-only
 * (canvas); live-verify. Leaf layer (src/lib/).
 */
export async function meanImageColor(url: string): Promise<Rgb> {
  const bmp = await loadBitmap(url);
  const [, ctx] = newCanvas(MEAN_SAMPLE_SIZE, MEAN_SAMPLE_SIZE);
  ctx.drawImage(bmp, 0, 0, MEAN_SAMPLE_SIZE, MEAN_SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, MEAN_SAMPLE_SIZE, MEAN_SAMPLE_SIZE);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = MEAN_SAMPLE_SIZE * MEAN_SAMPLE_SIZE;
  for (let i = 0; i < n; i++) {
    r += data[i * 4];
    g += data[i * 4 + 1];
    b += data[i * 4 + 2];
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/**
 * Color-prior swap for the « Modifier » texture path, a ZeST-inspired init
 * (arXiv 2404.06425, Eq. 2) ADAPTED to a faithful instruction editor: returns a
 * PNG of the base image where ONLY the masked (>=128) region is re-colorized to
 * `tint` modulated by each pixel's Rec. 601 luma (shading kept), every other
 * pixel untouched. ZeST decolors the object to plain grayscale, but that relies
 * on an inpainting model that REGENERATES the region; Klein instead stays
 * faithful to input pixels and anchored the output to the neutral gray (live
 * 2026-07-15: beige-wood swatch on a gray kitchen → gray kitchen with wood
 * grain). So the init anchors the object to the swatch's base color directly:
 * the original hue is still wiped (ZeST's goal), and the editor only has to add
 * the material's pattern/relief. Luma scales around mid-gray (127.5 → exactly
 * `tint`), so highlights can exceed the tint; channels clamp at 255. Browser-only
 * (canvas); live-verify. Leaf layer (src/lib/).
 */
export async function tintMaskedRegion(
  imageUrl: string,
  buffer: MaskBuffer,
  tint: Rgb,
): Promise<Blob> {
  const bmp = await loadBitmap(imageUrl);
  const { width: W, height: H, data: mask } = buffer;

  const [out, octx] = newCanvas(W, H);
  octx.drawImage(bmp, 0, 0, W, H);
  const img = octx.getImageData(0, 0, W, H);

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < 128) continue; // outside the selection → keep the color
    const o = i * 4;
    const luma =
      0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
    const factor = luma / 127.5; // mid-gray shading reproduces the tint exactly
    img.data[o] = Math.min(255, Math.round(tint.r * factor));
    img.data[o + 1] = Math.min(255, Math.round(tint.g * factor));
    img.data[o + 2] = Math.min(255, Math.round(tint.b * factor));
  }
  octx.putImageData(img, 0, 0);
  return toPngBlob(out);
}

/**
 * Overlays a full-scene edit onto the base image ONLY where the mask is on
 * (>=128), pixel-for-pixel at the SAME coordinates — every other pixel stays the
 * base's. Used by the full-scene « Modifier » path: Kontext re-renders the WHOLE
 * working image (so it keeps the object's 3D form/lighting and applies the swatch
 * as a real material instead of a flat paste), and this keeps only the selected
 * region of that edit. `overlayUrl` is scaled to the base/mask canonical dims
 * before sampling, so a reframed Kontext output still aligns 1:1. Output PNG is at
 * the mask's canonical dims. Browser-only (canvas); live-verify. Leaf (src/lib/).
 */
export async function compositeMaskedOverlay(
  baseUrl: string,
  overlayUrl: string,
  buffer: MaskBuffer,
): Promise<Blob> {
  const [base, overlay] = await Promise.all([loadBitmap(baseUrl), loadBitmap(overlayUrl)]);
  const { width: W, height: H, data: mask } = buffer;

  const [out, octx] = newCanvas(W, H);
  octx.drawImage(base, 0, 0, W, H);
  const outData = octx.getImageData(0, 0, W, H);

  const [, vctx] = newCanvas(W, H);
  vctx.drawImage(overlay, 0, 0, W, H); // scale the (possibly reframed) edit to canonical
  const overlayData = vctx.getImageData(0, 0, W, H).data;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < 128) continue; // outside the selection → keep base
    const o = i * 4;
    outData.data[o] = overlayData[o];
    outData.data[o + 1] = overlayData[o + 1];
    outData.data[o + 2] = overlayData[o + 2];
    outData.data[o + 3] = 255;
  }
  octx.putImageData(outData, 0, 0);
  return toPngBlob(out);
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
