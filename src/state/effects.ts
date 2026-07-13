import { DETECT_BACKEND, autoEmptyRoom, buildModifyPrompt, detect, detectLocal, editAdd, editModify, editRemove, findTexture, inpaint, pointSegment, pointSegmentLocal, resolveTextureUrl, uploadArtifact, video } from "@/pipeline";
import type { EditResult } from "@/pipeline";
import { encodeMaskPng } from "@/lib/mask-encode";
import { isBufferEmpty } from "@/lib/mask-buffer";
import { decodeMaskToBuffer } from "@/lib/mask-decode";
// Box-select adapters (Story 5.7) imported separately to avoid touching the busy
// primary @/pipeline import line above.
import { boxSegment, boxSegmentLocal } from "@/pipeline";
import type { SelectRegion } from "@/lib/mask-buffer";
import type { GenerationAction } from "./reducer";
import { isStepError, makeStepError } from "./step-error";
import type { Generation, WaitPhase } from "./types";

type Dispatch = (action: GenerationAction) => void;

export interface RunContext {
  /** Aborts the in-flight adapter when the attempt is superseded (AD-12). */
  signal: AbortSignal;
  /**
   * True once the epoch this run started under is no longer current (an
   * invalidation happened, AD-11) — the caller reads the live epoch.
   */
  isStale: () => boolean;
}

/**
 * The single effecting layer (AD-12): the only place that calls pipeline
 * adapters. A result is dropped without dispatch once the run is "dead" —
 * either the epoch moved on (isStale) or the signal was aborted (e.g. the
 * component unmounted / a newer run superseded it). Aborting alone does not
 * bump the epoch, so both checks are needed. The reducer stays pure.
 */
export async function runDetect(
  state: Generation,
  dispatch: Dispatch,
  { signal, isStale }: RunContext,
): Promise<void> {
  const photo = state.originalPhoto;
  if (photo === undefined) return;

  const dead = () => signal.aborted || isStale();
  const onPhase = (phase: WaitPhase) => {
    if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase });
  };

  try {
    let result;
    if (DETECT_BACKEND === "local") {
      // Local Grounded-SAM: no fal upload — POST the detection blob straight to
      // the self-hosted service, which loops over all concepts and unions the
      // masks for free (detect-local.ts).
      result = await detectLocal(photo.detectionBlob, { signal, onPhase });
    } else {
      // Detection runs on the higher-res copy (AD-2 amendment); upload it once
      // per attempt and reuse the memoized URL. The canonical photo is uploaded
      // later, when inpaint needs it (Epic 3).
      let detectionUrl = photo.detectionFalUrl;
      if (detectionUrl === undefined) {
        if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
        detectionUrl = await uploadArtifact(photo.detectionBlob);
        if (dead()) return;
        dispatch({ type: "DETECTION_UPLOADED", falUrl: detectionUrl });
      }
      result = await detect(detectionUrl, { signal, onPhase });
    }
    if (dead()) return; // superseded or cancelled — drop the result

    dispatch({ type: "DETECT_SUCCEEDED", detectedMaskUrl: result.initialMask });
  } catch (err) {
    if (dead()) return; // a cancelled/superseded run must not paint an error
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : makeStepError("detect", true),
    });
  }
}

/**
 * Generates the Pièce vide (AD-12): runs the inpaint adapter on the canonical
 * photo + validated mask and stores the result URL (INPAINT_SUCCEEDED). The
 * canonical photo is uploaded here, lazily — detection only uploaded the
 * higher-res copy (AD-2 amendment) — and its fal URL is memoized (PHOTO_UPLOADED)
 * so a régénération (Story 3.3) reuses it. A result is dropped without dispatch
 * once the run is dead (epoch moved on or signal aborted). Failures become a
 * retryable SET_ERROR (AD-8), unlike runValidateMask which throws. AR-LAYERS:
 * the pipeline calls live here, never in the component.
 */
