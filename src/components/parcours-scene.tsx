"use client";

import { useGeneration } from "@/state/generation-context";
import { UploadZone } from "@/components/upload-zone";

/**
 * Renders the scene for the current Parcours step. Only the Upload step is
 * implemented in Epic 1; Masque / Pièce vide / Vidéo surfaces arrive with their
 * epics and show a placeholder for now.
 */
export function ParcoursScene() {
  const { state } = useGeneration();

  if (state.step === "upload") {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-scene-gap">
        <h1 className="text-display text-texte-principal">
          Une photo. Une pièce qui se meuble toute seule.
        </h1>
        <UploadZone />
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col items-center justify-center">
      <p className="text-attente text-texte-secondaire">
        Cette étape arrive bientôt.
      </p>
    </section>
  );
}
