import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper, hasDownstreamArtifacts, isReachableAhead } from "./stepper";
import { GenerationProvider } from "@/state/generation-context";
import type { Generation } from "@/state/types";

describe("Stepper rendering (AC4)", () => {
  it("renders the four Parcours labels", () => {
    render(
      <GenerationProvider>
        <Stepper />
      </GenerationProvider>,
    );
    for (const label of ["Upload", "Masque", "Pièce vide", "Vidéo"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("marks the initial step (Upload) as aria-current and later steps disabled", () => {
    render(
      <GenerationProvider>
        <Stepper />
      </GenerationProvider>,
    );
    const upload = screen.getByText("Upload").closest("button");
    expect(upload?.getAttribute("aria-current")).toBe("step");

    // Masque/Pièce vide/Vidéo are future & inert at the initial state.
    const video = screen.getByText("Vidéo").closest("button");
    expect(video?.hasAttribute("disabled")).toBe(true);
  });
});

describe("stepper reachability helpers (pure)", () => {
  const withArtifacts: Generation = {
    step: "mask",
    epoch: 1,
    mask: "fal://mask",
    emptyRoom: "fal://empty",
    reveal: "fal://reveal",
  };

  it("isReachableAhead is true only when the step's artifact exists", () => {
    expect(isReachableAhead(withArtifacts, "emptyRoom")).toBe(true);
    expect(isReachableAhead(withArtifacts, "video")).toBe(true);
    expect(isReachableAhead({ step: "mask", epoch: 0 }, "emptyRoom")).toBe(false);
  });

  it("hasDownstreamArtifacts detects artifacts at risk when advancing", () => {
    expect(hasDownstreamArtifacts(withArtifacts, "mask")).toBe(true);
    expect(hasDownstreamArtifacts({ step: "mask", epoch: 0 }, "mask")).toBe(false);
  });
});
