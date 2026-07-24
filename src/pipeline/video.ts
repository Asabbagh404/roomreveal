import { makeStepError } from "@/state/step-error";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  MODELS,
  TIMEOUTS_MS,
} from "./config";
import { fal } from "./client";
import { REVEAL_MOTION_PROMPT, REVEAL_NEGATIVE_PROMPT } from "./prompts";
import type { AdapterOptions, VideoResult } from "./types";

/**
 * Video adapter (AD-5, AD-10, AD-12): a passive async function that runs the
 * FLF (first-and-last-frame) generation on the fal queue and returns the URL of
 * the generated Révélation MP4. FLF STRICT (AD-1): the empty room is the
 * constrained FIRST frame (`first_frame_url`) and the untouched canonical photo
 * is the constrained LAST frame (`last_frame_url`) — so the furniture animates
 * INTO place (empty → furnished), never a fade. `last_frame_url` is always sent
 * (never left optional). No `aspect_ratio` is passed — veo's default is "auto",
 * which keeps the input frames' ratio (AR-PIXELS — no forced 16:9). 720p muted
 * (generate_audio: false) is the cost floor. Queue statuses map to WaitPhase
 * via onPhase; the 6 min timeout aborts the fal job and becomes a retryable
 * StepError (AD-8). @fal-ai/client is reached only through ./client.
 * Mirrors inpaint.ts / detect.ts.
 *
 * [ASSUMPTION — calibrate against the live model] veo 3.1 lite returns a single
 * `video` object; we read `video.url`. The field mapping below is the single
 * place to adjust; the contract returned to the app ({ reveal }) does not change.
 */
export async function video(
  emptyRoomUrl: string,
  photoUrl: string,
  { signal, onPhase }: AdapterOptions,
): Promise<VideoResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("video", true));
    }, TIMEOUTS_MS.video);
  });

  try {
    const run = fal.subscribe(MODELS.video, {
      input: {
        // FLF strict (AD-1): empty room first, untouched photo last.
        first_frame_url: emptyRoomUrl,
        last_frame_url: photoUrl,
        prompt: REVEAL_MOTION_PROMPT,
        negative_prompt: REVEAL_NEGATIVE_PROMPT,
        resolution: "720p",
        generate_audio: false,
      },
      abortSignal: controller.signal,
      // Retain the generated MP4 for 24 h like every fal object (AD-9).
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
      data?: VideoRawOutput;
    };

    const url = result.data?.video?.url;
    // A run that produced no usable video is a failure, not an empty success.
    if (typeof url !== "string" || url.trim() === "") {
      throw makeStepError("video", true);
    }
    return { reveal: url };
  } catch {
    // Never surface a native fal error (AD-8). Timeout/abort/no-video ⇒ every
    // failure collapses to the same retryable video StepError.
    throw makeStepError("video", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** The subset of the veo 3.1 lite output the adapter reads. */
interface VideoRawOutput {
  video?: { url?: string };
}
