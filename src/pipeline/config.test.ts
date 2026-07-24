import { describe, expect, it } from "vitest";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  FAL_ALLOWED_ENDPOINTS,
  MODELS,
  PROXY_URL,
  TIMEOUTS_MS,
} from "./config";

describe("pipeline config registry (AR-CONFIG / AR-PROXY)", () => {
  it("references SAM 3 for detection by role", () => {
    expect(MODELS.detect).toBe("fal-ai/sam-3/image");
  });

  it("allows all wired models (detect + inpaint + emptyRoomAuto + editAdd + pointSegment + video)", () => {
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.detect);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.inpaint);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.emptyRoomAuto);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.editAdd);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.pointSegment);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.video);
  });

  it("references kling v1.5 pro for the Motion Brush video backend (Story 4.8)", () => {
    expect(MODELS.videoMotionBrush).toBe("fal-ai/kling-video/v1.5/pro/image-to-video");
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.videoMotionBrush);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(`${MODELS.videoMotionBrush}/**`);
  });

  it("references flux-pro/v1/fill for the edit-add role (Story 5.4)", () => {
    expect(MODELS.editAdd).toBe("fal-ai/flux-pro/v1/fill");
  });

  it("references sam2 for the click-to-select role (Story 5.6)", () => {
    expect(MODELS.pointSegment).toBe("fal-ai/sam2/image");
    expect(FAL_ALLOWED_ENDPOINTS).toContain(`${MODELS.pointSegment}/**`);
  });

  it("registers the editModify model, timeout and allowlist entries", () => {
    expect(MODELS.editModify).toBe("fal-ai/flux-2/klein/4b/edit");
    expect(TIMEOUTS_MS.editModify).toBeGreaterThan(0);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(`${MODELS.editModify}`);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(`${MODELS.editModify}/**`);
  });

  it("retains fal objects for 24 h (AD-9)", () => {
    expect(ARTIFACT_EXPIRES_IN_SECONDS).toBe(86_400);
  });

  it("routes the client through the proxy (AD-4)", () => {
    expect(PROXY_URL).toBe("/api/fal/proxy");
  });
});
