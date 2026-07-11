import type { MaskBuffer } from "./mask-buffer";

/**
 * Encodes the editable binary buffer into the verbatim mask PNG that leaves for
 * the inpainting step (AD-7 / AR-MASK-VERBATIM). Contract: white = zone to erase
 * (painted, 255), black = keep (0), strictly at the buffer's canonical
 * dimensions, fully opaque, NO anti-aliasing and NO post-processing (no dilation,
 * blur, morphology, re-threshold) — what the user painted is exactly what ships.
 *
 * Pixels are written directly into an ImageData (not drawn via canvas paths, which
 * would smooth edges) — a pass-through for the already-binary buffer, NOT a
 * transform: no dilation/blur/morphology. The `>= 128` split is a safety net that
 * keeps the output strictly 0/255 even if a byte were ever non-binary. Browser-only
 * (canvas) — [LIVE-VERIFY], not unit-tested; the effects layer mocks this at its
 * boundary. Leaf layer (src/lib/).
 */
export async function encodeMaskPng(buffer: MaskBuffer): Promise<Blob> {
  const { data, width, height } = buffer;
  if (data.length !== width * height) {
    // Guard the verbatim contract: a dims/data mismatch would ship a wrong mask.
    throw new Error(
      `mask buffer size mismatch: ${data.length} !== ${width}x${height}`,
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");

  const image = ctx.createImageData(width, height);
  const out = image.data;
  for (let i = 0; i < data.length; i++) {
    // >=128 -> white (erase), else black (keep); opaque. Binary, verbatim.
    const v = data[i] >= 128 ? 255 : 0;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("mask PNG encode failed"))),
      "image/png",
    );
  });
}
