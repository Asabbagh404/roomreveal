import { describe, expect, it } from "vitest";
import { TEXTURES } from "./textures";

describe("texture bank manifest", () => {
  it("has at least the bois texture", () => {
    expect(TEXTURES.length).toBeGreaterThanOrEqual(1);
    expect(TEXTURES.some((t) => t.id === "bois")).toBe(true);
  });

  it("has unique ids", () => {
    const ids = TEXTURES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("serves every file from /textures/ with non-empty label and prompt", () => {
    for (const t of TEXTURES) {
      expect(t.file.startsWith("/textures/")).toBe(true);
      expect(t.label.trim()).not.toBe("");
      expect(t.prompt.trim()).not.toBe("");
    }
  });
});
