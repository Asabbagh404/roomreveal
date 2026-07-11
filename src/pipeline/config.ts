/**
 * Pipeline model registry and per-step configuration (AR-CONFIG, AR-MODELS).
 * Models are referenced by ROLE — changing a model means editing this file and
 * nothing else. This module holds constants only; it never imports
 * @fal-ai/client (that is client.ts's exclusive job, AD-5).
 */

/** fal model IDs by pipeline role (AR-MODELS). */
export const MODELS = {
  detect: "fal-ai/sam-3/image",
  // Posed here now; consumed by Epic 3 / Epic 4.
  inpaint: "fal-ai/flux-pro/v1/fill",
  video: "fal-ai/kling-video/o1/image-to-video",
} as const;

/** Per-step timeouts in ms — the adapter converts an overrun into a StepError (AD-8). */
export const TIMEOUTS_MS = {
  detect: 60_000,
  inpaint: 60_000,
  video: 360_000,
} as const;

/** Retain every fal object (uploads + generations) for 24 h (AD-9 / AR-EPHEMERAL). */
export const ARTIFACT_EXPIRES_IN_SECONDS = 86_400;

/** The proxy route the client talks to (AD-4). */
export const PROXY_URL = "/api/fal/proxy";

/**
 * Endpoints the proxy allows (AR-PROXY). Passed to the fal server-proxy as its
 * `allowedEndpoints` allowlist — any POST to a model outside this set is refused
 * by the proxy. Glob syntax (picomatch). Storage/queue endpoints are covered by
 * the proxy's default allowed URL patterns (a separate, URL-pattern gate).
 *
 * Only the models actually wired in the current epic are listed, to keep the
 * public proxy's reachable model surface minimal — `inpaint` (Epic 3) and
 * `video` (Epic 4) are added to this allowlist when their adapters ship.
 */
export const FAL_ALLOWED_ENDPOINTS: readonly string[] = [
  `${MODELS.detect}/**`,
  `${MODELS.detect}`,
];
