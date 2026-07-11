import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";
import { FAL_ALLOWED_ENDPOINTS } from "@/pipeline/config";

/**
 * fal proxy (AD-4 / AR-PROXY). Keeps FAL_KEY server-side (the handler reads it
 * from the environment) and enforces the endpoint allowlist from the pipeline
 * registry — a POST to any model outside FAL_ALLOWED_ENDPOINTS is refused. All
 * fal API traffic (models, queue, storage upload) flows through here; the 24 h
 * expiration (AD-9) is set at the call sites in pipeline/ and forwarded here.
 */
export const { GET, POST, PUT } = createRouteHandler({
  allowedEndpoints: [...FAL_ALLOWED_ENDPOINTS],
});
