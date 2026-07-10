import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "./error-banner";

describe("ErrorBanner (FR-17, UX-DR12)", () => {
  it("error variant shows the message, a single retry action and an alert role", () => {
    const onRetry = vi.fn();
    render(
      <ErrorBanner
        message="La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez."
        variant="error"
        step="video"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toBeDefined();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1); // exactly one action
    fireEvent.click(buttons[0]);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("uses the step-specific retry label", () => {
    render(
      <ErrorBanner message="x" variant="error" step="inpaint" onRetry={() => {}} />,
    );
    expect(screen.getByText("Relancer la pièce vide")).toBeDefined();
  });

  it("neutral variant (aucun meuble) is not an alert and has no action", () => {
    render(
      <ErrorBanner
        message="Aucun meuble détecté. Peignez vous-même les zones à faire disparaître."
        variant="neutral"
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(/Aucun meuble détecté/),
    ).toBeDefined();
  });
});
