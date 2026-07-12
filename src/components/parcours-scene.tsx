"use client";

import { useEffect } from "react";
import { useGeneration } from "@/state/generation-context";
import { UploadZone } from "@/components/upload-zone";
import { MaskSurface } from "@/components/mask-surface";
import { EmptyRoomSurface } from "@/components/empty-room-surface";
import { VideoSurface } from "@/components/video-surface";
import { WaitPanel } from "@/components/wait-panel";
import { ErrorBanner } from "@/components/error-banner";

/**
 * Renders the scene for the current Parcours step, plus the transverse overlays
 * (wait panel, error banner) that every step inherits. All four surfaces (Upload
 * / Masque / Pièce vide / Vidéo) are implemented. The overlays activate once
 * effects set waitPhase / error.
 */
export function ParcoursScene() {
  const { state, dispatch } = useGeneration();

  // Warn before a refresh/close discards an in-progress Generation (UX-DR15, no
  // resume in v1, AD-3). Only while past Upload; the custom text is ignored by
  // modern browsers (they show a generic prompt) but returnValue must be set.
  const generationInProgress = state.step !== "upload";
  useEffect(() => {
    if (!generationInProgress) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "Votre Génération en cours sera perdue.";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [generationInProgress]);

  // An error ends any wait (the reducer clears waitPhase on SET_ERROR); render
  // one transverse overlay at a time, error taking precedence.
  const overlay =
    state.error !== undefined ? (
      <ErrorBanner
        message={state.error.userMessage}
        variant="error"
        step={state.error.step}
        onRetry={() => dispatch({ type: "CLEAR_ERROR" })}
      />
    ) : state.waitPhase !== undefined ? (
      // key={epoch} remounts the panel per attempt so the elapsed timer resets.
      <WaitPanel key={state.epoch} />
    ) : null;

  return (
    <section className="relative flex h-full flex-col items-center justify-center gap-scene-gap">
      <StepSurface />

      {/* Transverse overlay floats above the scene so acquired artifacts stay
          visible behind it (AC3). */}
      {overlay !== null && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6">
          {overlay}
        </div>
      )}
    </section>
  );
}

function StepSurface() {
  const { state } = useGeneration();

  if (state.step === "upload") {
    return (
      <>
        <h1 className="text-display text-texte-principal">
          Une photo. Une pièce qui se meuble toute seule.
        </h1>
        <UploadZone />
      </>
    );
  }

  if (state.step === "mask") {
    return <MaskSurface />;
  }

  if (state.step === "emptyRoom") {
    return <EmptyRoomSurface />;
  }

  return <VideoSurface />;
}
