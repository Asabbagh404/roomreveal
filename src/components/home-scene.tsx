"use client";

import type { Mode } from "@/state/types";
import { useGeneration } from "@/state/generation-context";

/**
 * Home screen (Story 5.1). Shown while no mode is chosen (`mode === undefined`).
 * Two cards let the user pick their intent: the reveal video Parcours, or the
 * free image editor. Choosing dispatches SELECT_MODE, which starts a clean
 * Generation at the Upload step (reducer). Presentation only (AR-LAYERS): the
 * component reads nothing but dispatch. Dark-only, gold-on-hover ring, no shadows.
 */
export function HomeScene() {
  const { dispatch } = useGeneration();

  return (
    <div className="flex w-full flex-col items-center gap-scene-gap">
      <h1 className="text-display text-texte-principal text-center">
        Que voulez-vous créer&nbsp;?
      </h1>

      <div className="grid w-full max-w-4xl grid-cols-2 gap-4">
        <ModeCard
          mode="reveal"
          title="Une photo. Une pièce qui se meuble toute seule."
          description="Transformez une photo de pièce meublée en vidéo « révélation » cinématique."
          cta="Créer la vidéo révélation"
          onSelect={() => dispatch({ type: "SELECT_MODE", mode: "reveal" })}
        />
        <ModeCard
          mode="edit"
          title="Retouchez librement votre image."
          description="Effacez un objet ou ajoutez-en un en dessinant une zone et en le décrivant."
          cta="Éditer une image"
          onSelect={() => dispatch({ type: "SELECT_MODE", mode: "edit" })}
        />
      </div>
    </div>
  );
}

interface ModeCardProps {
  mode: Mode;
  title: string;
  description: string;
  cta: string;
  onSelect: () => void;
}

/**
 * One home card (DESIGN.md): surface-carte frame, ring bordure→or on hover, no
 * decoration. The whole card is the clickable action; the CTA label names the
 * intent explicitly (UX-DR1/DR4).
 */
function ModeCard({ mode, title, description, cta, onSelect }: ModeCardProps) {
  return (
    <button
      type="button"
      data-mode={mode}
      onClick={onSelect}
      className="group flex cursor-pointer flex-col gap-4 rounded-lg bg-surface-carte p-6 text-left ring-1 ring-bordure transition-colors hover:ring-or-lumineux focus-visible:ring-or-lumineux"
    >
      <span className="text-carton-titre text-texte-principal">{title}</span>
      <span className="flex-1 text-sm text-texte-secondaire">{description}</span>
      <span className="text-carton-titre text-or-lumineux">
        {cta} <span aria-hidden>→</span>
      </span>
    </button>
  );
}
