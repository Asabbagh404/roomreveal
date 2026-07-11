/**
 * Domain types for the Generation state machine (AD-3, AD-8, AD-14).
 * Code and comments in English; the fixed glossary mapping applies:
 * originalPhoto, mask, emptyRoom, reveal, generation, step.
 */

/** The four linear Parcours steps, in order (AD-11 downstream ordering). */
export type Step = "upload" | "mask" | "emptyRoom" | "video";

/** Canonical step order — used to compare upstream/downstream (AD-11). */
export const STEP_ORDER: readonly Step[] = [
  "upload",
  "mask",
  "emptyRoom",
  "video",
] as const;

/**
 * Named wait phases emitted by pipeline adapters (AD-14). A single enum in the
 * domain; the Panneau d'attente is the only place that translates these to
 * French microcopy. Ordered for monotonicity enforcement.
 */
export type WaitPhase = "uploading" | "queued" | "generating" | "finalizing";

export const WAIT_PHASE_ORDER: readonly WaitPhase[] = [
  "uploading",
  "queued",
  "generating",
  "finalizing",
] as const;

/** Pipeline operation that can fail (AD-8) — distinct from the Parcours Step. */
export type PipelineStep = "detect" | "inpaint" | "video";

/**
 * Single error taxonomy (AD-8). userMessage is French (glossary vocabulary);
 * the UI never sees a native fal error.
 */
export interface StepError {
  step: PipelineStep;
  retryable: boolean;
  userMessage: string;
}

/**
 * The reducer's canonical mapping from a failed pipeline operation to the
 * Parcours surface where the retry happens (AD-8).
 */
export const PIPELINE_STEP_TO_PARCOURS: Record<PipelineStep, Step> = {
  detect: "mask",
  inpaint: "emptyRoom",
  video: "video",
};

/** The uploaded canonical photo: a local Blob, optionally uploaded to fal. */
export interface OriginalPhoto {
  blob: Blob;
  falUrl?: string;
}

/**
 * The mask draft (AD-13), owned by the reducer so it survives component
 * unmount/remount. Story 2.1 seeds it from detection; Story 2.2 extends it with
 * the editable binary buffer. `detectedMaskUrl === null` means detection found
 * no furniture (FR-16). Its presence also marks "detection has run" for this
 * attempt, so the effect layer does not re-run detect on every render.
 */
export interface MaskDraft {
  detectedMaskUrl: string | null;
}

/**
 * The single Generation object held by the reducer (AD-3). The server holds no
 * state; loss on refresh is accepted. fal artifacts are referenced by URL.
 */
export interface Generation {
  step: Step;
  epoch: number;
  originalPhoto?: OriginalPhoto;
  maskDraft?: MaskDraft;
  mask?: string;
  emptyRoom?: string;
  reveal?: string;
  waitPhase?: WaitPhase;
  error?: StepError;
}
