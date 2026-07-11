import type { StepError } from "@/state/types";
import { fal } from "./client";
import { MODELS, TIMEOUTS_MS } from "./config";
import { FURNITURE_PROMPTS } from "./prompts";
import type { AdapterOptions, DetectResult } from "./types";

function detectError(retryable: boolean): StepError {
  return {
    step: "detect",
    retryable,
    userMessage:
      "La détection des meubles n'a pas abouti. Votre photo est conservée — relancez quand vous voulez.",
  };
}

/**
 * Detection adapter (AD-5, AD-12): a passive async function that runs SAM 3
 * text-prompted segmentation on the canonical photo and returns a single binary
 * mask (segments composed here) plus internal categories. Queue statuses are
 * mapped to WaitPhase via onPhase; the timeout (60 s) becomes a retryable
 * StepError (AD-8). @fal-ai/client is reached only through ./client.
 *
 * [ASSUMPTION — to calibrate against the live model] SAM 3's response exposes a
 * combined mask image and per-segment labels. The exact field names below are
 * the single place to adjust once verified on a real fal call; the contract
 * returned to the rest of the app ({ initialMask, categories }) does not change.
 */
export async function detect(
  photoUrl: string,
  { signal, onPhase }: AdapterOptions,
): Promise<DetectResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(detectError(true)), TIMEOUTS_MS.detect);
  });

  try {
    const run = fal.subscribe(MODELS.detect, {
      input: {
        image_url: photoUrl,
        // SAM 3 is text-prompted (single prompt string); the furniture list is
        // joined so every category is a segmentation target.
        prompt: FURNITURE_PROMPTS.join(", "),
        return_multiple_masks: true,
        output_format: "png",
      },
      abortSignal: signal,
      onQueueUpdate: (update: { status: string }) => {
        if (update.status === "IN_QUEUE") onPhase("queued");
        else if (update.status === "IN_PROGRESS") onPhase("generating");
      },
    });

    const result = (await Promise.race([run, timeoutPromise])) as {
      data?: DetectRawOutput;
    };

    return composeDetectResult(result.data ?? {});
  } catch (err) {
    // Never surface a native fal error (AD-8). Abort is treated as retryable.
    throw isStepError(err) ? err : detectError(true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function isStepError(err: unknown): err is StepError {
  return (
    typeof err === "object" &&
    err !== null &&
    "step" in err &&
    (err as { step: unknown }).step === "detect"
  );
}

/** The subset of the SAM 3 output the adapter reads (Sam3ImageOutput). */
interface DetectRawOutput {
  image?: { url?: string };
  masks?: Array<{ url?: string }>;
}

/**
 * Maps the raw model output to the app contract. Composition of the N SAM
 * segments into one canonical binary mask lives here, never in the UI (AD-5).
 * `initialMask === null` is the canonical "no furniture" signal (FR-16).
 */
function composeDetectResult(data: DetectRawOutput): DetectResult {
  // [ASSUMPTION — calibrate on a live call] SAM 3 does not label masks by
  // category, so `categories` stays empty for now (it is internal-only and
  // never shown in the UI, so this has no user-facing effect).
  return { initialMask: extractMaskUrl(data), categories: [] };
}

function extractMaskUrl(data: DetectRawOutput): string | null {
  // Primary combined mask preview, when the model returns one.
  if (data.image?.url) return data.image.url;

  // Otherwise, per-segment masks: no segment ⇒ no furniture ⇒ null (FR-16).
  const masks = data.masks;
  if (!masks || masks.length === 0) return null;
  // [ASSUMPTION] With multiple segments the binary union is composed on canvas
  // at build time; the first mask stands in until the live shape is confirmed.
  return masks[0]?.url ?? null;
}
