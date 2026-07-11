/**
 * All model prompts, centralised (AR-PROMPTS / AD-6). Editing prompts means
 * touching this file only.
 */

/**
 * The text prompt fed to SAM 3 for furniture segmentation.
 *
 * [Calibrated live 2026-07-11] SAM 3 is English-only and returns a combined
 * mask for the broad concept "furniture"; the French per-category list (below)
 * and dot/comma-separated multi-concept prompts returned zero segments on real
 * room photos. Since the mask is fully user-editable afterwards (FR-6/FR-7), a
 * broad furniture mask is the right starting point. Per-category enrichment
 * (multiple calls unioned) is a possible future refinement.
 */
export const SAM_DETECT_PROMPT = "furniture";

/**
 * The furniture vocabulary from the glossary (§3), kept for reference and for a
 * future multi-concept detection strategy. Not currently sent as-is (see above).
 */
export const FURNITURE_CATEGORIES: readonly string[] = [
  "canapé",
  "chaise",
  "table",
  "lit",
  "lampe",
  "étagère",
  "meuble bas",
  "tapis",
  "plante",
  "télévision",
  "fauteuil",
  "commode",
  "bureau",
];

/** Empty-room inpainting prompt — posed for Epic 3. */
export const EMPTY_ROOM_PROMPT = "";

/** FLF motion prompt for the "mix côtés + plafond" preset — posed for Epic 4. */
export const REVEAL_MOTION_PROMPT = "";
