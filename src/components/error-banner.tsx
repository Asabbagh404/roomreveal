"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineStep } from "@/state/types";

/** French retry label per pipeline step (glossary; no jargon). */
const RETRY_LABEL: Record<PipelineStep, string> = {
  detect: "Relancer la détection",
  inpaint: "Relancer la pièce vide",
  video: "Relancer la vidéo",
};

interface ErrorBannerProps {
  /** French user message (AD-8 userMessage), or the neutral "no furniture" line. */
  message: string;
  /**
   * "error" → red left rule + single retry action + assertive alert (FR-17).
   * "neutral" → "aucun meuble détecté": informational, not an error (AC4/FR-16).
   */
  variant: "error" | "neutral";
  /** Pipeline step to retry (error variant only) — drives the single action label. */
  step?: PipelineStep;
  /** Retry handler (error variant). Real re-run lives in effects.ts (Epic 2+). */
  onRetry?: () => void;
}

/**
 * Bandeau d'erreur (UX-DR12). Renders a single French message and, for real
 * errors, exactly one action: retry the affected step. Never a technical trace.
 * The "aucun meuble détecté" case is a neutral variant, not an error (AC4).
 * Overlays the scene without hiding already-acquired artifacts (AC3).
 */
export function ErrorBanner({ message, variant, step, onRetry }: ErrorBannerProps) {
  const isError = variant === "error";
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
        {message}
      </p>
      {isError && step && onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {RETRY_LABEL[step]}
        </Button>
      )}
    </div>
  );
}
