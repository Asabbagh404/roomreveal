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

/**
 * Result of the inpaint adapter (AD-5). `emptyRoom` is the URL of the generated
 * Pièce vide — at canonical dimensions by construction (flux fill preserves the
 * input image's size, and photo + mask share the canonical dims per AD-2/AD-7).
 * The adapter throws a retryable StepError rather than returning an empty result,
 * so `emptyRoom` is always a real URL.
 */
export interface InpaintResult {
  emptyRoom: string;
}

/**
 * Result of the video adapter (AD-5). `reveal` is the URL of the generated FLF
 * MP4 on fal storage (first frame = empty room, last frame = canonical photo,
 * AD-1). The adapter throws a retryable StepError rather than returning an empty
 * result, so `reveal` is always a real URL.
 */
export interface VideoResult {
  reveal: string;
}

/**
 * Result of a free-edit adapter (Story 5.3/5.4). `image` is the URL of the
 * retouched image on fal storage (an object removed, or added). At canonical
 * dimensions by construction (the model preserves the input size). The adapter
 * throws a retryable StepError rather than returning an empty result.
 */
export interface EditResult {
  image: string;
}
