"use client";

import { useEffect, useRef } from "react";
import { useGeneration } from "@/state/generation-context";
import { runVideo } from "@/state/effects";
import { RevealPlayer } from "@/components/reveal-player";

/**
 * Vidéo step (Story 4.1). On entry, runs the FLF video adapter on the empty room
 * (first frame) + canonical photo (last frame) and shows the generated
 * Révélation. The effect layer owns the pipeline call (AR-LAYERS); this component
 * only dispatches the intent by mounting. WaitPanel (while generating) and
 * ErrorBanner (on failure) overlays live in ParcoursScene.
 *
 * The polished player — autoplay, gold glow, play/pause, Space, no confetti —
 * arrives in Story 4.2; here the result is shown with a minimal <video controls>.
 */
export function VideoSurface() {
  const { state, dispatch } = useGeneration();

  // Live epoch for the effect layer to discard superseded results (AD-12) — e.g.
  // a Pièce vide regeneration (Story 3.3) bumps the epoch and must abort this run.
  const epochRef = useRef(state.epoch);
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);

  // ---- FLF generation on entry. Runs once per attempt: the guards on reveal and
  // error stop it re-firing. A retry (ErrorBanner → CLEAR_ERROR) clears `error`,
  // re-satisfying the guard. Deps EXCLUDE waitPhase to avoid the abort loop
  // (same reasoning as the detection/inpaint effects in 2.1/3.1). ----
  useEffect(() => {
    if (state.step !== "video") return;
    if (state.emptyRoom === undefined) return;
    if (state.reveal !== undefined) return;
    if (state.error !== undefined) return;

    const startEpoch = state.epoch;
    const controller = new AbortController();
    void runVideo(state, dispatch, {
      signal: controller.signal,
      isStale: () => epochRef.current !== startEpoch,
    });
    // Back-nav / unmount aborts the run → its result is dropped (dead()).
    return () => controller.abort();
    // `state.originalPhoto` is deliberately NOT a dep: runVideo may dispatch
    // PHOTO_UPLOADED (safety-net upload), which replaces originalPhoto immutably —
    // a dep on it would re-run this effect and abort the live run (the abort loop
    // Story 2.1 fixed). originalPhoto only otherwise changes via PHOTO_NORMALIZED,
    // which bumps epoch and moves to the mask step, both of which ARE deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.epoch, state.emptyRoom, state.reveal, state.error]);

  // Once the Révélation exists, the polished Lecteur (Story 4.2) owns its own
  // framed, glowing surface (autoplay + gold halo + sober controls).
  if (state.reveal !== undefined) {
    return (
      <div className="flex w-full flex-col items-center gap-6">
        {/* key on the URL: a new Révélation (e.g. Nouvelle Génération, Story 4.4)
            forces a clean remount — fresh autoplay + gold glow + play state. */}
        <RevealPlayer key={state.reveal} src={state.reveal} />
      </div>
    );
  }

  // Placeholder while the FLF generation is in flight, framed at the canonical
  // photo ratio (AR-PIXELS) so there's no layout jump when the MP4 arrives. The
  // WaitPanel overlay (ParcoursScene) carries the named phase + elapsed time.
  const w = state.originalPhoto?.width ?? 0;
  const h = state.originalPhoto?.height ?? 0;
  const aspectRatio = w > 0 && h > 0 ? `${w} / ${h}` : "4 / 3";

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg border border-bordure bg-surface-elevee"
        style={{ aspectRatio }}
        aria-hidden
      />
    </div>
  );
}
