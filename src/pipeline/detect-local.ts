import { isStepError, makeStepError } from "@/state/step-error";
import { LOCAL_DETECT_TIMEOUT_MS, LOCAL_DETECT_URL } from "./config";
import { FURNITURE_CATEGORIES } from "./prompts";
import type { AdapterOptions, DetectedInstance, DetectResult } from "./types";

/**
 * Local detection adapter (AD-5, AD-12): an alternative to the fal `detect`,
 * selected by DETECT_BACKEND === "local". It POSTs the detection-resolution
 * image plus the full FURNITURE_CATEGORIES concept list to a self-hosted
 * Grounded-SAM service, which detects each concept, unions the masks, and
 * returns a JSON `{ mask: <PNG base64>, instances }` envelope (Story 4.6).
 * No fal involved — the per-category loop is free.
 *
 * Contract matches `detect` plus the optional `instances`: returns
 * `{ initialMask, categories, instances }` where `initialMask` is a data URL of
 * the unioned mask (reduced to canonical later by mask-raster, AD-2 amendment)
 * or `null` when nothing is found (FR-16), and `instances` are the per-object
 * detections (labels + [0,1] boxes) feeding the motion prompt. The service
 * signals "no furniture" with HTTP 204. Errors — a malformed JSON body
 * included — become a retryable detect StepError (AD-8); the raw error is
 * never surfaced.
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

    // JSON envelope (Story 4.6): a malformed body throws here and falls into
    // the catch below — same retryable StepError as every other failure (AD-8).
    const payload = (await res.json()) as {
      mask?: unknown;
      instances?: unknown;
    };
    if (typeof payload.mask !== "string" || payload.mask === "") {
      throw makeStepError("detect", true);
    }
    return {
      // The service sends bare base64 — build the data URL directly, so the
      // mask needs no object-URL lifecycle (parity with the old blob path).
      initialMask: `data:image/png;base64,${payload.mask}`,
      categories: [],
      instances: sanitizeInstances(payload.instances),
    };
  } catch (err) {
    throw isStepError(err) ? err : makeStepError("detect", true);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Boundary validation for the per-object detections (Story 4.6). Instances are
 * an informative side channel — the mask is the primary output — so malformed
 * data degrades to `undefined` (→ the generic motion-prompt fallback) instead
 * of failing the detection. This keeps a service bug from surfacing later as a
 * misattributed, eternally-retryable video error.
 */
function sanitizeInstances(raw: unknown): DetectedInstance[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter(
    (entry): entry is DetectedInstance =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as DetectedInstance).label === "string" &&
      (entry as DetectedInstance).label !== "" &&
      Array.isArray((entry as DetectedInstance).box) &&
      (entry as DetectedInstance).box.length === 4 &&
      (entry as DetectedInstance).box.every(
        (coord) => typeof coord === "number" && Number.isFinite(coord),
      ) &&
      typeof (entry as DetectedInstance).area === "number" &&
      Number.isFinite((entry as DetectedInstance).area),
  );
  return valid.length > 0 ? valid : undefined;
}
