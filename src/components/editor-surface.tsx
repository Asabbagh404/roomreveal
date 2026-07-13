"use client";

/**
 * Edit-mode editor surface — PLACEHOLDER (Story 5.1).
 *
 * Story 5.1 only lays the mode groundwork: choosing « Éditer une image » and
 * uploading a photo lands here (step "editor"). The real iterative editor
 * (MaskCanvas + Enlever/Ajouter) is built in Stories 5.2–5.4, which replace this
 * component. Kept intentionally minimal — do not build editor logic here.
 */
export function EditorSurface() {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="w-full max-w-3xl rounded-lg border border-bordure bg-surface-carte p-10 text-center">
        <p className="text-carton-titre text-texte-principal">
          Éditeur d&apos;image
        </p>
        <p className="mt-2 text-sm text-texte-secondaire">
          L&apos;éditeur arrive à l&apos;étape suivante.
        </p>
      </div>
    </div>
  );
}
