import { describe, expect, it } from "vitest";
import { buildModifyPrompt } from "./prompts";

describe("buildModifyPrompt", () => {
  // Kontext is maskless: locality is steered by a preservation clause, not a mask.
  const PRESERVE = /must not change/i;

  // editModify pre-tints the target object to the swatch's mean color before the
  // call (ZeST-inspired init) — the texture branch of the prompt must present
  // that flat tint as a placeholder base coat to finish with the real material.
  const PLACEHOLDER_TINT = /placeholder tint/i;

  it("references the texture swatch, folds in the instruction, and preserves the rest", () => {
    const p = buildModifyPrompt("oak wood texture", "darker");
    expect(p).toContain("second image"); // the texture is the 2nd input image
    expect(p).toContain("oak wood texture");
    expect(p).toContain("darker");
    expect(p).toMatch(PLACEHOLDER_TINT); // pairs with the ZeST-inspired tint step
    expect(p).toMatch(PRESERVE);
  });

  it("works with the texture prompt only", () => {
    const p = buildModifyPrompt("marble texture", undefined);
    expect(p).toContain("marble texture");
    expect(p).toMatch(PRESERVE);
  });

  it("works with the instruction only (no texture → no 'second image' reference)", () => {
    const p = buildModifyPrompt(undefined, "navy blue");
    expect(p).toContain("navy blue");
    expect(p).not.toContain("second image");
    // No tint step on the instruction-only path (the instruction may refer to
    // the object's original color) → the prompt must not mention the base coat.
    expect(p).not.toMatch(PLACEHOLDER_TINT);
    expect(p).toMatch(PRESERVE);
  });

  it("still returns a preservation-bounded prompt when both are empty", () => {
    const p = buildModifyPrompt(undefined, undefined);
    expect(p).toMatch(PRESERVE);
  });
});
