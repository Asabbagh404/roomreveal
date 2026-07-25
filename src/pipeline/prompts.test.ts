import { describe, expect, it } from "vitest";
import {
  buildModifyPrompt,
  buildRevealMotionPrompt,
  buildTimelapsePrompt,
  REVEAL_MOTION_PROMPT,
  REVEAL_TIMELAPSE_PROMPT,
} from "./prompts";
import type { DetectedInstance } from "./types";

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

/** The calibrated anti-morphing clause that must survive verbatim (Story 4.6, recalibrated for veo 2026-07-24). */
const ANTI_MORPHING_TAIL =
  "; fast confident motion with real trajectories: solid fully-opaque objects rush in early and decelerate smoothly into their final positions, every piece completely landed and still well before the last frame; no morphing, no fade-in, no slow floating, no materializing on the spot";

function instance(
  label: string,
  box: [number, number, number, number],
  area: number,
): DetectedInstance {
  return { label, box, area };
}

describe("REVEAL_MOTION_PROMPT (regression guard)", () => {
  it("keeps the exact calibrated string (tail composition must not alter it)", () => {
    expect(REVEAL_MOTION_PROMPT).toBe(
      "the furniture pieces descend from the ceiling and slide in from the side walls, rushing into the room and settling precisely into their final positions early" +
        ANTI_MORPHING_TAIL,
    );
  });
});

describe("buildRevealMotionPrompt (pure builder, Story 4.6)", () => {
  it("returns REVEAL_MOTION_PROMPT itself when instances is undefined (strict fallback)", () => {
    expect(buildRevealMotionPrompt(undefined)).toBe(REVEAL_MOTION_PROMPT);
    expect(buildRevealMotionPrompt()).toBe(REVEAL_MOTION_PROMPT);
  });

  it("returns REVEAL_MOTION_PROMPT itself for an empty array (strict fallback)", () => {
    expect(buildRevealMotionPrompt([])).toBe(REVEAL_MOTION_PROMPT);
  });

  it("names a single instance with the reveal prefix and the verbatim anti-morphing tail", () => {
    const prompt = buildRevealMotionPrompt([
      instance("refrigerator", [0.1, 0.2, 0.25, 0.9], 0.1),
    ]);
    expect(prompt).toBe(
      "the furniture moves into the empty room: the refrigerator slides in from the left" +
        ANTI_MORPHING_TAIL,
    );
  });

  it("derives all four directions from the box geometry", () => {
    // Box never reaching the lower third (y1 < 0.66) → from above, whatever cx.
    expect(
      buildRevealMotionPrompt([instance("range hood", [0.4, 0.1, 0.6, 0.4], 0.05)]),
    ).toContain("the range hood drops down from above");
    // Grounded boxes: the horizontal center picks the side.
    expect(
      buildRevealMotionPrompt([instance("cabinet", [0.0, 0.3, 0.3, 0.95], 0.2)]),
    ).toContain("the cabinet slides in from the left");
    expect(
      buildRevealMotionPrompt([instance("oven", [0.75, 0.3, 0.95, 0.9], 0.1)]),
    ).toContain("the oven slides in from the right");
    expect(
      buildRevealMotionPrompt([instance("dining table", [0.35, 0.4, 0.65, 0.9], 0.2)]),
    ).toContain("the dining table slides in from the back of the room");
  });

  it("names at most the 5 largest instances and sums up the rest", () => {
    const six = [
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("refrigerator", [0.8, 0.2, 1.0, 0.9], 0.5),
      instance("dining table", [0.35, 0.5, 0.65, 0.9], 0.4),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
      instance("range hood", [0.4, 0.1, 0.6, 0.4], 0.2),
      instance("kettle", [0.45, 0.5, 0.5, 0.7], 0.01),
    ];
    const prompt = buildRevealMotionPrompt(six);
    expect(prompt).toContain("the cabinet");
    expect(prompt).toContain("the refrigerator");
    expect(prompt).toContain("the dining table");
    expect(prompt).toContain("the oven");
    expect(prompt).toContain("the range hood");
    expect(prompt).not.toContain("kettle"); // 6th by area → not named
    expect(prompt).toContain("the smaller pieces settle into place last");
  });

  it("omits the overflow sentence when 5 or fewer instances are given", () => {
    const prompt = buildRevealMotionPrompt([
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
    ]);
    expect(prompt).not.toContain("smaller pieces");
  });

  it("ranks by area, not input order (the biggest objects get named)", () => {
    const prompt = buildRevealMotionPrompt([
      instance("kettle", [0.45, 0.5, 0.5, 0.7], 0.01),
      instance("toaster", [0.5, 0.5, 0.55, 0.7], 0.02),
      instance("pot", [0.4, 0.5, 0.45, 0.7], 0.015),
      instance("pan", [0.3, 0.5, 0.35, 0.7], 0.012),
      instance("vase", [0.6, 0.5, 0.65, 0.7], 0.011),
      instance("cabinet", [0.0, 0.3, 0.4, 0.95], 0.9), // largest, listed last
    ]);
    expect(prompt).toContain("the cabinet");
    expect(prompt).not.toContain("kettle"); // now the smallest of the six
  });

  it("merges identical labels into one plural clause with the largest occurrence's direction", () => {
    const prompt = buildRevealMotionPrompt([
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6), // largest → left
      instance("cabinet", [0.8, 0.3, 1.0, 0.9], 0.2), // right, loses the vote
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
    ]);
    expect(prompt).toContain("the cabinets slide in from the left");
    // Merged: no singular leftover clause for the second cabinet.
    expect(prompt).not.toContain("the cabinet slides");
    expect(prompt).toContain("the oven slides in from the right");
  });

  it("pluralizes the drop direction too when merged labels come from above", () => {
    const prompt = buildRevealMotionPrompt([
      instance("shelf", [0.1, 0.1, 0.3, 0.4], 0.3),
      instance("shelf", [0.6, 0.1, 0.8, 0.4], 0.2),
    ]);
    expect(prompt).toContain("the shelfs drop down from above"); // naive plural, by design
  });

  it("does not double-pluralize labels already ending in s", () => {
    const prompt = buildRevealMotionPrompt([
      instance("kitchen utensils", [0.0, 0.3, 0.3, 0.9], 0.3),
      instance("kitchen utensils", [0.7, 0.3, 1.0, 0.9], 0.2),
    ]);
    expect(prompt).toContain("the kitchen utensils slide in from the left");
    expect(prompt).not.toContain("utensilss");
  });

  it("always ends with the verbatim anti-morphing tail", () => {
    const prompt = buildRevealMotionPrompt([
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
    ]);
    expect(prompt.endsWith(ANTI_MORPHING_TAIL)).toBe(true);
  });

  it("is deterministic (same input → same output)", () => {
    const instances = [
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
      instance("range hood", [0.4, 0.1, 0.6, 0.4], 0.2),
    ];
    expect(buildRevealMotionPrompt(instances)).toBe(
      buildRevealMotionPrompt(instances),
    );
  });

  it("does not mutate the input array (the sort works on a copy)", () => {
    const instances = [
      instance("kettle", [0.45, 0.5, 0.5, 0.7], 0.01),
      instance("cabinet", [0.0, 0.3, 0.4, 0.95], 0.9),
    ];
    buildRevealMotionPrompt(instances);
    expect(instances[0].label).toBe("kettle"); // original order untouched
  });

  it("stays well under ~1500 chars even on 15 instances with long labels", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      instance(
        `kitchen island cabinet ${i}`,
        [0.1, 0.2, 0.9, 0.95],
        1 - i * 0.05,
      ),
    );
    const prompt = buildRevealMotionPrompt(many);
    expect(prompt.length).toBeLessThan(1500);
    expect(prompt).toContain("the smaller pieces settle into place last");
  });
});

