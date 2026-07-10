"use client";

import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { useGeneration } from "@/state/generation-context";
import { WAIT_PHASE_ORDER } from "@/state/types";
import { LONG_WAIT_MS, waitPhaseLabel } from "./wait-copy";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000)); // guard clock skew / NaN
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min > 0 ? `${min} min ${sec} s` : `${sec} s`;
}

/**
 * Panneau d'attente (FR-14, UX-DR11). Gold progress bar positioned by discrete
 * phase index — never a time-based fake percentage, never a mute spinner. The
 * bar cannot recede because the reducer keeps waitPhase monotonic per attempt
 * (AD-14). Elapsed time ticks locally; the video step announces "1 à 3 minutes"
 * and, past 3 min 30 s, a reassuring line.
 */
export function WaitPanel() {
  const { state } = useGeneration();
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  // Reset per attempt is handled by remounting via key={epoch} (ParcoursScene),
  // so this effect only owns the ticking interval — no setState in its body.
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(id);
  }, []);

  if (state.waitPhase === undefined) return null;

  const phaseIndex = WAIT_PHASE_ORDER.indexOf(state.waitPhase);
  // Discrete: (index+1)/total — a named milestone, not a time ratio.
  const value = ((phaseIndex + 1) / WAIT_PHASE_ORDER.length) * 100;
  const isVideo = state.step === "video";
  // "1 à 3 minutes" is the promise; LONG_WAIT_MS (3 min 30) adds a 30 s grace
  // before the reassurance line, so it only shows once we're genuinely past
  // the promised ceiling (UX-DR11).
  const tooLong = elapsed >= LONG_WAIT_MS;

  return (
    <div className="mx-auto w-full max-w-md rounded-lg bg-surface-elevee p-6">
      <p aria-live="polite" className="text-attente text-texte-principal">
        {waitPhaseLabel(state.step, state.waitPhase)}
      </p>
      {isVideo && (
        <p className="mt-1 text-sm text-texte-secondaire">
          Votre Révélation se prépare — comptez 1 à 3 minutes.
        </p>
      )}
      {/* Indicator uses --primary (or-lumineux). Override the track to bordure so
          the unfilled portion is visible against the surface-elevee panel. */}
      <Progress value={value} className="mt-4 bg-bordure" />
      <p className="mt-2 text-sm text-texte-secondaire">{formatElapsed(elapsed)}</p>
      {tooLong && (
        <p aria-live="polite" className="mt-2 text-sm text-texte-secondaire">
          C&apos;est plus long que prévu — encore quelques instants
        </p>
      )}
    </div>
  );
}
