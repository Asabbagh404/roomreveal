"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGeneration } from "@/state/generation-context";
import { runDetect } from "@/state/effects";

/**
 * Mask step surface. Story 2.1 scope: run detection on entry and display the
 * result as a fuchsia overlay on the canonical photo. Brush/eraser editing is
 * Story 2.2. No category label is ever shown (canonical decision, FR-5/UX-DR7).
 */
export function MaskSurface() {
  const { state, dispatch } = useGeneration();
  const photoUrl = usePhotoObjectUrl(state.originalPhoto?.blob);

  // Live epoch, read by the effect layer to discard superseded results (AD-12).
  // Synced in an effect (never written during render).
  const epochRef = useRef(state.epoch);
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);

  useEffect(() => {
    // Trigger detection once per attempt. Deps deliberately EXCLUDE waitPhase:
    // otherwise onPhase's SET_WAIT_PHASE would re-run this effect and its
    // cleanup would abort the very job that just reported a phase. `error` is a
    // dep so clearing it (retry) re-triggers detection from the kept photo.
    if (state.step !== "mask") return;
    if (state.originalPhoto === undefined) return;
    if (state.maskDraft !== undefined) return; // detection already ran
    if (state.error !== undefined) return; // don't auto-retry a failed attempt

    const startEpoch = state.epoch;
    const controller = new AbortController();
    void runDetect(state, dispatch, {
      signal: controller.signal,
      isStale: () => epochRef.current !== startEpoch,
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.epoch, state.maskDraft, state.error, state.originalPhoto]);

  const detectedMaskUrl = state.maskDraft?.detectedMaskUrl ?? null;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-bordure">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Votre photo" className="block w-full" />
        )}
        {detectedMaskUrl && (
          // Tint the masked (white) areas fuchsia at 45% + a contour glow
          // (UX-DR7). CSS mask-image uses the binary PNG as the alpha source.
          <div
            aria-label="Masque détecté"
            role="img"
            className="pointer-events-none absolute inset-0 bg-masque-overlay opacity-45 [filter:drop-shadow(0_0_1.5px_var(--color-masque-contour))]"
            style={{
              // Quote the URL so signed-URL query chars don't break url().
              maskImage: `url("${detectedMaskUrl}")`,
              WebkitMaskImage: `url("${detectedMaskUrl}")`,
              maskSize: "100% 100%",
              WebkitMaskSize: "100% 100%",
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Turns the canonical photo Blob into a display object URL (revoked on change). */
function usePhotoObjectUrl(blob: Blob | undefined): string | null {
  // Derive during render (no setState in an effect); revoke when it changes.
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}
