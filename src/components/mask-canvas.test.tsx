import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MaskCanvas } from "./mask-canvas";
import { createBlankBuffer } from "@/lib/mask-buffer";

// jsdom has no real 2D canvas and returns zero-size rects, so pixel painting
// (and the onCommit it triggers) is covered by live verification, not here.
// These tests lock the controlled wiring: rendering, toolbar, keyboard, guards.
function renderCanvas(overrides: Partial<React.ComponentProps<typeof MaskCanvas>> = {}) {
  const onCommit = vi.fn();
  render(
    <MaskCanvas
      backgroundUrl="blob:bg"
      width={1024}
      height={768}
      buffer={createBlankBuffer(1024, 768)}
      epoch={0}
      onCommit={onCommit}
      {...overrides}
    />,
  );
  return { onCommit };
}

describe("MaskCanvas (Story 5.2 — controlled reusable canvas)", () => {
  it("renders the background image with its alt text", () => {
    renderCanvas({ backgroundAlt: "Image de travail" });
    const img = screen.getByAltText("Image de travail") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:bg");
  });

  it("defaults the background alt to « Votre photo »", () => {
    renderCanvas();
    expect(screen.getByAltText("Votre photo")).toBeDefined();
  });

  it("renders the mask overlay and the toolbar (brush/eraser)", () => {
    renderCanvas();
    expect(screen.getByLabelText("Masque")).toBeDefined();
    expect(screen.getByRole("button", { name: "Pinceau (B)" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Gomme (E)" })).toBeDefined();
  });

  it("keyboard E/B switches the active tool (aria-pressed)", () => {
    renderCanvas();
    const brush = screen.getByRole("button", { name: "Pinceau (B)" });
    const eraser = screen.getByRole("button", { name: "Gomme (E)" });
    // Brush is active by default.
    expect(brush.getAttribute("aria-pressed")).toBe("true");
    expect(eraser.getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(document.body, { key: "e" });
    expect(eraser.getAttribute("aria-pressed")).toBe("true");
    expect(brush.getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(document.body, { key: "b" });
    expect(brush.getAttribute("aria-pressed")).toBe("true");
  });

  it("keyboard ] increases and [ decreases the brush size (both keys)", () => {
    renderCanvas();
    expect(screen.getByText("32 px")).toBeDefined();
    fireEvent.keyDown(document.body, { key: "]" });
    expect(screen.getByText("36 px")).toBeDefined(); // +1 step (stepBrush = 4)
    fireEvent.keyDown(document.body, { key: "[" });
    fireEvent.keyDown(document.body, { key: "[" });
    expect(screen.getByText("28 px")).toBeDefined(); // back to 32, then -1 step
  });

  it("with an undefined buffer, a pointer press commits nothing and does not crash", () => {
    const { onCommit } = renderCanvas({ buffer: undefined });
    const overlay = screen.getByLabelText("Masque");
    const viewport = overlay.parentElement!.parentElement!;
    fireEvent.pointerDown(viewport, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(viewport, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
