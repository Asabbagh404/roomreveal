"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GenerationButtonProps {
  children: React.ReactNode;
  /** Disabled until the step's precondition is met (UX-DR13). */
  disabled?: boolean;
  /** Explains the precondition when disabled (shown in a tooltip). */
  tooltip?: string;
  /** Optional second line under the label (e.g. « 1 à 3 minutes de génération », FR-14). */
  subtext?: string;
  onClick?: () => void;
}

/**
 * Bouton de Génération (UX-DR13) — the canonical single gold primary action of
 * a surface (« Valider le Masque », « Créer ma vidéo », « Télécharger le MP4 »).
 * Disabled until the precondition is met, with a tooltip explaining why. This is
 * the shared component consumed by the mask / emptyRoom / video surfaces (Epic 2+).
 */
export function GenerationButton({
  children,
  disabled = false,
  tooltip,
  subtext,
  onClick,
}: GenerationButtonProps) {
  const button = (
    <Button
      disabled={disabled}
      onClick={onClick}
      className={subtext ? "h-auto flex-col gap-0.5 py-2" : undefined}
    >
      <span>{children}</span>
      {subtext && (
        <span className="text-xs font-normal opacity-80">{subtext}</span>
      )}
    </Button>
  );

  if (disabled && tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          {/* Wrapper keeps the tooltip reachable even though the button is disabled. */}
          <TooltipTrigger asChild>
            <span tabIndex={0}>{button}</span>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
