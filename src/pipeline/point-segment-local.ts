import { isStepError, makeStepError } from "@/state/step-error";
import { LOCAL_DETECT_TIMEOUT_MS, LOCAL_DETECT_URL } from "./config";
import type { AdapterOptions, PointSegmentResult } from "./types";
import type { Point } from "@/lib/mask-buffer";

/**
 * Local point-prompt segmentation adapter (AD-5, AD-12): the DETECT_BACKEND ===
 * "local" counterpart of `pointSegment`. POSTs the work image plus the clicked
 * point to the self-hosted SAM service, which runs SAM in point-prompt mode (no
 * Grounding DINO) and returns a single binary PNG mask. No fal involved.
 *
 * The point endpoint lives at LOCAL_DETECT_URL with `/point` appended (the
 * service exposes `/detect` for text-prompt and `/point` for click). Returns the
 * mask as a data URL; errors become a retryable pointSegment StepError (AD-8).
 */
export async function pointSegmentLocal(
  imageBlob: Blob,
  point: Point,
  { signal, onPhase }: AdapterOptions,
): Promise<PointSegmentResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), LOCAL_DETECT_TIMEOUT_MS);

  try {
    onPhase("generating");
    const form = new FormData();
    form.append("image", imageBlob, "work.png");
    form.append(
      "point",
      JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) }),
    );

    const res = await fetch(pointUrl(LOCAL_DETECT_URL), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) throw makeStepError("pointSegment", true);
    const maskBlob = await res.blob();
    return { mask: await blobToDataUrl(maskBlob) };
  } catch (err) {
    throw isStepError(err) ? err : makeStepError("pointSegment", true);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** Swaps the `/detect` suffix of the base URL for `/point` (same host/port). */
function pointUrl(detectUrl: string): string {
  return detectUrl.replace(/\/detect\/?$/, "/point");
}

/** Reads a Blob into a data: URL so the mask needs no object-URL lifecycle. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("mask read failed"));
    reader.readAsDataURL(blob);
  });
}
