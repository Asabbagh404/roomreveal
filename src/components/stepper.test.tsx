import { fireEvent, render, screen } from "@testing-library/react";
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

describe("Stepper re-advance confirmation (AC3)", () => {
  // User went back to "mask" while emptyRoom + reveal (downstream) still exist.
  const wentBack: Generation = {
    step: "mask",
    epoch: 1,
    originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    mask: "fal://mask",
    emptyRoom: "fal://empty",
    reveal: "fal://reveal",
  };

  it("opens the confirmation Dialog when re-advancing would discard artifacts", () => {
    render(
      <GenerationProvider initialState={wentBack}>
        <Stepper />
      </GenerationProvider>,
    );
    // "Pièce vide" is ahead of current (mask) but still reachable (emptyRoom present).
    fireEvent.click(screen.getByText("Pièce vide").closest("button")!);
    expect(screen.getByText("Continuer le Parcours ?")).toBeDefined();
  });

  it("Annuler closes the Dialog without advancing (still at mask)", () => {
    render(
      <GenerationProvider initialState={wentBack}>
        <Stepper />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByText("Pièce vide").closest("button")!);
    fireEvent.click(screen.getByText("Annuler"));
    // aria-current stays on the mask step — no advance happened.
    expect(screen.getByText("Masque").closest("button")?.getAttribute("aria-current")).toBe("step");
  });

  it("Continuer advances to the reopened step and invalidates downstream (reveal gone)", () => {
    render(
      <GenerationProvider initialState={wentBack}>
        <Stepper />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByText("Pièce vide").closest("button")!);
    fireEvent.click(screen.getByText("Continuer"));
    // Now at emptyRoom; "Vidéo" is a future inert step again (reveal invalidated).
    expect(screen.getByText("Pièce vide").closest("button")?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("Vidéo").closest("button")?.hasAttribute("disabled")).toBe(true);
  });
});

describe("Stepper terminal completion — 4/4 coché (Story 4.2)", () => {
  const atVideo = (reveal?: string): Generation => ({
    step: "video",
    epoch: 2,
    mask: "fal://mask",
    emptyRoom: "fal://empty",
    ...(reveal ? { reveal } : {}),
  });

  it("ticks the Vidéo step (current AND checked) once the Révélation is ready", () => {
    render(
      <GenerationProvider initialState={atVideo("fal://reveal")}>
        <Stepper />
      </GenerationProvider>,
    );
    const video = screen.getByText("Vidéo").closest("button");
    expect(video?.getAttribute("aria-current")).toBe("step"); // still current (gold)
    expect(video?.textContent).not.toContain("4"); // number replaced by the check
  });

  it("shows the number (not a check) on the Vidéo step while still generating", () => {
    render(
      <GenerationProvider initialState={atVideo()}>
        <Stepper />
      </GenerationProvider>,
    );
    expect(screen.getByText("Vidéo").closest("button")?.textContent).toContain("4");
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
