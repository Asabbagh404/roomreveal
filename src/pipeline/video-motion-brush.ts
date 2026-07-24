import type { KlingVideoV15ProImageToVideoInput } from "@fal-ai/client/endpoints";
import { makeStepError } from "@/state/step-error";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  LOCAL_REVERSE_URL,
  MODELS,
  TIMEOUTS_MS,
} from "./config";
import { fal, uploadArtifact } from "./client";
import { exitTrajectory } from "./motion-trajectory";
import { REVEAL_NEGATIVE_PROMPT } from "./prompts";
import type {
  AdapterOptions,
  InstanceMasksResult,
  VideoResult,
} from "./types";

/** Kling caps `dynamic_masks` at 6 elements; the rest fall to the static brush. */
const MAX_DYNAMIC_MASKS = 6;

/**
 * Prompt for the Motion Brush EXIT clip (Story 4.8): the furniture slides out of
 * the furnished room. The clip is reversed afterwards, so this reads as the
 * furniture leaving — the reversed video shows it arriving.
 */
const MOTION_BRUSH_EXIT_PROMPT =
  "the furniture pieces slide out of the room and off the edges of the frame, leaving the room empty; solid fully-opaque objects moving with real trajectories, no morphing, no fading";

/**
 * Motion Brush video adapter (Story 4.8, AD-5, AD-8, AD-9, AD-12): a passive
 * async function that drives per-object motion by mask + trajectory instead of
 * FLF interpolation, then reverses the clip so the furniture ENTERS and the last
 * frame is the untouched photo.
 *
 * Chain: (1) upload each instance mask + the static mask to fal (they arrive as
 * data URLs → fetch → blob → uploadArtifact), capping to the 6 largest objects
 * by area (Kling's `dynamic_masks` limit) and logging the dropped count; (2)
 * `fal.subscribe(kling v1.5 pro)` with `image_url` = the furnished photo,
 * `static_mask_url` = the room shell, `dynamic_masks` = one `{mask_url,
 * trajectories}` per capped object — NEVER `tail_image_url` (mutually exclusive
 * with masks); (3) fetch the generated exit clip, POST it to the local
 * `/reverse` route, re-upload the reversed MP4 via `uploadArtifact`, and return
 * `{ reveal }` (a fal URL). Every failure (fal, `/reverse`, upload) collapses to
 * a retryable `video` StepError — never a raw fal error. @fal-ai/client is
 * reached only through ./client.
 *
 * [ASSUMPTION — calibrate against the live model] Kling returns a single `video`
 * object; we read `video.url`. That field mapping is the single place to adjust.
 */
