import type { WaitPhase } from "@/state/types";

/** Options every passive adapter receives (AD-12). */
export interface AdapterOptions {
  signal: AbortSignal;
  onPhase: (phase: WaitPhase) => void;
}

/**
 * One detected object (Story 4.6, local backend only). `label` is the matched
 * concept text as returned by Grounding DINO (English, lowercase, passed
 * through as-is); `box` is `[x0, y0, x1, y1]` normalized to [0,1] relative to
 * the detection image (AD-2: never pixel coordinates); `area` is the
 * normalized box area, used to rank objects by size.
 */
export interface DetectedInstance {
  label: string;
  box: [number, number, number, number];
  area: number;
}

/**
 * Result of the detect adapter (AD-5). `initialMask` is the URL of a single
 * binary PNG mask at canonical dimensions (segments already composed inside the
 * adapter), or `null` when no furniture was found — the canonical FR-16 case.
 * `categories` stays internal to the pipeline; it is never exposed in the UI.
 * `instances` (Story 4.6) is the per-object detection list feeding the motion
 * prompt — produced by the local backend only (fal leaves it `undefined`) and,
 * like `categories`, never exposed in the UI.
 */
export interface DetectResult {
  initialMask: string | null;
  categories: string[];
  instances?: DetectedInstance[];
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

/**
 * Result of the point-segment adapter (Story 5.6). `mask` is the URL (fal) or
 * data URL (local) of a single binary PNG mask — white = the object under the
 * clicked point — at (or reducible to) canonical dimensions. The adapter throws
 * a retryable StepError rather than returning an empty result, so `mask` is
 * always a real URL. The effect layer decodes it and unions it into the draft.
 */
export interface PointSegmentResult {
  mask: string;
}
