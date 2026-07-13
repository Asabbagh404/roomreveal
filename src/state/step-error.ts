import type { PipelineStep, StepError } from "./types";

/**
 * Single source for building and recognising StepError (AD-8). Both the
 * pipeline adapters (which produce errors) and the effect layer (which routes
 * them) use these, so the shape and the French messages never drift.
 */

const STEP_MESSAGES: Record<PipelineStep, string> = {
  detect:
    "La détection des meubles n'a pas abouti. Votre photo est conservée — relancez quand vous voulez.",
  inpaint:
    "La pièce vide n'a pas abouti. Votre Masque est conservé — relancez quand vous voulez.",
  video:
    "La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez.",
  edit:
    "La retouche n'a pas abouti. Votre image est conservée — réessayez quand vous voulez.",
};

export function makeStepError(
  step: PipelineStep,
  retryable = true,
): StepError {
  return { step, retryable, userMessage: STEP_MESSAGES[step] };
}

export function isStepError(err: unknown): err is StepError {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;
  return (
    typeof e.userMessage === "string" &&
    (e.step === "detect" ||
      e.step === "inpaint" ||
      e.step === "video" ||
      e.step === "edit") &&
    typeof e.retryable === "boolean"
  );
}
