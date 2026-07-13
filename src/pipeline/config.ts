/**
 * Pipeline model registry and per-step configuration (AR-CONFIG, AR-MODELS).
 * Models are referenced by ROLE — changing a model means editing this file and
 * nothing else. This module holds constants only; it never imports
 * @fal-ai/client (that is client.ts's exclusive job, AD-5).
 */

/** fal model IDs by pipeline role (AR-MODELS). */
export const MODELS = {
  detect: "fal-ai/sam-3/image",
  // Object-ERASER, not a general inpainter. Live bench (2026-07-12) on a real
  // kitchen proved flux-pro/v1/fill *reconstructs* furniture instead of removing
  // it (a general fill model "completes" the scene) — prompt tuning did not help.
  // bria/eraser fills the masked region with plausible background (bare wall/floor),
  // which is the declutter we need (FR-8, SM-2). Mask white = area erased.
  inpaint: "fal-ai/bria/eraser",
  // Maskless "empty the room" edit (Story 3.4). Live bench (2026-07-13) beat the
  // mask+eraser path for cleanliness — used when the user picks « Vider
  // automatiquement » (no mask); the mask+bria path stays for manual retouch.
  emptyRoomAuto: "fal-ai/nano-banana-2/edit",
  // Masked generative fill for the free-edit « Ajouter » (Story 5.4): regenerates
  // the WHITE masked region per the text prompt, leaving the rest intact. Note:
  // this is flux fill — rejected in 3.1 for *removal* (it reconstructs furniture)
  // but that generative behavior is exactly what ADDING an object wants. Swappable
  // (bench-ready vs bria/genfill). Mask white = where the described object goes.
  editAdd: "fal-ai/flux-pro/v1/fill",
  // Masked inpaint + IP-Adapter (real texture image reference) + prompt for the
  // free-edit « Modifier » (texture bank): regenerates the WHITE masked region
  // constrained by an IP-Adapter reference image (the chosen texture) and the
  // prompt, leaving the rest pixel-identical (mask-native locality). Swappable /
  // bench-gated. Documented fallback: nano-banana-2/edit (maskless) + a
  // highlighted-region guidance image, if the IP-Adapter `scale` proves fiddly.
  editModify: "fal-ai/flux-general/image-to-image",
  // Point-prompt segmentation for click-to-select in the free editor (Story 5.6):
  // SAM's OTHER interface — a single click point → the mask of the object under it
  // (vs `detect`, which text-prompts the SAME family). Backend piloted by
  // DETECT_BACKEND (fal here; local Grounded-SAM point route otherwise). Mask
  // white = the selected object; unioned into the draft mask client-side.
  pointSegment: "fal-ai/sam2/image",
  video: "fal-ai/kling-video/o1/image-to-video",
} as const;

/** Per-step timeouts in ms — the adapter converts an overrun into a StepError (AD-8). */
export const TIMEOUTS_MS = {
  detect: 60_000,
  inpaint: 60_000,
  emptyRoomAuto: 120_000,
  video: 360_000,
  // Free-edit retouch (Story 5.3 remove = bria eraser; 5.4 add = flux fill).
  edit: 90_000,
  editAdd: 90_000,
  editModify: 90_000,
  // Click-to-select is interactive — a click should feel near-instant; cap short.
  pointSegment: 60_000,
} as const;

/** Retain every fal object (uploads + generations) for 24 h (AD-9 / AR-EPHEMERAL). */
export const ARTIFACT_EXPIRES_IN_SECONDS = 86_400;

/**
 * Max instances SAM 3 returns for the detection concept (its default is 3).
 * A kitchen shows ~12–20 cabinet/unit instances (calibrated live), so cap high
 * to include them all in the combined mask; capping low would drop coverage.
 */
export const DETECT_MAX_MASKS = 20;

/** The proxy route the client talks to (AD-4). */
export const PROXY_URL = "/api/fal/proxy";

/**
 * Detection backend. Default is fal (hosted SAM 3). Set
 * `NEXT_PUBLIC_DETECT_BACKEND=local` to route detection to a self-hosted
 * Grounded-SAM service instead — which can loop over every FURNITURE_CATEGORIES
 * concept and union the masks for free (no per-call fal cost). NEXT_PUBLIC_* is
 * inlined at build; the local URL is a localhost dev endpoint, not a secret.
 */
export const DETECT_BACKEND: "fal" | "local" =
  process.env.NEXT_PUBLIC_DETECT_BACKEND === "local" ? "local" : "fal";

/** Base URL of the local Grounded-SAM service (used only when DETECT_BACKEND === "local"). */
export const LOCAL_DETECT_URL =
  process.env.NEXT_PUBLIC_LOCAL_DETECT_URL ?? "http://localhost:8000/detect";

/** Local detection can run ~14 concepts through two models — allow more time. */
export const LOCAL_DETECT_TIMEOUT_MS = 180_000;

/**
 * Endpoints the proxy allows (AR-PROXY). Passed to the fal server-proxy as its
 * `allowedEndpoints` allowlist — any POST to a model outside this set is refused
 * by the proxy. Glob syntax (picomatch). Storage/queue endpoints are covered by
 * the proxy's default allowed URL patterns (a separate, URL-pattern gate).
 *
 * Wired models: detect + inpaint (bria) + emptyRoomAuto (nano) + editAdd
 * (flux fill) + editModify (flux-general IP-Adapter) + pointSegment (sam2,
 * click-to-select) + video (kling).
 */
export const FAL_ALLOWED_ENDPOINTS: readonly string[] = [
  `${MODELS.detect}/**`,
  `${MODELS.detect}`,
  `${MODELS.inpaint}/**`,
  `${MODELS.inpaint}`,
  `${MODELS.emptyRoomAuto}/**`,
  `${MODELS.emptyRoomAuto}`,
  // Re-added for the free-edit « Ajouter » (Story 5.4). flux fill was removed
  // from the allowlist at the 3.1 swap to bria; the edit-add role needs it back.
  `${MODELS.editAdd}/**`,
  `${MODELS.editAdd}`,
  // Masked IP-Adapter inpaint for the free-edit « Modifier » (texture bank).
  `${MODELS.editModify}/**`,
  `${MODELS.editModify}`,
  // Point-prompt SAM for click-to-select (Story 5.6, fal backend).
  `${MODELS.pointSegment}/**`,
  `${MODELS.pointSegment}`,
  `${MODELS.video}/**`,
  `${MODELS.video}`,
];
