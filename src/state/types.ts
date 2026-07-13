/**
 * Domain types for the Generation state machine (AD-3, AD-8, AD-14).
 * Code and comments in English; the fixed glossary mapping applies:
 * originalPhoto, mask, emptyRoom, reveal, generation, step.
 */

/**
 * The Parcours steps. `upload | mask | emptyRoom | video` form the linear reveal
 * flow (in order, AD-11 downstream ordering); `editor` is the edit-mode step
 * (Story 5.1) and is deliberately NOT part of STEP_ORDER — it has no downstream
 * ordering in the reveal sense and must never be indexed by stepIndex.
 */
export type Step = "upload" | "mask" | "emptyRoom" | "video" | "editor";

/**
 * The two top-level modes chosen on the home screen (Story 5.1). `undefined`
 * mode (on the Generation) means "no choice yet" → the home screen is shown.
 */
export type Mode = "reveal" | "edit";

/**
 * Canonical reveal step order — used to compare upstream/downstream (AD-11).
 * Only the four reveal steps; `editor` is excluded on purpose (see Step).
 */
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

/** Pipeline operation that can fail (AD-8) — distinct from the Parcours Step.
 * `edit` covers the free-edit retouch (remove/add) in edit mode (Story 5.3);
 * `pointSegment` covers click-to-select object segmentation (Story 5.6). */
export type PipelineStep =
  | "detect"
  | "inpaint"
  | "video"
  | "edit"
  | "pointSegment";

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
  edit: "editor",
  pointSegment: "editor",
};

/**
 * The uploaded photo. `blob` is the canonical image (<=1024) the pipeline
 * shares (AD-2); `detectionBlob` is the higher-res copy (<=1536) used only for
 * detection (AD-2 amendment). Each is uploaded lazily and its fal URL memoized.
 */
export interface OriginalPhoto {
  blob: Blob;
  falUrl?: string;
  detectionBlob: Blob;
  detectionFalUrl?: string;
  /** Canonical pixel dimensions of `blob` — the mask buffer matches these 1:1
   * (AD-2, AD-7). Fixed at upload; never re-decoded downstream. */
  width: number;
  height: number;
}

/**
 * The editable binary mask buffer (AD-7). Defined in the lib leaf (pure pixel
 * primitive) and re-exported here so the domain has a single name for it while
 * lib/ stays free of any state/ import (AR-LAYERS).
 */
export type { MaskBuffer } from "@/lib/mask-buffer";
import type { MaskBuffer } from "@/lib/mask-buffer";

/**
 * The mask draft (AD-13), owned by the reducer so it survives component
 * unmount/remount. Story 2.1 seeds `detectedMaskUrl` from detection; Story 2.2
 * adds the editable binary `buffer` (canonical dims, dual-life AD-13).
 * `detectedMaskUrl === null` means detection found no furniture (FR-16). The
 * draft's presence marks "detection has run" for this attempt, so the effect
 * layer does not re-run detect on every render.
 */
export interface MaskDraft {
  detectedMaskUrl: string | null;
  buffer?: MaskBuffer;
}

/**
 * The current working image in the free-edit mode (Story 5.3). Starts as the
 * uploaded photo (blob + canonical dims); after each applied edit it becomes the
 * fal-hosted result URL (no blob — already hosted, reused as the next input, so
 * no re-upload). `width`/`height` are the canonical mask dims; they are cleared
 * on each new result and re-measured from the image (EDIT_BASE_MEASURED).
 */
export interface EditBase {
  url?: string;
  blob?: Blob;
  width?: number;
  height?: number;
}

/**
 * The single Generation object held by the reducer (AD-3). The server holds no
 * state; loss on refresh is accepted. fal artifacts are referenced by URL.
 */
export interface Generation {
  /** Top-level mode chosen on the home screen (Story 5.1). `undefined` → home. */
  mode?: Mode;
  step: Step;
  epoch: number;
  originalPhoto?: OriginalPhoto;
  /** Free-edit working image (Story 5.3, edit mode only). */
  editBase?: EditBase;
  maskDraft?: MaskDraft;
  mask?: string;
  emptyRoom?: string;
  reveal?: string;
  waitPhase?: WaitPhase;
  error?: StepError;
}
