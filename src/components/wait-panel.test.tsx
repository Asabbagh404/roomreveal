import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WaitPanel } from "./wait-panel";
import { GenerationProvider } from "@/state/generation-context";
import type { Generation } from "@/state/types";

function seed(state: Generation) {
  return render(
    <GenerationProvider initialState={state}>
      <WaitPanel />
    </GenerationProvider>,
  );
}

describe("WaitPanel (FR-14, UX-DR11)", () => {
  it("shows the named phase, no fake percentage and no mute spinner", () => {
    seed({ step: "video", epoch: 1, waitPhase: "generating" });
    expect(screen.getByText("Génération de la Révélation")).toBeDefined();
    // No literal percentage text anywhere.
    expect(screen.queryByText(/%/)).toBeNull();
    // Bar is a progressbar element (a real milestone), not a bare spinner.
    expect(document.querySelector('[data-slot="progress"]')).not.toBeNull();
  });

  it("announces 1 to 3 minutes on the video step", () => {
    seed({ step: "video", epoch: 1, waitPhase: "generating" });
    expect(
      screen.getByText("Votre Révélation se prépare — comptez 1 à 3 minutes."),
    ).toBeDefined();
  });

  describe("with fake timers", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("adds the reassuring line past 3 min 30 s", () => {
      seed({ step: "video", epoch: 1, waitPhase: "generating" });
      expect(screen.queryByText(/plus long que prévu/)).toBeNull();
      act(() => {
        vi.advanceTimersByTime(211_000);
      });
      expect(screen.getByText(/plus long que prévu/)).toBeDefined();
    });

    it("shows an elapsed time that increases as the wait continues", () => {
      seed({ step: "video", epoch: 1, waitPhase: "generating" });
      act(() => {
        vi.advanceTimersByTime(75_000); // 1 min 15 s
      });
      expect(screen.getByText("1 min 15 s")).toBeDefined();
    });
  });
});
