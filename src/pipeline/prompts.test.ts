import { describe, expect, it } from "vitest";
import { buildModifyPrompt } from "./prompts";

describe("buildModifyPrompt", () => {
  it("always bounds the change to the masked region", () => {
    const p = buildModifyPrompt("oak wood texture", "darker");
    expect(p.toLowerCase()).toContain("masked");
    expect(p).toContain("oak wood texture");
    expect(p).toContain("darker");
  });

  it("works with the texture prompt only", () => {
    const p = buildModifyPrompt("marble texture", undefined);
    expect(p).toContain("marble texture");
  });

  it("works with the instruction only", () => {
    const p = buildModifyPrompt(undefined, "navy blue");
    expect(p).toContain("navy blue");
  });

  it("still returns a bounded prompt when both are empty", () => {
    const p = buildModifyPrompt(undefined, undefined);
    expect(p.toLowerCase()).toContain("masked");
  });
});
