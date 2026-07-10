import { describe, expect, it } from "vitest";
import { waitPhaseLabel } from "./wait-copy";

describe("waitPhaseLabel (pure, AD-14 per-step translation)", () => {
  it("names the video-step phases per EXPERIENCE.md", () => {
    expect(waitPhaseLabel("video", "uploading")).toBe("Envoi de vos images");
    expect(waitPhaseLabel("video", "queued")).toBe("Génération de la Révélation");
    expect(waitPhaseLabel("video", "generating")).toBe("Génération de la Révélation");
    expect(waitPhaseLabel("video", "finalizing")).toBe("Finalisation");
  });

  it("names the detection phase at the mask step", () => {
    expect(waitPhaseLabel("mask", "generating")).toBe("Détection des meubles…");
  });

  it("names the inpainting phase at the emptyRoom step", () => {
    expect(waitPhaseLabel("emptyRoom", "generating")).toBe(
      "Génération de la Pièce vide…",
    );
  });

  it("never leaks technical jargon", () => {
    const labels = (["mask", "emptyRoom", "video"] as const).flatMap((s) =>
      (["uploading", "queued", "generating", "finalizing"] as const).map((p) =>
        waitPhaseLabel(s, p),
      ),
    );
    for (const label of labels) {
      expect(label).not.toMatch(/wait|phase|timeout|queue|upload\b|generating/i);
    }
  });
});
