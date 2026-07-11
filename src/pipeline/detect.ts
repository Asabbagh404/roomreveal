import { makeStepError } from "@/state/step-error";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  DETECT_MAX_MASKS,
  MODELS,
  TIMEOUTS_MS,
} from "./config";
import { fal } from "./client";
import { composeMask } from "./compose-mask";
import { SAM_DETECT_PROMPT } from "./prompts";
import type { AdapterOptions, DetectResult } from "./types";

/** Normalises a possibly-empty URL field to a real URL or null (FR-16 signal). */
function urlOrNull(url: string | undefined): string | null {
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

/**
 * Detection adapter (AD-5, AD-12): a passive async function that runs SAM 3
 * text-prompted segmentation on the canonical photo and returns a single binary
 * mask plus internal categories. Queue statuses map to WaitPhase via onPhase;
 * the 60 s timeout aborts the fal job and becomes a retryable StepError (AD-8).
 * @fal-ai/client is reached only through ./client.
 *
 * [ASSUMPTION — to calibrate against the live model] SAM 3's response exposes a
 * combined mask preview (`image`) plus per-segment masks. The field mapping
 * below is the single place to adjust once verified on a real fal call; the
 * contract returned to the app ({ initialMask, categories }) does not change.
 */
export async function detect(
  photoUrl: string,
  { signal, onPhase }: AdapterOptions,
): Promise<DetectResult> {
  // Internal controller chained to the caller's signal so the timeout can abort
  // the underlying fal job (not just win a race and orphan it, AD-12).
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("detect", true));
    }, TIMEOUTS_MS.detect);
  });

  try {
    const run = fal.subscribe(MODELS.detect, {
      input: {
        image_url: photoUrl,
        // Single English concept — see SAM_DETECT_PROMPT calibration note.
        prompt: SAM_DETECT_PROMPT,
        return_multiple_masks: true,
        max_masks: DETECT_MAX_MASKS,
        // Return a clean mask, not the photo with the mask applied: the combined
        // `image` preview is ~4x more complete this way (calibrated live). The
        // full win is unioning the `masks` array — see composeDetectResult.
        apply_mask: false,
        output_format: "png",
      },
      abortSignal: controller.signal,
      // Retain the generated mask for 24 h like every fal object (AD-9).
      headers: {
        "x-fal-object-lifecycle-preference": JSON.stringify({
          expiration_duration_seconds: ARTIFACT_EXPIRES_IN_SECONDS,
        }),
      },
      onQueueUpdate: (update: { status: string }) => {
        if (update.status === "IN_QUEUE") onPhase("queued");
        else if (update.status === "IN_PROGRESS") onPhase("generating");
        else if (update.status === "COMPLETED") onPhase("finalizing");
      },
    });
    // If the timeout wins the race, `run` may still settle later — swallow its
    // late rejection so it does not become an unhandled rejection.
    run.catch(() => {});

    const result = (await Promise.race([run, timeoutPromise])) as {
      data?: DetectRawOutput;
    };

    return await composeDetectResult(result.data ?? {});
  } catch {
    // Never surface a native fal error (AD-8). Abort/failure ⇒ retryable.
    throw makeStepError("detect", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** The subset of the SAM 3 output the adapter reads (Sam3ImageOutput). */
interface DetectRawOutput {
  image?: { url?: string };
  masks?: Array<{ url?: string }>;
}

/**
 * Maps the raw model output to the app contract (AD-5). Prefers the UNION of the
 * per-segment `masks` (composed + uploaded via composeMask) — calibrated live to
 * cover ~2x more of the scene than the model's combined `image` preview. Falls
 * back to the `image` preview when no segments are returned, then to null.
 * `initialMask === null` is the canonical "no furniture" signal (FR-16). SAM 3
 * does not label masks by category, so `categories` stays empty (internal-only).
 */
async function composeDetectResult(
  data: DetectRawOutput,
): Promise<DetectResult> {
  const maskUrls = (data.masks ?? [])
    .map((m) => urlOrNull(m.url))
    .filter((u): u is string => u !== null);
  if (maskUrls.length > 0) {
    return { initialMask: await composeMask(maskUrls), categories: [] };
  }
  // No per-segment masks — fall back to the combined preview, else no furniture.
  return { initialMask: urlOrNull(data.image?.url), categories: [] };
}
