import { isStepError, makeStepError } from "@/state/step-error";
import { LOCAL_DETECT_TIMEOUT_MS, LOCAL_DETECT_URL } from "./config";
import type { AdapterOptions, PointSegmentResult } from "./types";
import type { Point } from "@/lib/mask-buffer";
import type { SelectBox } from "./point-segment";

/**
 * Local SAM segmentation adapters (AD-5, AD-12): the DETECT_BACKEND === "local"
 * counterparts of `pointSegment`/`boxSegment`. POST the work image plus the point
 * or box to the self-hosted SAM service (routes `/point` and `/box`, SAM without
 * Grounding DINO) and return a single binary PNG mask as a data URL. No fal
 * involved; errors become a retryable pointSegment StepError (AD-8).
 */
export function pointSegmentLocal(
  imageBlob: Blob,
  point: Point,
  opts: AdapterOptions,
): Promise<PointSegmentResult> {
  return postSegment(
    imageBlob,
    "point",
    "point",
    { x: Math.round(point.x), y: Math.round(point.y) },
    opts,
  );
}

export function boxSegmentLocal(
  imageBlob: Blob,
  box: SelectBox,
  opts: AdapterOptions,
): Promise<PointSegmentResult> {
  return postSegment(
    imageBlob,
    "box",
    "box",
    {
      x_min: Math.round(Math.min(box.x0, box.x1)),
      y_min: Math.round(Math.min(box.y0, box.y1)),
      x_max: Math.round(Math.max(box.x0, box.x1)),
      y_max: Math.round(Math.max(box.y0, box.y1)),
    },
    opts,
  );
}

/** Shared POST to the local SAM service: `route` is the path suffix, `field` the
 * form field name carrying the JSON-encoded prompt. */
async function postSegment(
  imageBlob: Blob,
  route: "point" | "box",
  field: string,
  prompt: unknown,
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
    form.append(field, JSON.stringify(prompt));

    const res = await fetch(localUrl(LOCAL_DETECT_URL, route), {
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

/** Derives a route endpoint from the configured detect URL: swaps a trailing
 * `/detect` for `/<route>`, or appends `/<route>` if no such suffix exists (so a
 * base URL without the detect path still targets a real route). */
function localUrl(detectUrl: string, route: string): string {
  const swapped = detectUrl.replace(/\/detect\/?$/, `/${route}`);
  if (swapped !== detectUrl) return swapped;
  return `${detectUrl.replace(/\/$/, "")}/${route}`;
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