export async function runInpaint(
  state: Generation,
  dispatch: Dispatch,
  { signal, isStale }: RunContext,
): Promise<void> {
  const photo = state.originalPhoto;
  const maskUrl = state.mask;
  if (photo === undefined || maskUrl === undefined) return;

  const dead = () => signal.aborted || isStale();
  const onPhase = (phase: WaitPhase) => {
    if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase });
  };

  try {
    // Upload the canonical photo once per attempt (≤1024, AD-2) and reuse the
    // memoized URL. NOT the detection copy — flux fill requires image and mask to
    // share dimensions, and the mask is at canonical dims (AD-7).
    let photoUrl = photo.falUrl;
    if (photoUrl === undefined) {
      if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
      photoUrl = await uploadArtifact(photo.blob);
      if (dead()) return;
      dispatch({ type: "PHOTO_UPLOADED", falUrl: photoUrl });
    }

    const result = await inpaint(photoUrl, maskUrl, { signal, onPhase });
    if (dead()) return; // superseded or cancelled — drop the result

    dispatch({ type: "INPAINT_SUCCEEDED", emptyRoomUrl: result.emptyRoom });
  } catch (err) {
    if (dead()) return; // a cancelled/superseded run must not paint an error
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : makeStepError("inpaint", true),
    });
  }
}

/**
 * Generates the Pièce vide the MASKLESS way (Story 3.4, AD-12): the user chose
 * « Vider automatiquement », so there's no mask — run the instruction-edit model
 * on the canonical photo to remove all furniture in one shot. Same shape as
 * runInpaint (lazy canonical-photo upload + dead() guards) and reuses
 * INPAINT_SUCCEEDED, so the Pièce vide surface / reducer are unchanged. AR-LAYERS.
 */
export async function runAutoEmptyRoom(
  state: Generation,
  dispatch: Dispatch,
  { signal, isStale }: RunContext,
): Promise<void> {
  const photo = state.originalPhoto;
  if (photo === undefined) return;

  const dead = () => signal.aborted || isStale();
  const onPhase = (phase: WaitPhase) => {
    if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase });
  };

  try {
    let photoUrl = photo.falUrl;
    if (photoUrl === undefined) {
      if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
      photoUrl = await uploadArtifact(photo.blob);
      if (dead()) return;
      dispatch({ type: "PHOTO_UPLOADED", falUrl: photoUrl });
    }

    const result = await autoEmptyRoom(photoUrl, { signal, onPhase });
    if (dead()) return; // superseded or cancelled — drop the result

    dispatch({ type: "INPAINT_SUCCEEDED", emptyRoomUrl: result.emptyRoom });
  } catch (err) {
    if (dead()) return;
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : makeStepError("inpaint", true),
    });
  }
}

/**
 * Applies one free-edit retouch (AD-12, Story 5.3): encodes the drawn mask and
 * erases (operation "remove", bria eraser) the masked region of the current work
 * image, then stores the result as the new work image (EDIT_APPLIED). The work
 * image is uploaded lazily on the first retouch (blob → EDIT_BASE_UPLOADED); a
 * subsequent retouch reuses the fal URL of the previous result directly — no
 * re-upload. A result is dropped without dispatch once the run is dead (epoch
 * bumped by EDIT_APPLIED or signal aborted). Failures become a retryable
 * SET_ERROR of step "edit" (AD-8) — retry is a fresh « Appliquer » click, not an
 * entry effect. AR-LAYERS: the pipeline call lives here. "add" (Story 5.4) routes
 * to editAdd (flux fill) with the text prompt; "remove" to editRemove (bria);
 * "modify" (texture bank) to editModify (flux-general) with a resolved texture URL
 * and/or a composed recolor prompt.
 */
