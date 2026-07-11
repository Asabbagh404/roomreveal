import { DETECT_BACKEND, detect, detectLocal, uploadArtifact } from "@/pipeline";
import { encodeMaskPng } from "@/lib/mask-encode";
import { isBufferEmpty } from "@/lib/mask-buffer";
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
