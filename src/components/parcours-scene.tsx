"use client";

import { useGeneration } from "@/state/generation-context";
import { UploadZone } from "@/components/upload-zone";
import { WaitPanel } from "@/components/wait-panel";
import { ErrorBanner } from "@/components/error-banner";

/**
 * Renders the scene for the current Parcours step, plus the transverse overlays
 * (wait panel, error banner) that every step inherits. Only the Upload step is
 * implemented in Epic 1; Masque / Pièce vide / Vidéo surfaces arrive with their
 * epics. The overlays activate once effects set waitPhase / error (Epic 2+).
 */
export function ParcoursScene() {
  const { state, dispatch } = useGeneration();

  return (
    <section className="flex h-full flex-col items-center justify-center gap-scene-gap">
      <StepSurface />

      {/* Transverse overlays — artifacts stay visible behind them (AC3). */}
      {/* key={epoch} remounts the panel per attempt so the elapsed timer resets. */}
      {state.waitPhase !== undefined && <WaitPanel key={state.epoch} />}
      {state.error !== undefined && (
        <ErrorBanner
          message={state.error.userMessage}
          variant="error"
          step={state.error.step}
          onRetry={() => dispatch({ type: "CLEAR_ERROR" })}
        />
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

  return (
    <p className="text-attente text-texte-secondaire">
      Cette étape arrive bientôt.
    </p>
  );
}
