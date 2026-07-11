import { detect, uploadArtifact } from "@/pipeline";
import type { GenerationAction } from "./reducer";
import type { Generation, StepError } from "./types";

type Dispatch = (action: GenerationAction) => void;

export interface RunContext {
  /** Aborts the in-flight adapter when the attempt is superseded (AD-12). */
  signal: AbortSignal;
  /**
   * True once the epoch this run started under is no longer current (an
   * invalidation happened, AD-11) — the caller reads the live epoch. A stale
   * result is dropped without dispatch.
   */
  isStale: () => boolean;
}

const DETECT_FALLBACK_ERROR: StepError = {
  step: "detect",
  retryable: true,
  userMessage:
    "La détection des meubles n'a pas abouti. Votre photo est conservée — relancez quand vous voulez.",
};

function isStepError(err: unknown): err is StepError {
  return (
    typeof err === "object" &&
    err !== null &&
    "userMessage" in err &&
    "step" in err
  );
}

/**
 * The single effecting layer (AD-12): the only place that calls pipeline
 * adapters. Each run is stamped with the epoch it started under; if `isStale()`
 * turns true by the time a result arrives, it is dropped without dispatch.
 * Adapters receive an AbortSignal so a superseded job stops having observable
 * effects. The reducer stays pure; all async orchestration lives here.
 */
export async function runDetect(
  state: Generation,
  dispatch: Dispatch,
  { signal, isStale }: RunContext,
): Promise<void> {
  const photo = state.originalPhoto;
  if (photo === undefined) return;

  try {
    // Upload the canonical photo once per attempt; reuse the memoized URL.
    let photoUrl = photo.falUrl;
    if (photoUrl === undefined) {
      photoUrl = await uploadArtifact(photo.blob);
      if (isStale()) return;
      dispatch({ type: "PHOTO_UPLOADED", falUrl: photoUrl });
    }

    const result = await detect(photoUrl, {
      signal,
      onPhase: (phase) => {
        if (!isStale()) dispatch({ type: "SET_WAIT_PHASE", phase });
      },
    });
    if (isStale()) return; // a newer attempt superseded this one

    dispatch({ type: "DETECT_SUCCEEDED", detectedMaskUrl: result.initialMask });
  } catch (err) {
    if (isStale()) return;
    dispatch({
      type: "SET_ERROR",
      error: isStepError(err) ? err : DETECT_FALLBACK_ERROR,
    });
  }
}
