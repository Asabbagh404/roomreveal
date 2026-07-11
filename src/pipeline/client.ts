import { fal } from "@fal-ai/client";
import { ARTIFACT_EXPIRES_IN_SECONDS, PROXY_URL } from "./config";

/**
 * The single place @fal-ai/client is imported (AD-5). Every fal API call —
 * models, queue, storage — flows through the proxy so FAL_KEY never reaches the
 * browser (AD-4).
 */
fal.config({ proxyUrl: PROXY_URL });

export { fal };

/**
 * Uploads a Blob to fal storage and returns its URL, tagged to expire after 24 h
 * (AD-9 / AR-EPHEMERAL). This is the only entry point that accepts a Blob; every
 * fal URL in the app is born here.
 */
export async function uploadArtifact(blob: Blob): Promise<string> {
  return fal.storage.upload(blob, {
    lifecycle: { expiresIn: ARTIFACT_EXPIRES_IN_SECONDS },
  });
}
