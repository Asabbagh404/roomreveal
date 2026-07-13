import { makeStepError } from "@/state/step-error";
import { ARTIFACT_EXPIRES_IN_SECONDS, MODELS, TIMEOUTS_MS } from "./config";
import { fal } from "./client";
import type { AdapterOptions, PointSegmentResult } from "./types";
import type { Point } from "@/lib/mask-buffer";

/** Normalises a possibly-empty URL field to a real URL or null. */
function urlOrNull(url: string | undefined): string | null {
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

/** A rectangle in canonical buffer coords (raw drag corners, any order). */
export interface SelectBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * SAM segmentation adapter (AD-5, AD-12): SAM's interactive interface via the
 * fal sam2/image endpoint. Two prompt shapes share one core:
 * - `pointSegment` — ONE positive point → the salient object under it (often a
 *   sub-part, e.g. a drawer).
 * - `boxSegment` — a rectangle → the whole object enclosed by the box (the fix
 *   for "clicked the drawer, got the drawer instead of the cabinet").
 *
 * Structurally identical to `detect` (controller chained to the caller's signal,
 * timeout aborts the fal job → retryable StepError AD-8, queue statuses → onPhase,
 * 24 h retention AD-9). @fal-ai/client is reached only via ./client. The schema is
 * typed by @fal-ai/client (Sam2ImageInput / HEDOutput): `apply_mask:false` so the
 * output `image` is the clean binary mask. Coords are IMAGE pixels = canonical
 * (AR-PIXELS). Output→contract mapping lives in the single `composePointResult`.
 */
export function pointSegment(
  imageUrl: string,
  point: Point,
  opts: AdapterOptions,
): Promise<PointSegmentResult> {
  return sam2Segment(
    imageUrl,
    {
      prompts: [
        { x: Math.round(point.x), y: Math.round(point.y), label: "1" },
      ],
    },
    opts,
  );
}

export function boxSegment(
  imageUrl: string,
  box: SelectBox,
  opts: AdapterOptions,
): Promise<PointSegmentResult> {
  return sam2Segment(
    imageUrl,
    {
      box_prompts: [
        {
          x_min: Math.round(Math.min(box.x0, box.x1)),
          y_min: Math.round(Math.min(box.y0, box.y1)),
          x_max: Math.round(Math.max(box.x0, box.x1)),
          y_max: Math.round(Math.max(box.y0, box.y1)),
        },
      ],
    },
    opts,
  );
}

/** Shared sam2/image call: `promptFields` is the point- or box-specific part. */
async function sam2Segment(
  imageUrl: string,
  promptFields: Record<string, unknown>,
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
        ...promptFields,
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