describe("buildTimelapsePrompt (pure builder, Story 4.9)", () => {
  /** Every timelapse prompt must carry these clauses (AC 2a–2d), list or not. */
  function expectMandatoryClauses(prompt: string): void {
    expect(prompt).toContain("time-lapse"); // move-in time-lapse framing
    expect(prompt.toLowerCase()).toContain("movers"); // human causal mechanism
    expect(prompt).toContain("static camera"); // explicit camera constraint…
    expect(prompt).toContain("no camera movement, no pan, no zoom"); // …in full
    expect(prompt).toContain("Realistic human motion at time-lapse speed");
  }

  it("returns the generic timelapse constant when instances is undefined (fallback)", () => {
    expect(buildTimelapsePrompt(undefined)).toBe(REVEAL_TIMELAPSE_PROMPT);
    expect(buildTimelapsePrompt()).toBe(REVEAL_TIMELAPSE_PROMPT);
  });

  it("returns the generic timelapse constant for an empty array (fallback)", () => {
    expect(buildTimelapsePrompt([])).toBe(REVEAL_TIMELAPSE_PROMPT);
  });

  it("never falls back to REVEAL_MOTION_PROMPT (a different reveal, not this one)", () => {
    expect(REVEAL_TIMELAPSE_PROMPT).not.toBe(REVEAL_MOTION_PROMPT);
    expect(buildTimelapsePrompt()).not.toBe(REVEAL_MOTION_PROMPT);
  });

  it("carries the mandatory clauses on the generic fallback", () => {
    expectMandatoryClauses(REVEAL_TIMELAPSE_PROMPT);
  });

  it("carries the mandatory clauses with instances too", () => {
    expectMandatoryClauses(
      buildTimelapsePrompt([instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6)]),
    );
  });

  it("names at most the 5 largest instances in the furniture list", () => {
    const six = [
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("refrigerator", [0.8, 0.2, 1.0, 0.9], 0.5),
      instance("dining table", [0.35, 0.5, 0.65, 0.9], 0.4),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
      instance("range hood", [0.4, 0.1, 0.6, 0.4], 0.2),
      instance("kettle", [0.45, 0.5, 0.5, 0.7], 0.01),
    ];
    const prompt = buildTimelapsePrompt(six);
    expect(prompt).toContain("the cabinet");
    expect(prompt).toContain("the refrigerator");
    expect(prompt).toContain("the dining table");
    expect(prompt).toContain("the oven");
    expect(prompt).toContain("the range hood");
    expect(prompt).not.toContain("kettle"); // 6th by area → not in the list
  });

  it("ranks by area, not input order (the biggest objects get named)", () => {
    const prompt = buildTimelapsePrompt([
      instance("kettle", [0.45, 0.5, 0.5, 0.7], 0.01),
      instance("toaster", [0.5, 0.5, 0.55, 0.7], 0.02),
      instance("pot", [0.4, 0.5, 0.45, 0.7], 0.015),
      instance("pan", [0.3, 0.5, 0.35, 0.7], 0.012),
      instance("vase", [0.6, 0.5, 0.65, 0.7], 0.011),
      instance("cabinet", [0.0, 0.3, 0.4, 0.95], 0.9), // largest, listed last
    ]);
    expect(prompt).toContain("the cabinet");
    expect(prompt).not.toContain("kettle"); // now the smallest of the six
  });

  it("merges identical labels into one naive-plural entry", () => {
    const prompt = buildTimelapsePrompt([
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("cabinet", [0.8, 0.3, 1.0, 0.9], 0.2),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
    ]);
    expect(prompt).toContain("the cabinets");
    expect(prompt).not.toContain("the cabinet,"); // merged: no singular leftover
    expect(prompt).toContain("the oven");
  });

  it("does not double-pluralize labels already ending in s", () => {
    const prompt = buildTimelapsePrompt([
      instance("kitchen utensils", [0.0, 0.3, 0.3, 0.9], 0.3),
      instance("kitchen utensils", [0.7, 0.3, 1.0, 0.9], 0.2),
    ]);
    expect(prompt).toContain("the kitchen utensils");
    expect(prompt).not.toContain("utensilss");
  });

  it("pluralizes -f labels correctly (shelf → shelves — a real FURNITURE_CATEGORIES entry)", () => {
    const prompt = buildTimelapsePrompt([
      instance("shelf", [0.0, 0.1, 0.3, 0.4], 0.3),
      instance("shelf", [0.7, 0.1, 1.0, 0.4], 0.2),
    ]);
    expect(prompt).toContain("the shelves");
    expect(prompt).not.toContain("shelfs");
  });

  it("filters blank labels; all-blank falls back to the generic constant", () => {
    const mixed = buildTimelapsePrompt([
      instance("  ", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
    ]);
    expect(mixed).toContain("the oven");
    expect(mixed).not.toContain("the ,"); // no empty list entry

    expect(
      buildTimelapsePrompt([instance("", [0.0, 0.3, 0.3, 0.9], 0.6)]),
    ).toBe(REVEAL_TIMELAPSE_PROMPT);
  });

  it("does NOT reuse the anti-morphing tail (its early-landing clause contradicts the carry)", () => {
    expect(REVEAL_TIMELAPSE_PROMPT).not.toContain("rush in early");
    expect(
      buildTimelapsePrompt([instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6)]),
    ).not.toContain("rush in early");
  });

  it("is deterministic (same input → same output)", () => {
    const instances = [
      instance("cabinet", [0.0, 0.3, 0.3, 0.9], 0.6),
      instance("oven", [0.7, 0.4, 0.9, 0.9], 0.3),
      instance("range hood", [0.4, 0.1, 0.6, 0.4], 0.2),
    ];
    expect(buildTimelapsePrompt(instances)).toBe(buildTimelapsePrompt(instances));
  });

  it("does not mutate the input array (the sort works on a copy)", () => {
    const instances = [
      instance("kettle", [0.45, 0.5, 0.5, 0.7], 0.01),
      instance("cabinet", [0.0, 0.3, 0.4, 0.95], 0.9),
    ];
    buildTimelapsePrompt(instances);
    expect(instances[0].label).toBe("kettle"); // original order untouched
  });
});
