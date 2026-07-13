import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper, hasDownstreamArtifacts, isReachableAhead } from "./stepper";
import { GenerationProvider, useGeneration } from "@/state/generation-context";
import type { Generation } from "@/state/types";

describe("Stepper rendering (AC4)", () => {
  // The four-step Parcours stepper is the reveal mode (Story 5.1); seed it.
  const revealUpload: Generation = { step: "upload", epoch: 0, mode: "reveal" };

  it("renders the four Parcours labels", () => {
    render(
      <GenerationProvider initialState={revealUpload}>
        <Stepper />
      </GenerationProvider>,
    );
    for (const label of ["Upload", "Masque", "Pièce vide", "Vidéo"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("marks the initial step (Upload) as aria-current and later steps disabled", () => {
    render(
      <GenerationProvider initialState={revealUpload}>
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
    mode: "reveal",
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
    mode: "reveal",
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

describe("Stepper mode adaptation (Story 5.1, AC4)", () => {
  it("shows only the brand (no 4-step Parcours) on the home screen (mode undefined)", () => {
    render(
      <GenerationProvider initialState={{ step: "upload", epoch: 0 }}>
        <Stepper />
      </GenerationProvider>,
    );
    expect(screen.getByText("RoomReveal")).toBeDefined();
    expect(screen.queryByText("Masque")).toBeNull();
    expect(screen.queryByText("Vidéo")).toBeNull();
  });

  it("shows a simplified indicator (no « 4/4 » Parcours) in edit mode", () => {
    render(
      <GenerationProvider
        initialState={{ step: "editor", epoch: 1, mode: "edit" }}
      >
        <Stepper />
      </GenerationProvider>,
    );
    expect(screen.getByText("Photo")).toBeDefined();
    expect(screen.getByText("Édition")).toBeDefined();
    // The reveal Parcours labels must not appear in edit mode.
    expect(screen.queryByText("Pièce vide")).toBeNull();
    expect(screen.queryByText("Vidéo")).toBeNull();
  });

  it("« Photo » navigates back to upload from the editor (no dead end)", () => {
    function Probe() {
      const { state } = useGeneration();
      return <span data-testid="step">{state.step}</span>;
    }
    render(
      <GenerationProvider
        initialState={{ step: "editor", epoch: 1, mode: "edit" }}
      >
        <Stepper />
        <Probe />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByText("Photo"));
    expect(screen.getByTestId("step").textContent).toBe("upload");
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
