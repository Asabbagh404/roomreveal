import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";
import { FAL_ALLOWED_ENDPOINTS } from "@/pipeline/config";

/**
 * fal proxy (AD-4 / AR-PROXY). Keeps FAL_KEY server-side (the handler reads it
 * from the environment) and enforces the endpoint allowlist from the pipeline
 * registry — a POST to any model outside FAL_ALLOWED_ENDPOINTS is refused. All
 * fal API traffic (models, queue, storage upload) flows through here.
 *
 * The 24 h expiration (AD-9) is set at each call site in pipeline/ —
 * uploadArtifact via `lifecycle`, detect via the x-fal-object-lifecycle-preference
 * header — and the proxy forwards those x-fal-* headers to fal unchanged. There
 * is no auth/rate-limit on this route by design for the v1 internal tool: the
 * demo runs on a private network and the allowlist bounds reachable models
 * (PRD §6 non-objectives, AD-4 / AR-DEPLOY).
 */
export const { GET, POST, PUT } = createRouteHandler({
  allowedEndpoints: [...FAL_ALLOWED_ENDPOINTS],
});
