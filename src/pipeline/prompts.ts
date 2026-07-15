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
  // Wall-mounted & decor (live 2026-07-12: these were the main residuals left
  // in the empty room — the mask missed them, so name them explicitly)
  "television",
  "wall-mounted tv",
  "faucet",
  "picture frame",
  "wall art",
  "potted plant",
  "vase",
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

/**
 * Maskless « Vider automatiquement » prompt (Story 3.4) for the instruction-edit
 * model `fal-ai/nano-banana-2/edit` (Gemini). Removes ALL furniture in one shot
 * while preserving the room shell + perspective. Validated live 2026-07-13
 * (empties the room far cleaner than mask+eraser, 2/2 photos). [À calibrer live]
 */
export const EMPTY_ROOM_AUTO_PROMPT =
  "Remove ALL furniture, cabinets, kitchen island, appliances, wall-mounted TV, shelves, rugs, plants and every object. Show the completely EMPTY room: bare smooth painted walls and bare floor only. Keep the exact same room shape, walls, floor, windows, lighting, camera angle and perspective.";

/**
 * FLF motion prompt (kling o1, Story 4.1) — the "mix côtés + plafond" preset.
 * The video interpolates the empty room (first frame) → furnished photo (last
 * frame), so the prompt steers HOW the furniture arrives: directional motion
 * from the ceiling and side walls, never a morph/fade/pop-in (FR-10, AD-1).
 *
 * Calibrated live 2026-07-12: benched 3 variants (2 rolls each) on a real
 * kitchen; variant "A" (ceiling + sides descent) read best — the others are
 * kept below as documented alternatives. Paired with REVEAL_NEGATIVE_PROMPT to
 * push against the "feverish dream" morph the bare FLF interpolation produces.
 */
export const REVEAL_MOTION_PROMPT =
  "the furniture pieces descend from the ceiling and slide in from the side walls, flying into the room and landing precisely into their final positions; clear directional motion with real trajectories, solid objects physically moving into place, cinematic reveal; no morphing, no materializing on the spot";

/**
 * Negative prompt for the FLF video — discourages the in-place morph/dissolve
 * that pure empty→furnished interpolation tends toward (kling default is only
 * "blur, distort, and low quality").
 */
export const REVEAL_NEGATIVE_PROMPT =
  "morphing, dissolving, materializing, fading in, cross-dissolve, blur, distort, low quality, warping";

/**
 * Benched motion-prompt alternatives (kept so the calibration work isn't lost).
 * Swap one into REVEAL_MOTION_PROMPT to re-test. See resultat/ for the samples.
 * - B (assembly/drop): "furniture flies in and assembles the kitchen: cabinets
 *   drop down from above, appliances and units slide in from the left and right
 *   edges of the frame and lock into position, like a physical assembly
 *   animation with motion; solid moving objects, not dissolving in place"
 * - C (gravity swoop): "an empty room fills with furniture that swoops in from
 *   the top and the sides of the frame and settles into place with gravity and
 *   momentum, smooth camera hold, furniture arriving in motion from off-screen;
 *   never fading or morphing in place"
 */

/**
 * Free-edit « Modifier » prompt (texture bank). Composes an instruction that
 * (a) bounds the change to the masked element, preserving its shape, lighting
 * and perspective, (b) folds in the chosen texture's descriptive prompt (paired
 * with the texture image as an IP-Adapter reference in editModify), and (c)
 * folds in the user's free instruction. Either half may be empty (texture OR
 * instruction), but the region-bounding sentence is always present. [À calibrer
 * live avec le scale IP-Adapter de flux-general.]
 */
export function buildModifyPrompt(
  texturePrompt?: string,
  instruction?: string,
): string {
  const tex = texturePrompt?.trim();
  const ins = instruction?.trim();
  const parts: string[] = [];
  if (tex) {
    // Kontext multi-image: the texture swatch is the SECOND input image. Kontext
    // tends to PASTE that image flat unless told firmly it is only a material
    // sample to re-render the object's surfaces with (live 2026-07-14).
    parts.push(
      `The second image is a MATERIAL SAMPLE (a ${tex} swatch), not a picture to insert. Re-render the surfaces of the object in the first image as if they were physically made of that material: wrap the material across the object following its real shape, panels, edges, thickness and perspective, and preserve the object's existing lighting, shadows, highlights and reflections. Do NOT paste, overlay, stretch or place the second image as a flat rectangle — use it only as the surface material.`,
    );
  }
  if (ins) parts.push(ins);
  // Kontext is maskless — this preservation clause is what confines the change.
  parts.push(
    "Keep everything else in the scene exactly the same: the framing, camera angle, layout, the other objects, and the lighting must not change.",
  );
  return parts.join(" ");
}
