import { detect, uploadArtifact } from "@/pipeline";
import type { GenerationAction } from "./reducer";
import { isStepError, makeStepError } from "./step-error";
import type { Generation } from "./types";

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

  try {
    // Upload the canonical photo once per attempt; reuse the memoized URL.
    let photoUrl = photo.falUrl;
    if (photoUrl === undefined) {
      if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
      photoUrl = await uploadArtifact(photo.blob);
      if (dead()) return;
      dispatch({ type: "PHOTO_UPLOADED", falUrl: photoUrl });
    }

    const result = await detect(photoUrl, {
      signal,
      onPhase: (phase) => {
        if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase });
      },
    });
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
