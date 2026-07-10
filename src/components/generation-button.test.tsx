import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenerationButton } from "./generation-button";

describe("GenerationButton (UX-DR13)", () => {
  it("is disabled and wraps in a focusable tooltip trigger when the precondition is not met", () => {
    render(
      <GenerationButton disabled tooltip="Peignez au moins une zone">
        Valider le Masque
      </GenerationButton>,
    );
    const button = screen.getByText("Valider le Masque").closest("button");
    expect(button?.hasAttribute("disabled")).toBe(true);
    // The disabled button is wrapped in a focusable span so the precondition
    // tooltip stays reachable (a disabled button swallows pointer events).
    const trigger = document.querySelector('[data-slot="tooltip-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("tabindex")).toBe("0");
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(
      <GenerationButton onClick={onClick}>Créer ma vidéo</GenerationButton>,
    );
    fireEvent.click(screen.getByText("Créer ma vidéo"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
