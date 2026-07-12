import { describe, expect, it } from "vitest";
import {
  ARTIFACT_EXPIRES_IN_SECONDS,
  FAL_ALLOWED_ENDPOINTS,
  MODELS,
  PROXY_URL,
} from "./config";

describe("pipeline config registry (AR-CONFIG / AR-PROXY)", () => {
  it("references SAM 3 for detection by role", () => {
    expect(MODELS.detect).toBe("fal-ai/sam-3/image");
  });

  it("allows the wired models (detect + inpaint); video stays closed until Epic 4", () => {
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.detect);
    expect(FAL_ALLOWED_ENDPOINTS).toContain(MODELS.inpaint);
    expect(FAL_ALLOWED_ENDPOINTS).not.toContain(MODELS.video);
  });

  it("retains fal objects for 24 h (AD-9)", () => {
    expect(ARTIFACT_EXPIRES_IN_SECONDS).toBe(86_400);
  });

  it("routes the client through the proxy (AD-4)", () => {
    expect(PROXY_URL).toBe("/api/fal/proxy");
  });
});
