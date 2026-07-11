/**
 * Public surface of the pipeline layer (AD-5). The rest of the app depends on
 * these; nothing outside src/pipeline/ imports @fal-ai/client.
 */
export { uploadArtifact } from "./client";
export { detect } from "./detect";
export { detectLocal } from "./detect-local";
export { DETECT_BACKEND } from "./config";
export type { AdapterOptions, DetectResult } from "./types";
