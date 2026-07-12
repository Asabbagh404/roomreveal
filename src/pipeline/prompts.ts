/**
 * All model prompts, centralised (AR-PROMPTS / AD-6). Editing prompts means
 * touching this file only.
 */

/**
 * The single text concept fed to SAM 3 for furniture segmentation.
 *
 * [Calibrated live 2026-07-11 on kitchen photos] SAM 3 accepts ONE English
 * concept per call (its `prompt` is a single string; `return_multiple_masks`
 * only returns multiple *instances* of that one concept). Empirically:
 *   - comma- or period-separated multi-concept prompts return ZERO masks
 *     (e.g. "cabinet, countertop, oven" → 0) — SAM 3 does not parse lists.
 *   - "furniture" → ~21% coverage (2 instances); "kitchen" → ~3%.
 *   - "kitchen furniture" / "kitchen cabinet" / "cabinet" → ~36–37%
 *     (12–20 instances) — the strong kitchen concepts.
 *   - Per-concept appliances (refrigerator/oven/hood/dishwasher/stool/table)
 *     mostly returned 0 on a modern kitchen; a per-category union of 11
 *     concepts reached only 39% vs 37% for "cabinet" alone — i.e. N× the fal
 *     cost for ~+2%, so multi-call union is NOT worthwhile here.
 * Kitchen-first for now (the app targets kitchens to start). The mask is fully
 * user-editable afterwards (FR-6/FR-7), so a strong broad concept as the
 * starting point is the right trade-off.
 *
 */
export const SAM_DETECT_PROMPT = "kitchen furniture";

/**
 * English kitchen vocabulary for detection. Backend-dependent usage:
 * - LOCAL backend (Grounded-SAM, DETECT_BACKEND=local): the WHOLE list is sent
 *   to the service (detect-local.ts) — Grounding DINO detects every concept in
 *   one period-separated prompt and unions the masks. So EACH entry here
 *   directly widens what the local mask covers.
 * - fal backend (SAM 3): SAM 3 ignores multi-concept lists (see calibration
 *   above), so only `SAM_DETECT_PROMPT` is sent; for fal this list is
 *   documentary / a future per-concept-loop pool.
 * Synonyms are included on purpose: Grounding DINO's recall is phrasing-
 * sensitive, so several near-synonyms of the same object lift coverage. The
 * mask is fully user-editable afterwards, so err generous.
 */
export const FURNITURE_CATEGORIES: readonly string[] = [
  // Large units & structure
  "cabinet",
  "kitchen island",
  "countertop",
  "worktop",
  "kitchen counter",
  "shelf",
  "range hood",
  "extractor hood",
  "cooker hood",
  // Large appliances
  "refrigerator",
  "oven",
  "stove",
  "sink",
  "dishwasher",
  "microwave",
  // Small appliances & worktop tools (counter clutter)
  "blender",
  "stand mixer",
  "kettle",
  "toaster",
  "coffee machine",
  "kitchen utensils",
  "cutting board",
  "pot",
  "pan",
  "dish rack",
  // Seating & tables
  "stool",
  "dining table",
  "chair",
];

/**
 * Empty-room inpainting prompt. CURRENTLY UNUSED: the live bench (2026-07-12)
 * showed prompt-driven fill models (flux-pro/v1/fill) *reconstruct* furniture
 * instead of removing it regardless of prompt, so the inpaint role now uses an
 * object-eraser (fal-ai/bria/eraser) which takes no prompt. Kept for a possible
 * future prompt-driven model. [À calibrer au live si réutilisé]
 */
export const EMPTY_ROOM_PROMPT =
  "empty room, bare floor and walls, no furniture, consistent lighting and perspective, photorealistic interior";

/** FLF motion prompt for the "mix côtés + plafond" preset — posed for Epic 4. */
export const REVEAL_MOTION_PROMPT = "";
