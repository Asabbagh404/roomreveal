import { makeStepError } from "@/state/step-error";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  MODELS,
  TIMEOUTS_MS,
} from "./config";
import { fal } from "./client";
import type { AdapterOptions, InpaintResult } from "./types";

/**
 * Inpainting adapter (AD-5, AD-12): a passive async function that runs the
 * object-eraser (Bria) on the canonical photo + validated mask and returns the
 * URL of the generated empty room. The mask's white pixels are the region the
 * eraser cleans (fills with plausible background) — exactly our AD-7 convention
 * (white = furniture to erase), so no inversion. `mask_type: "manual"` tells the
 * model the mask is user-supplied (not auto-generated). Queue statuses map to
 * WaitPhase via onPhase; the 60 s timeout aborts the fal job and becomes a
 * retryable StepError (AD-8). @fal-ai/client is reached only through ./client.
 * Mirrors detect.ts.
 *
 * [ASSUMPTION — calibrated live 2026-07-12] bria/eraser returns a single
 * `image` object; we read `image.url`. The field mapping below is the single
 * place to adjust if the model changes; the contract returned to the app
 * ({ emptyRoom }) does not change.
 */
export async function inpaint(
  photoUrl: string,
  maskUrl: string,
  { signal, onPhase }: AdapterOptions,
): Promise<InpaintResult> {
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
      reject(makeStepError("inpaint", true));
    }, TIMEOUTS_MS.inpaint);
  });

  try {
    const run = fal.subscribe(MODELS.inpaint, {
      input: {
        image_url: photoUrl,
        mask_url: maskUrl,
        // The mask is user-supplied (detected + hand-edited), not auto-generated.
        mask_type: "manual",
      },
      abortSignal: controller.signal,
      // Retain the generated empty room for 24 h like every fal object (AD-9).
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
      data?: InpaintRawOutput;
    };

    const url = result.data?.image?.url;
    // A run that produced no usable image is a failure, not an empty success.
    if (typeof url !== "string" || url.trim() === "") {
      throw makeStepError("inpaint", true);
    }
    return { emptyRoom: url };
  } catch {
    // Never surface a native fal error (AD-8). Timeout/abort/no-image ⇒ every
    // failure collapses to the same retryable inpaint StepError.
    throw makeStepError("inpaint", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** The subset of the bria/eraser output the adapter reads. */
interface InpaintRawOutput {
  image?: { url?: string };
}
