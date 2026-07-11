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

  it("keeps every model in the proxy allowlist (no un-listed endpoint reachable)", () => {
    for (const id of Object.values(MODELS)) {
      expect(FAL_ALLOWED_ENDPOINTS).toContain(id);
    }
  });

  it("retains fal objects for 24 h (AD-9)", () => {
    expect(ARTIFACT_EXPIRES_IN_SECONDS).toBe(86_400);
  });

  it("routes the client through the proxy (AD-4)", () => {
    expect(PROXY_URL).toBe("/api/fal/proxy");
  });
});
