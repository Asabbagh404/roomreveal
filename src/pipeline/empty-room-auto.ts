import { makeStepError } from "@/state/step-error";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  MODELS,
  TIMEOUTS_MS,
} from "./config";
import { fal } from "./client";
import { EMPTY_ROOM_AUTO_PROMPT } from "./prompts";
import type { AdapterOptions, InpaintResult } from "./types";

/**
 * Maskless empty-room adapter (AD-5, AD-12), Story 3.4. Runs an instruction-edit
 * model (`fal-ai/nano-banana-2/edit`, Gemini) on the canonical photo to remove
 * ALL furniture in one shot — no mask needed — producing a far cleaner empty
 * room than the mask + eraser path (validated live). Used by the « Vider
 * automatiquement » path; the mask + bria eraser path stays for manual retouch.
 * Returns the same `InpaintResult { emptyRoom }` contract, so the effect layer
 * and the reducer (INPAINT_SUCCEEDED) are reused as-is. Failures collapse to the
 * `inpaint` StepError (the result lives on the Pièce vide surface, AD-8).
 * Mirrors inpaint.ts / video.ts.
 *
 * [ASSUMPTION — calibrated live 2026-07-13] nano-banana returns `images[]`; we
 * take the first. The model preserves the input's aspect ratio but not the exact
 * canonical pixel size (see Story 3.4 dev notes on FLF frame dims).
 */
export async function autoEmptyRoom(
  photoUrl: string,
  { signal, onPhase }: AdapterOptions,
): Promise<InpaintResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("inpaint", true));
    }, TIMEOUTS_MS.emptyRoomAuto);
  });

  try {
    const run = fal.subscribe(MODELS.emptyRoomAuto, {
      input: {
        image_urls: [photoUrl],
        prompt: EMPTY_ROOM_AUTO_PROMPT,
        resolution: "1K",
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
    run.catch(() => {});

    const result = (await Promise.race([run, timeoutPromise])) as {
      data?: AutoEmptyRoomRawOutput;
    };

    const url = result.data?.images?.[0]?.url;
    if (typeof url !== "string" || url.trim() === "") {
      throw makeStepError("inpaint", true);
    }
    return { emptyRoom: url };
  } catch {
    // Never surface a native fal error (AD-8) — every failure ⇒ retryable inpaint.
    throw makeStepError("inpaint", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** The subset of the nano-banana edit output the adapter reads. */
interface AutoEmptyRoomRawOutput {
  images?: Array<{ url?: string }>;
}
