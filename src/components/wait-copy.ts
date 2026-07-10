import type { Step, WaitPhase } from "@/state/types";

/** After this, the wait panel adds a reassuring "taking longer" line (UX-DR11). */
export const LONG_WAIT_MS = 210_000; // 3 min 30 s

/**
 * Translates a (step, phase) pair to French microcopy (AD-14 — this mapping
 * lives only in the wait panel). Labels come from EXPERIENCE.md; no jargon.
 */
export function waitPhaseLabel(step: Step, phase: WaitPhase): string {
  if (phase === "uploading") return "Envoi de vos images";
  if (phase === "finalizing") return "Finalisation";

  // queued / generating: the active work, named per step.
  switch (step) {
    case "mask":
      return "Détection des meubles…";
    case "emptyRoom":
      return "Génération de la Pièce vide…";
    case "video":
      return "Génération de la Révélation";
    default:
      return "Préparation en cours…";
  }
}
