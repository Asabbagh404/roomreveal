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
export { pointSegment } from "./point-segment";
export { pointSegmentLocal } from "./point-segment-local";
export { video } from "./video";
export { DETECT_BACKEND } from "./config";
export type {
  AdapterOptions,
  DetectResult,
  EditResult,
  InpaintResult,
  PointSegmentResult,
  VideoResult,
} from "./types";
