/**
 * Public surface of the pipeline layer (AD-5). The rest of the app depends on
 * these; nothing outside src/pipeline/ imports @fal-ai/client.
 */
export { uploadArtifact } from "./client";
export { detect } from "./detect";
export { detectLocal } from "./detect-local";
export { inpaint } from "./inpaint";
export { autoEmptyRoom } from "./empty-room-auto";
export { editRemove, editAdd, editModify } from "./edit";
export { resolveTextureUrl } from "./texture-upload";
export { findTexture } from "./textures";
export { buildModifyPrompt, buildRevealMotionPrompt } from "./prompts";
export { pointSegment, boxSegment } from "./point-segment";
export type { SelectBox } from "./point-segment";
export { pointSegmentLocal, boxSegmentLocal } from "./point-segment-local";
export { video } from "./video";
export { videoMotionBrush } from "./video-motion-brush";
export { detectInstanceMasks } from "./instance-masks";
export { DETECT_BACKEND, VIDEO_BACKEND } from "./config";
export type {
  AdapterOptions,
  DetectedInstance,
  DetectResult,
  EditResult,
  InpaintResult,
  InstanceMask,
  InstanceMasksResult,
  PointSegmentResult,
  VideoResult,
} from "./types";
