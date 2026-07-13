import { type MaskBuffer } from "./mask-buffer";

/**
 * Decodes a segmentation mask image (URL or data URL) into a binary MaskBuffer
 * at the given canonical dimensions (Story 5.6, AD-7). Draws the image onto an
 * offscreen canvas sized to the canonical buffer (scaling if the model returned
 * a different resolution — AR-PIXELS keeps the mask canonical), reads the pixels,
 * and thresholds each to strictly 0 or 255. Leaf layer (src/lib/): DOM-only, no
 * state/pipeline imports. Not unit-tested in jsdom (canvas is unsupported) — the
 * effect layer mocks it; the real decode is covered by live-verify.
 *
 * [Threshold — calibrate live] SAM masks are typically white-object-on-black; a
 * pixel is "on" when its luma exceeds the midpoint AND it is not transparent.
 */
const LUMA_ON = 127;
const ALPHA_ON = 127;

export function decodeMaskToBuffer(
  src: string,
  width: number,
  height: number,
): Promise<MaskBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // fal result URLs are cross-origin; request CORS so getImageData is not
    // tainted (fal storage sends permissive CORS, proven for downloadFile).
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
          reject(new Error("mask decode: no 2d context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);
        const out = new Uint8Array(width * height);
        for (let i = 0; i < out.length; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const a = data[i * 4 + 3];
          const luma = (r + g + b) / 3;
          out[i] = a > ALPHA_ON && luma > LUMA_ON ? 255 : 0;
        }
        resolve({ data: out, width, height });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("mask decode failed"));
      }
    };
    img.onerror = () => reject(new Error("mask decode: image load failed"));
    img.src = src;
  });
}
