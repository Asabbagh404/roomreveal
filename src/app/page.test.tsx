import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("RoomReveal shell (smoke test)", () => {
  it("renders the wizard shell with the privacy footer line", () => {
    render(<HomePage />);

    expect(
      screen.getByText(
        "Vos photos sont supprimées automatiquement après 24 heures.",
      ),
    ).toBeDefined();
  });

  it("renders the small-screen guard message", () => {
    render(<HomePage />);

    expect(
      screen.getByText("RoomReveal est conçu pour un écran d'ordinateur"),
    ).toBeDefined();
  });
});
