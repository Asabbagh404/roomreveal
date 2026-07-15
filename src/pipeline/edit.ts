import { isStepError, makeStepError } from "@/state/step-error";
import { decodeMaskToBuffer } from "@/lib/mask-decode";
import {
  compositeMaskedOverlay,
  erodeMask,
  imageSize,
  meanImageColor,
  tintMaskedRegion,
} from "@/lib/retexture-region";
import { ARTIFACT_EXPIRES_IN_SECONDS, MODELS, TIMEOUTS_MS } from "./config";
import { fal, uploadArtifact } from "./client";
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

/**
 * Thin Kontext call: runs `flux-pro/kontext/multi` on the given `image_urls`
 * (in-context multi-image editor) and returns the first result URL. When two URLs
 * are passed, the SECOND is the material reference the prompt refers to. Same
 * abort/timeout/queue/retention skeleton as the other adapters; returns the URL
 * (not an EditResult) because editModify wraps it in a crop→composite flow.
 * Throws a retryable edit StepError on timeout/abort/empty. @fal-ai/client only
 * via ./client. Exported for unit tests (the fal wire contract); editModify's
 * canvas orchestration around it is browser-only / live-verified.
 */
export async function runKontext(
  imageUrls: string[],
  prompt: string,
  { signal, onPhase }: AdapterOptions,
): Promise<string> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("edit", true));
    }, TIMEOUTS_MS.editModify);
  });

  try {
    const run = fal.subscribe(MODELS.editModify, {
      input: { image_urls: imageUrls, prompt },
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
    return url;
  } catch {
    throw makeStepError("edit", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Pixels the selection is shrunk by before compositing, to hide the material
 * halo a loose/anti-aliased selection would otherwise leak around the object.
 * Calibrate live: raise if a halo remains, lower if it eats the object's edge.
 */
const MASK_ERODE_PX = 3;

/**
 * Free-edit MODIFY adapter (AD-5, AD-12, texture bank): applies an EXACT reference
 * texture (or a text instruction) to ONLY the user-selected object of the working
 * image, and returns the URL of the composited result. Kontext transfers a real
 * swatch far better than an IP-Adapter (benched weak, 2026-07-14) but is MASKLESS.
 * This bridges "exact texture" (needs a reference image → Kontext) and "only my
 * selection" (needs a mask → no fal model does both) with a full-scene edit +
 * masked composite, client-side from `imageUrl` + `maskUrl`:
 *   1. texture path only — TINT the selected object to the swatch's mean color
 *      first (ZeST-inspired init, arXiv 2404.06425 Eq. 2, adapted): kills the
 *      object's base-color prior while keeping its shading as lighting cues, AND
 *      anchors the hue to the swatch. Plain ZeST grayscale failed live
 *      (2026-07-15): Klein is a faithful editor, not a regenerating inpainter —
 *      it kept the neutral gray as the final color (beige wood on a gray kitchen
 *      → gray wood). Skipped for instruction-only edits, where the instruction
 *      may refer to the original color ("make it darker").
 *   2. runKontext([workingImage, texture?], prompt) re-renders the WHOLE scene —
 *      cropping to the object first made Kontext PASTE the swatch flat (live
 *      2026-07-14); the full scene keeps the object's 3D form/lighting so it maps
 *      the swatch as a real material;
 *   3. COMPOSITE that edit over the ORIGINAL working image (not the tinted one),
 *      gated by the mask, so only the selected pixels change (strict locality) —
 *      output at the working dims. The tint uses the RAW mask (full coverage of
 *      the color prior); the composite uses the ERODED mask, so any tinted pixel
 *      outside the eroded edge is discarded with the rest of the edit.
 * `image_urls[1]` (texture) is present only when a texture is chosen; an
 * instruction-only recolor sends just the working image. The mask discards any
 * area Kontext changed outside the selection. Every failure ⇒ retryable edit
 * StepError (AD-8). @fal-ai/client is reached only through ./client.
 */
export async function editModify(
  imageUrl: string,
  maskUrl: string,
  { textureUrl, prompt }: { textureUrl?: string; prompt: string },
  { signal, onPhase }: AdapterOptions,
): Promise<EditResult> {
  try {
    // The mask PNG is at the working image's canonical dims (AD-7); decode it back
    // to a buffer so we can keep only the selected pixels of Kontext's edit.
    const { width, height } = await imageSize(imageUrl);
    if (signal.aborted) throw makeStepError("edit", true);
    const buffer = await decodeMaskToBuffer(maskUrl, width, height);
    // Pull the selection's edge inward a few px so the composite doesn't leak a
    // material halo where a loose/anti-aliased selection overshot the object.
    const tight = erodeMask(buffer, MASK_ERODE_PX);

    // ZeST-inspired init (texture path only): send Klein the scene with the
    // selected object PRE-TINTED to the swatch's mean color (luma-modulated, so
    // shading survives) — wipes the original color prior AND anchors the hue to
    // the material. Raw (un-eroded) mask on purpose — full coverage of the color
    // prior; the final composite is gated by the eroded mask, so edge tint can
    // never leak out.
    const sceneUrl = textureUrl
      ? await uploadArtifact(
          await tintMaskedRegion(imageUrl, buffer, await meanImageColor(textureUrl)),
        )
      : imageUrl;
    if (signal.aborted) throw makeStepError("edit", true);

    // Full-scene edit (NOT a crop): Kontext keeps the object's 3D form, panels and
    // lighting and applies the swatch as a real material. Cropping to the object
    // invited a flat paste of the swatch (live 2026-07-14). Texture (if any) is the
    // second image the prompt refers to.
    const imageUrls = textureUrl ? [sceneUrl, textureUrl] : [sceneUrl];
    const retexturedUrl = await runKontext(imageUrls, prompt, { signal, onPhase });
    if (signal.aborted) throw makeStepError("edit", true);

    // Keep only the selected region of that edit → strict locality; the rest stays
    // pixel-identical to the working image.
    const finalBlob = await compositeMaskedOverlay(imageUrl, retexturedUrl, tight);
    if (signal.aborted) throw makeStepError("edit", true);
    const finalUrl = await uploadArtifact(finalBlob);
    return { image: finalUrl };
  } catch (err) {
    // Never surface a native fal/canvas error (AD-8) — a retryable edit StepError
    // (runKontext already throws this shape; wrap anything else).
    throw isStepError(err) ? err : makeStepError("edit", true);
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
