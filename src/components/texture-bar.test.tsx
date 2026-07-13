import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextureBar } from "./texture-bar";

// NOTE: this project's test setup (src/test-setup.ts) does NOT load
// @testing-library/jest-dom, so matchers like toBeInTheDocument /
// toHaveAttribute are unavailable. Following the repo convention
// (see error-banner.test.tsx) we assert with native vitest matchers.
describe("TextureBar", () => {
  it("renders a radiogroup with « Aucune » plus every texture", () => {
    render(<TextureBar selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: /texture/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /aucune/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /bois/i })).toBeDefined();
  });

  it("marks the selected texture as checked", () => {
    render(<TextureBar selectedId="bois" onSelect={vi.fn()} />);
    expect(
      screen.getByRole("radio", { name: /bois/i }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: /aucune/i })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("calls onSelect with the id on click, and null for « Aucune »", () => {
    const onSelect = vi.fn();
    render(<TextureBar selectedId="bois" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: /bois/i }));
    expect(onSelect).toHaveBeenCalledWith("bois");
    fireEvent.click(screen.getByRole("radio", { name: /aucune/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
