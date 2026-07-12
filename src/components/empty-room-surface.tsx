"use client";

import { useEffect, useRef } from "react";
import { useGeneration } from "@/state/generation-context";
import { runInpaint } from "@/state/effects";
import { usePhotoObjectUrl } from "@/components/use-photo-object-url";
import { GenerationButton } from "@/components/generation-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Pièce vide step. On entry runs the inpaint adapter (Story 3.1); once the empty
 * room exists it shows the side-by-side comparison — « Photo originale » vs
 * « Pièce vide » — so the user can judge that no furniture remains, then the gold
 * « Créer ma vidéo » action advances to the Vidéo step (Story 3.2, FR-8/UX-DR9).
 * The effect layer owns the pipeline call (AR-LAYERS); this component only reads
 * state and dispatches intents. WaitPanel/ErrorBanner overlays live in
 * ParcoursScene. Régénération arrives in Story 3.3.
 */
export function EmptyRoomSurface() {
  const { state, dispatch } = useGeneration();
  // The "Photo originale" card shows the canonical photo (AD-1/AD-2).
  const photoUrl = usePhotoObjectUrl(state.originalPhoto?.blob);

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

  // Both cards or neither (UX-DR9): render the comparison only once the empty
  // room exists AND the original photo's object URL is ready.
  const ready = state.emptyRoom !== undefined && photoUrl !== null;

  if (!ready) {
    // Placeholder while the generation is in flight — the WaitPanel overlay
    // (ParcoursScene) carries the named phase; this keeps the frame stable.
    return (
      <div className="flex w-full flex-col items-center gap-6">
        <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-bordure">
          <div className="aspect-[4/3] w-full bg-surface-elevee" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="grid w-full max-w-4xl grid-cols-2 gap-4">
        <ComparisonCard label="Photo originale" src={photoUrl} />
        <ComparisonCard label="Pièce vide" src={state.emptyRoom!} />
      </div>

      <div className="flex flex-col items-center gap-3">
        {/* Gold action stays the single primary (UX-DR13). */}
        <GenerationButton
          subtext="1 à 3 minutes de génération"
          onClick={() => {
            // Guard against a double-click (each dispatch would bump the epoch):
            // only advance while still on this step. CONFIRM_ADVANCE_FROM's `step`
            // is the DESTINATION (here "video"), not the source — see reducer.
            if (state.step === "emptyRoom") {
              dispatch({ type: "CONFIRM_ADVANCE_FROM", step: "video" });
            }
          }}
        >
          Créer ma vidéo
        </GenerationButton>

        {/* Secondary action: re-run inpaint with the SAME validated mask (FR-9).
            Just dispatch — the entry effect re-fires runInpaint once emptyRoom is
            cleared (AR-LAYERS). No limit in v1. */}
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "REGENERATE_EMPTY_ROOM" })}
        >
          Régénérer
        </Button>
        <p className="text-sm text-texte-secondaire">
          Un doute ? Régénérez : chaque Pièce vide est unique.
        </p>
      </div>
    </div>
  );
}

/**
 * One comparison card (DESIGN.md#Cartes de comparaison): image on a surface-carte
 * frame, `carton-titre` caption below, no decoration. Clicking opens the image
 * full-screen in a Dialog for detailed inspection (UX-DR9).
 */
function ComparisonCard({ label, src }: { label: string; src: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group flex cursor-pointer flex-col gap-2 text-left"
        >
          <figure className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-lg bg-surface-carte ring-1 ring-bordure transition-colors group-hover:ring-or-lumineux">
              {/* Decorative here: the visible figcaption already names the card,
                  so an alt would double-announce on the button (a11y). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="block h-auto w-full select-none"
                draggable={false}
              />
            </div>
            <figcaption className="text-carton-titre text-texte-secondaire">
              {label}
            </figcaption>
          </figure>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[92vw] bg-surface-carte p-2 sm:max-w-[92vw]">
        {/* Required by radix for a11y; the caption is already visible on the card. */}
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="mx-auto max-h-[85vh] w-auto object-contain"
          draggable={false}
        />
      </DialogContent>
    </Dialog>
  );
}
