/**
 * All model prompts, centralised (AR-PROMPTS / AD-6). Editing prompts means
 * touching this file only.
 */

/**
 * Furniture categories fed to the SAM 3 text-prompted segmentation model
 * (glossary §3). The detect adapter turns these into the model's prompt input.
 */
export const FURNITURE_PROMPTS: readonly string[] = [
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
