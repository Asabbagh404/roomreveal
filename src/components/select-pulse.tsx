"use client";

import { cn } from "@/lib/utils";
import type { Point } from "@/lib/mask-buffer";

export type SelectPhase = "idle" | "pulsing" | "reveal" | "error";

interface SelectPulseProps {
  /** Anchor in viewport-local CSS pixels (the clicked point), or null when idle. */
  anchor: Point | null;
  phase: SelectPhase;
}

/**
 * Signature click-to-select loader (Story 5.6), rendered inside the MaskCanvas
 * viewport at the clicked point. `pulsing`: a gold dot radiating concentric rings
 * while SAM segments the object. `reveal`: a one-shot ring that expands and fades
 * — the object "landed". `error`: a brief red dot. Purely decorative
 * (pointer-events-none); keyframes live in globals.css.
 */
export function SelectPulse({ anchor, phase }: SelectPulseProps) {
  if (anchor === null || phase === "idle") return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: anchor.x, top: anchor.y }}
    >
      {phase === "pulsing" && (
        <>
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-or-lumineux [animation:select-dot_1s_ease-in-out_infinite]" />
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-or-lumineux [animation:select-ring_1.4s_ease-out_infinite]" />
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-or-lumineux [animation:select-ring_1.4s_ease-out_infinite_0.5s]" />
        </>
      )}
      {phase === "reveal" && (
        <span className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-or-lumineux [animation:select-reveal_0.5s_ease-out_forwards]" />
      )}
      {phase === "error" && (
        <span
          className={cn(
            "absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-erreur",
            "[animation:select-dot_0.3s_ease-out_forwards]",
          )}
        />
      )}
    </div>
  );
}