export async function runEdit(
  state: Generation,
  dispatch: Dispatch,
  // "remove" → bria eraser (Story 5.3); "add" → flux fill with `prompt` (Story
  // 5.4); "modify" → flux-general with a texture reference and/or instruction.
  {
    operation,
    prompt,
    textureId,
    instruction,
    signal,
    isStale,
  }: RunContext & {
    operation: "remove" | "add" | "modify";
    prompt?: string;
    textureId?: string;
    instruction?: string;
  },
): Promise<void> {
  const editBase = state.editBase;
  const buffer = state.maskDraft?.buffer;
  if (editBase === undefined || buffer === undefined || isBufferEmpty(buffer)) {
    return;
  }
  // Add requires a non-empty description of the object to generate.
  const trimmedPrompt = prompt?.trim() ?? "";
  if (operation === "add" && trimmedPrompt === "") return;
  // Modify requires at least a texture OR a free-text instruction to act on.
  const trimmedInstruction = instruction?.trim() ?? "";
  if (operation === "modify" && textureId === undefined && trimmedInstruction === "") {
    return;
  }

  const dead = () => signal.aborted || isStale();
  const onPhase = (phase: WaitPhase) => {
    if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase });
  };

  try {
    // Upload the work image once, lazily. First retouch: the uploaded blob.
    // Later retouches: editBase.url is the previous fal result — reused as-is.
    let imageUrl = editBase.url;
    if (imageUrl === undefined) {
      if (editBase.blob === undefined) return; // nothing to upload/edit
      if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
      imageUrl = await uploadArtifact(editBase.blob);
      if (dead()) return;
      dispatch({ type: "EDIT_BASE_UPLOADED", url: imageUrl });
    }

    // Encode + upload the verbatim binary mask (AD-7), fresh each retouch.
    const png = await encodeMaskPng(buffer);
    if (dead()) return;
    const maskUrl = await uploadArtifact(png);
    if (dead()) return;

    let result: EditResult;
    if (operation === "add") {
      result = await editAdd(imageUrl, maskUrl, trimmedPrompt, { signal, onPhase });
    } else if (operation === "modify") {
      // Resolve the chosen texture (if any) to a fal URL — the static texture is
      // uploaded at most once/session (memoized). Seed the "uploading" phase so
      // the WaitPanel shows during the round-trip, mirroring the lazy image
      // upload above.
      let textureUrl: string | undefined;
      if (textureId !== undefined) {
        if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
        textureUrl = await resolveTextureUrl(textureId);
        if (dead()) return;
      }
      const composed = buildModifyPrompt(
        textureId !== undefined ? findTexture(textureId)?.prompt : undefined,
        trimmedInstruction,
      );
      result = await editModify(imageUrl, maskUrl, { textureUrl, prompt: composed }, { signal, onPhase });
    } else {
      result = await editRemove(imageUrl, maskUrl, { signal, onPhase });
    }
    if (dead()) return; // superseded or cancelled — drop the result

    dispatch({ type: "EDIT_APPLIED", image: result.image });
  } catch (err) {
    if (dead()) return; // a cancelled/superseded run must not paint an error
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : makeStepError("edit", true),
    });
  }
}

/**
 * Segments an object and unions it into the draft mask (Story 5.6/5.7, AD-12).
 * The `region` is either a `point` (SAM point-prompt → the salient object, often
 * a sub-part) or a `box` drag (→ the whole object enclosed, the "select the
 * cabinet not the drawer" fix). Routed to `pointSegment`/`boxSegment` (fal) or
 * their `*Local` variants (DETECT_BACKEND === "local") on the current work image,
 * then decodes the returned mask to a canonical binary buffer and dispatches
 * UNION_MASK_BUFFER so the reducer ORs it into the LIVE draft (successive
 * selections accumulate; a concurrent brush stroke is not clobbered). Only the
 * canvas decode lives here; the union runs in the pure reducer (AD-3).
 * Deliberately does NOT touch waitPhase: the editor shows its own inline pulse
 * loader, not the full-screen WaitPanel. Lazy work-image upload mirrors runEdit.
 * A result is dropped once the run is dead (aborted/stale). Failure → retryable
 * SET_ERROR("pointSegment") (AD-8). AR-LAYERS.
 */
export async function runPointSegment(
  state: Generation,
  dispatch: Dispatch,
  { region, signal, isStale }: RunContext & { region: SelectRegion },
): Promise<void> {
  const editBase = state.editBase;
  if (editBase === undefined) return;
  const width = editBase.width;
  const height = editBase.height;
  if (width === undefined || height === undefined) return; // dims not measured

  const dead = () => signal.aborted || isStale();
  // Point-segment feedback is the editor's inline pulse, so phases are ignored
  // here (no SET_WAIT_PHASE → the full-screen WaitPanel never shows).
  const onPhase = () => {};

  try {
    let result;
    if (DETECT_BACKEND === "local") {
      // The local service needs the image bytes. Use the uploaded blob, or fetch
      // the previous result URL back into a blob when the blob is gone.
      let blob = editBase.blob;
      if (blob === undefined) {
        if (editBase.url === undefined) return;
        // Thread the signal so an abort mid-fetch doesn't leave the download
        // running past cancellation (parity with the local adapters).
        blob = await (await fetch(editBase.url, { signal })).blob();
        if (dead()) return;
      }
      result =
        region.kind === "box"
          ? await boxSegmentLocal(blob, region, { signal, onPhase })
          : await pointSegmentLocal(blob, region, { signal, onPhase });
    } else {
      // fal needs a fal URL — upload the work image once, lazily (like runEdit).
      let imageUrl = editBase.url;
      if (imageUrl === undefined) {
        if (editBase.blob === undefined) return;
        imageUrl = await uploadArtifact(editBase.blob);
        if (dead()) return;
        dispatch({ type: "EDIT_BASE_UPLOADED", url: imageUrl });
      }
      result =
        region.kind === "box"
          ? await boxSegment(imageUrl, region, { signal, onPhase })
          : await pointSegment(imageUrl, region, { signal, onPhase });
    }
    if (dead()) return; // superseded or cancelled — drop the result

    const decoded = await decodeMaskToBuffer(result.mask, width, height);
    if (dead()) return;
    // Union in the reducer (against the LIVE buffer), not here: a brush stroke
    // committed during the segmentation must not be clobbered by a stale union.
    dispatch({ type: "UNION_MASK_BUFFER", buffer: decoded });
  } catch (err) {
    if (dead()) return; // a cancelled/superseded run must not paint an error
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : makeStepError("pointSegment", true),
    });
  }
}

