import { makeStepError } from "@/state/step-error";
import { ARTIFACT_EXPIRES_IN_SECONDS, MODELS, TIMEOUTS_MS } from "./config";
import { fal } from "./client";
import type { AdapterOptions, EditResult } from "./types";

/**
 * Free-edit REMOVE adapter (AD-5, AD-12, Story 5.3): erases the masked region of
 * the working image with the object-eraser (Bria) and returns the URL of the
 * retouched image. Mask white = area erased (AD-7), so no inversion;
 * `mask_type: "manual"` marks the mask as user-supplied. Same model as the
 * Pièce-vide inpaint (`MODELS.inpaint`) but a distinct role here — the result is
 * an edited image, not an "empty room" — hence `EditResult { image }` and the
 * `edit` StepError. Mirrors inpaint.ts verbatim (controller chained to the
 * caller's signal, timeout aborts the fal job, queue→onPhase, 24h retention,
 * throw-on-empty). @fal-ai/client is reached only through ./client.
 */
export async function editRemove(
  imageUrl: string,
  maskUrl: string,
  { signal, onPhase }: AdapterOptions,
): Promise<EditResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("edit", true));
    }, TIMEOUTS_MS.edit);
  });

  try {
    const run = fal.subscribe(MODELS.inpaint, {
      input: {
        image_url: imageUrl,
        mask_url: maskUrl,
        mask_type: "manual",
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
    // If the timeout wins the race, swallow `run`'s late rejection.
    run.catch(() => {});

    const result = (await Promise.race([run, timeoutPromise])) as {
      data?: EditRawOutput;
    };

    const url = result.data?.image?.url;
    if (typeof url !== "string" || url.trim() === "") {
      throw makeStepError("edit", true);
    }
    return { image: url };
  } catch {
    // Never surface a native fal error (AD-8). Timeout/abort/no-image ⇒ the same
    // retryable edit StepError.
    throw makeStepError("edit", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Free-edit ADD adapter (AD-5, AD-12, Story 5.4): generates the object described
 * by `prompt` inside the masked (white) region of the working image with
 * flux-pro/v1/fill, leaving the rest intact, and returns the URL of the result.
 * Mask white = area regenerated per prompt (AD-7) = where the object goes. Same
 * skeleton as editRemove; only the model, the `prompt` input and the output shape
 * differ — flux fill returns an `images[]` array (read `images[0].url`), unlike
 * bria's single `image`. @fal-ai/client is reached only through ./client.
 */
export async function editAdd(
  imageUrl: string,
  maskUrl: string,
  prompt: string,
  { signal, onPhase }: AdapterOptions,
): Promise<EditResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("edit", true));
    }, TIMEOUTS_MS.editAdd);
  });

  try {
    const run = fal.subscribe(MODELS.editAdd, {
      input: {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt,
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
      data?: EditAddRawOutput;
    };

    const url = result.data?.images?.[0]?.url;
    if (typeof url !== "string" || url.trim() === "") {
      throw makeStepError("edit", true);
    }
    return { image: url };
  } catch {
    throw makeStepError("edit", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** The subset of the bria/eraser output the adapter reads. */
interface EditRawOutput {
  image?: { url?: string };
}

/** The subset of the flux-pro/v1/fill output the adapter reads. */
interface EditAddRawOutput {
  images?: { url?: string }[];
}
