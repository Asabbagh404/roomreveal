"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineStep } from "@/state/types";

/** French retry label per pipeline step (glossary; no jargon). */
const RETRY_LABEL: Record<PipelineStep, string> = {
  detect: "Relancer la détection",
  inpaint: "Relancer la pièce vide",
  video: "Relancer la vidéo",
  edit: "Réessayer la retouche",
  pointSegment: "Réessayer la sélection",
};

/**
 * Discriminated union: the error variant MUST carry the step + retry handler
 * (AD-8 mandates a single retry action), so an action-less error banner cannot
 * be constructed. The neutral variant carries neither.
 */
type ErrorBannerProps =
  | {
      variant: "error";
      /** French user message (AD-8 userMessage). */
      message: string;
      /** Pipeline step to retry — drives the single action label. */
      step: PipelineStep;
      /** Retry handler. Real re-run lives in effects.ts (Epic 2+). */
      onRetry: () => void;
    }
  | {
      variant: "neutral";
      /** Informational line ("aucun meuble détecté", FR-16). */
      message: string;
      step?: never;
      onRetry?: never;
    };

/**
 * Bandeau d'erreur (UX-DR12). Renders a single French message and, for real
 * errors, exactly one action: retry the affected step. Never a technical trace.
 * The "aucun meuble détecté" case is a neutral variant, not an error (FR-16,
 * Story 2.4). Overlays the scene without hiding already-acquired artifacts.
 */
export function ErrorBanner(props: ErrorBannerProps) {
  const isError = props.variant === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "mx-auto flex w-full max-w-md items-center justify-between gap-4 rounded-lg bg-surface-elevee p-4",
        isError && "border-l-[3px] border-erreur",
      )}
    >
      <p className={cn("text-sm", isError ? "text-texte-principal" : "text-texte-secondaire")}>
        {props.message}
      </p>
      {props.variant === "error" && (
        <Button variant="outline" onClick={props.onRetry}>
          {RETRY_LABEL[props.step]}
        </Button>
      )}
    </div>
  );
}
