import { makeStepError } from "@/state/step-error";
import { ARTIFACT_EXPIRES_IN_SECONDS, MODELS, TIMEOUTS_MS } from "./config";
import { fal } from "./client";
import type { AdapterOptions, PointSegmentResult } from "./types";
import type { Point } from "@/lib/mask-buffer";

/** Normalises a possibly-empty URL field to a real URL or null. */
function urlOrNull(url: string | undefined): string | null {
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

/**
 * Point-prompt segmentation adapter (AD-5, AD-12): SAM's interactive interface —
 * given ONE positive point on the image, return the mask of the object under it.
 * Structurally identical to `detect` (controller chained to the caller's signal,
 * timeout aborts the fal job and becomes a retryable StepError AD-8, queue
 * statuses → onPhase, 24 h retention AD-9). @fal-ai/client is reached only via
 * ./client.
 *
 * The sam2/image schema is typed by @fal-ai/client (Sam2ImageInput / HEDOutput):
 * input `{ image_url, prompts: [{ x, y, label }] }` (label "1" = foreground) with
 * `apply_mask: false` so the output `image` is the clean binary mask rather than
 * the masked photo (same trick as `detect` with sam-3). Point coords are IMAGE
 * pixels; the caller passes canonical coords, which equal image pixels since the
 * work image is at canonical dims (AR-PIXELS). The output→contract mapping lives
 * in the single `composePointResult` below.
 */
export async function pointSegment(
  imageUrl: string,
  point: Point,
  { signal, onPhase }: AdapterOptions,
): Promise<PointSegmentResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("pointSegment", true));
    }, TIMEOUTS_MS.pointSegment);
  });

  try {
    const run = fal.subscribe(MODELS.pointSegment, {
      input: {
        image_url: imageUrl,
        // One positive point (label "1" = foreground/include) at the click.
        prompts: [
          { x: Math.round(point.x), y: Math.round(point.y), label: "1" },
        ],
        // Return the clean binary mask, not the photo with the mask applied.
        apply_mask: false,
        output_format: "png",
      },
      abortSignal: controller.signal,
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
      data?: PointRawOutput;
    };

    return composePointResult(result.data ?? {});
  } catch {
    // Never surface a native fal error (AD-8). Abort/failure ⇒ retryable.
    throw makeStepError("pointSegment", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** The subset of the sam2/image output the adapter reads (HEDOutput = { image }).
 * The `mask`/`masks` fallbacks are defensive in case a variant returns them. */
interface PointRawOutput {
  image?: { url?: string };
  mask?: { url?: string };
  masks?: Array<{ url?: string }>;
}

/**
 * Maps the raw sam2 output to the app contract (AD-5). The clean mask is the
 * `image` field (apply_mask:false); `mask`/`masks` are defensive fallbacks.
 * Throws a retryable StepError rather than returning an empty result.
 */
function composePointResult(data: PointRawOutput): PointSegmentResult {
  const mask =
    urlOrNull(data.image?.url) ??
    urlOrNull(data.mask?.url) ??
    urlOrNull(data.masks?.[0]?.url);
  if (mask === null) throw makeStepError("pointSegment", true);
  return { mask };
}