export async function videoMotionBrush(
  photoUrl: string,
  instanceMasks: InstanceMasksResult,
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
    // Cap to the 6 largest objects by area (Kling limit); the rest stay on the
    // static brush — log the dropped count, never truncate silently.
    const byAreaDesc = [...instanceMasks.instances].sort(
      (a, b) => b.area - a.area,
    );
    const capped = byAreaDesc.slice(0, MAX_DYNAMIC_MASKS);
    const dropped = byAreaDesc.length - capped.length;
    if (dropped > 0) {
      console.log(
        `[motion-brush] ${byAreaDesc.length} instances, capped to ${MAX_DYNAMIC_MASKS} dynamic masks (${dropped} dropped to the static brush)`,
      );
    }

    // A missing/empty static mask would build an invalid static_mask_url from an
    // empty data URL — bail to a retryable video StepError instead.
    if (!instanceMasks.staticMask) throw makeStepError("video", true);

    onPhase("uploading");
    // Upload the room shell (static brush) and each object mask (dynamic brush).
    const staticMaskUrl = await uploadArtifact(
      await dataUrlToBlob(instanceMasks.staticMask),
    );
    if (controller.signal.aborted) throw makeStepError("video", true);

    // Trajectory pixel space = the mask's real dimensions (the image_url pixel
    // space Kling reads). All masks share the detection image size.
    const { width, height } = await maskDimensions(instanceMasks.staticMask);

    const dynamicMasks = await Promise.all(
      capped.map(async (instance) => {
        const maskUrl = await uploadArtifact(
          await dataUrlToBlob(instance.mask),
        );
        return {
          mask_url: maskUrl,
          trajectories: exitTrajectory(instance.box, width, height),
        };
      }),
    );
    if (controller.signal.aborted) throw makeStepError("video", true);

    // Start = the furnished photo (a perfectly constrained frame). The furniture
    // EXITS; reversing the clip makes it enter and end on the photo. NEVER send
    // tail_image_url — it is mutually exclusive with the masks (AD-1 amendment /
    // documented Kling contract). The Motion Brush fields (static_mask_url,
    // dynamic_masks) are declared on kling v1.5 pro's input type; the local shape
    // differs only in the trajectory subtype, so the input is cast at this boundary.
    const input: MotionBrushInput = {
      image_url: photoUrl,
      prompt: MOTION_BRUSH_EXIT_PROMPT,
      duration: "5",
      static_mask_url: staticMaskUrl,
      dynamic_masks: dynamicMasks,
      negative_prompt: REVEAL_NEGATIVE_PROMPT,
    };
    const run = fal.subscribe(MODELS.videoMotionBrush, {
      // v1.5 pro's input type declares the Motion Brush fields; our local shape
      // differs only in the trajectory subtype (`{x,y}` vs the SDK's Trajectory),
      // so cast through `unknown` to the SDK-expected input type.
      input: input as unknown as KlingVideoV15ProImageToVideoInput,
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
      data?: { video?: { url?: string } };
    };
    const exitUrl = result.data?.video?.url;
    if (typeof exitUrl !== "string" || exitUrl.trim() === "") {
      throw makeStepError("video", true);
    }

    // Reverse the exit clip locally so the furniture enters and the last frame
    // is the untouched photo, then re-upload the reversed MP4 (AD-9 — the reveal
    // stays a fal URL; /reverse is a transient local transform, not storage).
    onPhase("finalizing");
    const exitResponse = await fetch(exitUrl, { signal: controller.signal });
    // A non-OK fetch would hand an error-page body to /reverse — bail instead.
    if (!exitResponse.ok) throw makeStepError("video", true);
    const exitClip = await exitResponse.blob();
    if (controller.signal.aborted) throw makeStepError("video", true);

    const reverseForm = new FormData();
    reverseForm.append("video", exitClip, "exit.mp4");
    const reversed = await fetch(LOCAL_REVERSE_URL, {
      method: "POST",
      body: reverseForm,
      signal: controller.signal,
    });
    if (!reversed.ok) throw makeStepError("video", true);
    const reversedBlob = await reversed.blob();
    if (controller.signal.aborted) throw makeStepError("video", true);

    const revealUrl = await uploadArtifact(reversedBlob);
    if (typeof revealUrl !== "string" || revealUrl.trim() === "") {
      throw makeStepError("video", true);
    }
    return { reveal: revealUrl };
  } catch {
    // Never surface a native fal / reverse / upload error (AD-8): every failure
    // collapses to the same retryable video StepError.
    throw makeStepError("video", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * The kling v1.5 pro Motion Brush input. The mask-driven fields
 * (`static_mask_url`, `dynamic_masks`) exist on the SDK type, but its trajectory
 * subtype differs from ours — declared here for local type safety, cast at the
 * subscribe boundary. `tail_image_url` is deliberately NOT declared: it is
 * mutually exclusive with the masks and must never be sent.
 */
interface MotionBrushInput {
  image_url: string;
  prompt: string;
  duration: "5" | "10";
  static_mask_url: string;
  dynamic_masks: { mask_url: string; trajectories: { x: number; y: number }[] }[];
  negative_prompt: string;
}

/** Decode a `data:` URL back into a Blob for uploadArtifact. */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * The mask's pixel dimensions = the image_url pixel space Kling reads for
 * trajectories. Decoded once from the static mask (all masks share the detection
 * image size). Uses `createImageBitmap` (browser); mocked in tests.
 */
async function maskDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return dims;
}
