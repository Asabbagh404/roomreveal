"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGeneration } from "@/state/generation-context";
import { STEP_ORDER, type Generation, type Step } from "@/state/types";
import { cn } from "@/lib/utils";

/** French labels for the four Parcours steps (glossary). */
const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mask: "Masque",
  emptyRoom: "Pièce vide",
  video: "Vidéo",
};

/** The artifact whose presence proves a step ahead of `current` is still reachable. */
const STEP_ARTIFACT: Partial<Record<Step, keyof Generation>> = {
  mask: "mask",
  emptyRoom: "emptyRoom",
  video: "reveal",
};

/**
 * A step ahead of the current one is "reachable" only while its artifact still
 * exists (back-navigation preserves artifacts, AD-11). Reaching it again is a
 * forward move that invalidates downstream — hence the confirmation.
 */
export function isReachableAhead(state: Generation, step: Step): boolean {
  const artifact = STEP_ARTIFACT[step];
  return artifact !== undefined && state[artifact] !== undefined;
}

/** True when advancing forward from `target` would discard existing artifacts. */
export function hasDownstreamArtifacts(state: Generation, target: Step): boolean {
  const from = STEP_ORDER.indexOf(target);
  if (from < STEP_ORDER.indexOf("mask") && state.mask) return true;
  if (from < STEP_ORDER.indexOf("emptyRoom") && state.emptyRoom) return true;
  if (from < STEP_ORDER.indexOf("video") && state.reveal) return true;
  return false;
}

/**
 * Parcours stepper (UX-DR5, FR-13). Current step in gold; accomplished steps
 * show a check + label and are clickable (lossless back-navigation, FR-15);
 * future steps are inert. State is never signalled by color alone — check +
 * position + label combine (UX-DR18).
 */
export function Stepper() {
  const { state, dispatch } = useGeneration();
  const currentIndex = STEP_ORDER.indexOf(state.step);
  const [pendingAdvance, setPendingAdvance] = useState<Step | null>(null);

  return (
    <nav aria-label="Parcours" className="flex items-center gap-3">
      <ol className="flex flex-1 items-center gap-3">
        {STEP_ORDER.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isBehind = index < currentIndex;
          // Ahead + artifact still present → revisiting it re-advances (guarded).
          const isReopenable = index > currentIndex && isReachableAhead(state, step);
          const isInert = !isCurrent && !isBehind && !isReopenable;

          return (
            <li key={step} className="flex flex-1 items-center gap-3">
              <button
                type="button"
                disabled={isInert}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => {
                  if (isBehind) {
                    dispatch({ type: "GO_TO_STEP", step });
                  } else if (isReopenable) {
                    // Forward move from an earlier step: confirm, then invalidate
                    // downstream (AC3, AD-11). Guard only if artifacts are at risk.
                    if (hasDownstreamArtifacts(state, step)) {
                      setPendingAdvance(step);
                    } else {
                      dispatch({ type: "CONFIRM_ADVANCE_FROM", step });
                    }
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-carton-titre transition-colors",
                  isCurrent && "bg-or-lumineux text-or-lumineux-foreground",
                  (isBehind || isReopenable) &&
                    "text-texte-principal hover:bg-surface-elevee cursor-pointer",
                  isInert && "text-texte-secondaire cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-xs",
                    isCurrent && "border-or-lumineux-foreground",
                    !isCurrent && "border-current",
                  )}
                >
                  {isBehind ? <Check className="size-3" aria-hidden /> : index + 1}
                </span>
                <span>{STEP_LABELS[step]}</span>
              </button>
              {index < STEP_ORDER.length - 1 && (
                <span className="h-px flex-1 bg-bordure" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="sr-only">
        Étape {currentIndex + 1} sur {STEP_ORDER.length} :{" "}
        {STEP_LABELS[state.step]}
      </p>

      <Dialog
        open={pendingAdvance !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAdvance(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continuer le Parcours ?</DialogTitle>
            <DialogDescription>
              Avancer va recréer les étapes suivantes. Vos étapes déjà réalisées
              après celle-ci seront remplacées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingAdvance(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                if (pendingAdvance) {
                  dispatch({ type: "CONFIRM_ADVANCE_FROM", step: pendingAdvance });
                }
                setPendingAdvance(null);
              }}
            >
              Continuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
