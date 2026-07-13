import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";
import { GenerationProvider } from "@/state/generation-context";

function renderHome() {
  return render(
    <GenerationProvider>
      <HomePage />
    </GenerationProvider>,
  );
}

describe("RoomReveal shell (smoke test)", () => {
  it("renders the small-screen guard message", () => {
    renderHome();

    expect(
      screen.getByText("RoomReveal est conçu pour un écran d'ordinateur"),
    ).toBeDefined();
  });
});
