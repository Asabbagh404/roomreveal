"use client";

import { useEffect, useRef } from "react";
import { useGeneration } from "@/state/generation-context";
import { runInpaint } from "@/state/effects";

/**
 * Pièce vide step (Story 3.1): on entry, runs the inpaint adapter on the
 * canonical photo + validated mask and shows the generated empty room. The
 * effect layer owns the pipeline call (AR-LAYERS) — this component only
 * dispatches the intent by mounting. The transverse overlays (WaitPanel while
 * generating, ErrorBanner on failure) are rendered by ParcoursScene, not here.
 *
 * The side-by-side comparison and the "Créer ma vidéo" action arrive in Story
 * 3.2; régénération in Story 3.3.
 */
export function EmptyRoomSurface() {
  const { state, dispatch } = useGeneration();

  // Live epoch for the effect layer to discard superseded results (AD-12).
  const epochRef = useRef(state.epoch);
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);

  // ---- Inpaint on entry. Runs once per attempt: the guards on emptyRoom and
  // error stop it re-firing. A retry (ErrorBanner → CLEAR_ERROR) clears `error`,
  // which re-satisfies the guard and re-triggers the run. Deps EXCLUDE waitPhase
  // to avoid the abort loop (same reasoning as the detection effect in 2.1). ----
  useEffect(() => {
    if (state.step !== "emptyRoom") return;
    if (state.mask === undefined) return;
    if (state.emptyRoom !== undefined) return;
    if (state.error !== undefined) return;

    const startEpoch = state.epoch;
    const controller = new AbortController();
    void runInpaint(state, dispatch, {
      signal: controller.signal,
      isStale: () => epochRef.current !== startEpoch,
    });
    // Back-nav / unmount aborts the run → its result is dropped (dead()).
    return () => controller.abort();
    // `state.originalPhoto` is deliberately NOT a dep: runInpaint dispatches
    // PHOTO_UPLOADED mid-flight, which replaces originalPhoto immutably — a dep
    // on it would re-run this effect, abort the live run, and re-trigger inpaint
    // (the abort loop Story 2.1 fixed). The photo can only change otherwise via
    // PHOTO_NORMALIZED, which bumps epoch and moves to the mask step, both of
    // which ARE deps — so no real change is missed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.epoch, state.mask, state.emptyRoom, state.error]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-bordure">
        {state.emptyRoom !== undefined ? (
          // h-auto (not h-full): the container has no explicit height, so the
          // image drives it at its natural aspect ratio — h-full would collapse
          // to zero height and hide the result.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.emptyRoom}
            alt="Pièce vide"
            className="block h-auto w-full select-none"
            draggable={false}
          />
        ) : (
          // Placeholder while the generation is in flight — the WaitPanel overlay
          // (ParcoursScene) carries the named phase; this keeps the frame stable.
          <div className="aspect-[4/3] w-full bg-surface-elevee" aria-hidden />
        )}
      </div>
    </div>
  );
}