/**
 * Generates the Révélation (AD-12): runs the FLF video adapter on the empty room
 * (first frame) + canonical photo (last frame) and stores the MP4 URL
 * (VIDEO_SUCCEEDED). Both inputs are already fal URLs — emptyRoom is the inpaint
 * output, and the photo's fal URL was memoized when inpaint uploaded it (Story
 * 3.1); the lazy upload here is only a safety net. A result is dropped without
 * dispatch once the run is dead (epoch moved on — e.g. a Pièce vide regeneration,
 * Story 3.3 — or signal aborted). Failures become a retryable SET_ERROR (AD-8).
 * AR-LAYERS: the pipeline call lives here, never in the component.
 */
export async function runVideo(
  state: Generation,
  dispatch: Dispatch,
  { signal, isStale }: RunContext,
): Promise<void> {
  const photo = state.originalPhoto;
  const emptyRoomUrl = state.emptyRoom;
  if (photo === undefined || emptyRoomUrl === undefined) return;

  const dead = () => signal.aborted || isStale();
  const onPhase = (phase: WaitPhase) => {
    if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase });
  };

  try {
    // The canonical photo is normally already on fal (uploaded during inpaint);
    // upload lazily as a safety net if not, and memoize it (PHOTO_UPLOADED).
    let photoUrl = photo.falUrl;
    if (photoUrl === undefined) {
      if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
      photoUrl = await uploadArtifact(photo.blob);
      if (dead()) return;
      dispatch({ type: "PHOTO_UPLOADED", falUrl: photoUrl });
    }

    // Seed a phase immediately so the WaitPanel (+ elapsed timer + "1 à 3
    // minutes") appears at once, without the mute gap before fal's first queue
    // callback — the video job is long (UX-DR11: no silent spinner). Monotonicity
    // (AD-14) accepts the real queued/generating/finalizing that follow.
    if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "queued" });

    const result = await video(emptyRoomUrl, photoUrl, { signal, onPhase });
    if (dead()) return; // superseded or cancelled — drop the result

    dispatch({ type: "VIDEO_SUCCEEDED", revealUrl: result.reveal });
  } catch (err) {
    if (dead()) return; // a cancelled/superseded run must not paint an error
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : makeStepError("video", true),
    });
  }
}

/**
 * Validates the mask draft (AD-13): encode the binary buffer to the verbatim PNG
 * (AD-7), upload it, and store the URL in generation.mask while advancing to
 * Pièce vide (MASK_VALIDATED). User-initiated (button), so errors are surfaced
 * inline by the caller — this THROWS instead of dispatching SET_ERROR, because a
 * mask-upload failure is outside the detect/inpaint/video StepError taxonomy.
 * Only dispatches when the run is still live (AD-12). AR-LAYERS: the pipeline
 * call lives here, never in the component.
 */
export async function runValidateMask(
  state: Generation,
  dispatch: Dispatch,
  { signal, isStale }: RunContext,
): Promise<void> {
  const buffer = state.maskDraft?.buffer;
  if (buffer === undefined || isBufferEmpty(buffer)) return; // guarded by the UI too
  const dead = () => signal.aborted || isStale();

  const png = await encodeMaskPng(buffer);
  if (dead()) return; // navigated away during encode — skip the upload round-trip
  const maskUrl = await uploadArtifact(png);
  if (dead()) return; // navigated away / superseded — don't force the advance
  dispatch({ type: "MASK_VALIDATED", maskUrl });
}
