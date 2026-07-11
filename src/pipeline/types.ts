import type { WaitPhase } from "@/state/types";

/** Options every passive adapter receives (AD-12). */
export interface AdapterOptions {
  signal: AbortSignal;
  onPhase: (phase: WaitPhase) => void;
}

/**
 * Result of the detect adapter (AD-5). `initialMask` is the URL of a single
 * binary PNG mask at canonical dimensions (segments already composed inside the
 * adapter), or `null` when no furniture was found — the canonical FR-16 case.
 * `categories` stays internal to the pipeline; it is never exposed in the UI.
 */
export interface DetectResult {
  initialMask: string | null;
  categories: string[];
}
