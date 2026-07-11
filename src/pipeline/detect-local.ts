import { isStepError, makeStepError } from "@/state/step-error";
import { LOCAL_DETECT_TIMEOUT_MS, LOCAL_DETECT_URL } from "./config";
import { FURNITURE_CATEGORIES } from "./prompts";
import type { AdapterOptions, DetectResult } from "./types";

/**
 * Local detection adapter (AD-5, AD-12): an alternative to the fal `detect`,
 * selected by DETECT_BACKEND === "local". It POSTs the detection-resolution
 * image plus the full FURNITURE_CATEGORIES concept list to a self-hosted
 * Grounded-SAM service, which detects each concept, unions the masks, and
 * returns a single binary PNG. No fal involved — the per-category loop is free.
 *
 * Contract matches `detect`: returns `{ initialMask, categories }` where
 * `initialMask` is a data URL of the unioned mask (reduced to canonical later by
 * mask-raster, AD-2 amendment) or `null` when nothing is found (FR-16). The
 * service signals "no furniture" with HTTP 204. Errors become a retryable
 * detect StepError (AD-8); the raw error is never surfaced.
 */
export async function detectLocal(
  imageBlob: Blob,
  { signal, onPhase }: AdapterOptions,
): Promise<DetectResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(
    () => controller.abort(),
    LOCAL_DETECT_TIMEOUT_MS,
  );

  try {
    onPhase("generating");
    const form = new FormData();
    form.append("image", imageBlob, "detection.jpg");
    form.append("prompts", JSON.stringify(FURNITURE_CATEGORIES));

    const res = await fetch(LOCAL_DETECT_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    // 204 = the service ran but found no furniture (FR-16), not an error.
    if (res.status === 204) return { initialMask: null, categories: [] };
    if (!res.ok) throw makeStepError("detect", true);

    const maskBlob = await res.blob();
    return { initialMask: await blobToDataUrl(maskBlob), categories: [] };
  } catch (err) {
    throw isStepError(err) ? err : makeStepError("detect", true);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
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
