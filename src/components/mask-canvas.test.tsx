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

describe("MaskCanvas click-to-select (Story 5.6)", () => {
  /** Give the viewport a real box so screenToBuffer yields finite coords. */
  function withRect(el: HTMLElement) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1024, height: 768, right: 1024, bottom: 768, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }

  it("does not show the Sélection tool unless selectable", () => {
    renderCanvas();
    expect(screen.queryByRole("button", { name: /Sélection/ })).toBeNull();
  });

  it("shows the Sélection tool when selectable", () => {
    renderCanvas({ selectable: true });
    expect(screen.getByRole("button", { name: /Sélection/ })).toBeDefined();
  });

  it("in select mode a click (no drag) emits a point region and commits no stroke", () => {
    const onCommit = vi.fn();
    const onSelect = vi.fn();
    render(
      <MaskCanvas
        backgroundUrl="blob:bg"
        width={1024}
        height={768}
        buffer={createBlankBuffer(1024, 768)}
        epoch={0}
        onCommit={onCommit}
        selectable
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sélection/ }));
    const overlay = screen.getByLabelText("Masque");
    const viewport = overlay.parentElement!.parentElement!;
    withRect(viewport);
    // Down then up at the same spot → a click, not a drag → point region.
    fireEvent.pointerDown(viewport, { clientX: 512, clientY: 384, pointerId: 1 });
    fireEvent.pointerUp(viewport, { clientX: 512, clientY: 384, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledOnce();
    const region = onSelect.mock.calls[0][0];
    expect(region.kind).toBe("point");
    expect(region.x).toBeCloseTo(512);
    expect(region.y).toBeCloseTo(384);
    expect(onCommit).not.toHaveBeenCalled(); // select never paints
  });

  it("in select mode a drag emits a box region enclosing the dragged rectangle", () => {
    const onSelect = vi.fn();
    render(
      <MaskCanvas
        backgroundUrl="blob:bg"
        width={1024}
        height={768}
        buffer={createBlankBuffer(1024, 768)}
        epoch={0}
        onCommit={vi.fn()}
        selectable
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sélection/ }));
    const overlay = screen.getByLabelText("Masque");
    const viewport = overlay.parentElement!.parentElement!;
    withRect(viewport);
    // A real drag from (100,100) to (400,300) → box region.
    fireEvent.pointerDown(viewport, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(viewport, { clientX: 400, clientY: 300, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledOnce();
    const region = onSelect.mock.calls[0][0];
    expect(region.kind).toBe("box");
    expect(region.x0).toBeCloseTo(100);
    expect(region.y0).toBeCloseTo(100);
    expect(region.x1).toBeCloseTo(400);
    expect(region.y1).toBeCloseTo(300);
  });

  it("records a landed selection as an undoable step (↶ removes it)", () => {
    const onCommit = vi.fn();
    const b0 = createBlankBuffer(4, 4);
    const b1 = { data: new Uint8Array(16).fill(255), width: 4, height: 4 };
    const { rerender } = render(
      <MaskCanvas
        backgroundUrl="blob:bg"
        width={4}
        height={4}
        buffer={b0}
        epoch={0}
        onCommit={onCommit}
        selectable
        onSelect={vi.fn()}
        selecting={false}
      />,
    );
    // Undo is disabled with only the seed in history.
    const undo = screen.getByRole("button", { name: /Annuler/ });
    expect(undo.hasAttribute("disabled")).toBe(true);

    // Segmentation in flight, then it lands with a new (unioned) buffer.
    rerender(
      <MaskCanvas backgroundUrl="blob:bg" width={4} height={4} buffer={b0} epoch={0} onCommit={onCommit} selectable onSelect={vi.fn()} selecting />,
    );
    rerender(
      <MaskCanvas backgroundUrl="blob:bg" width={4} height={4} buffer={b1} epoch={0} onCommit={onCommit} selectable onSelect={vi.fn()} selecting={false} />,
    );

    // The landed selection is now an undoable step.
    expect(undo.hasAttribute("disabled")).toBe(false);
    onCommit.mockClear();
    fireEvent.click(undo);
    // Undo reverts to the pre-selection buffer, removing the selection.
    expect(onCommit).toHaveBeenCalledWith(b0);
  });

  it("ignores a second gesture while a segmentation is in flight (selecting)", () => {
    const onSelect = vi.fn();
    render(
      <MaskCanvas
        backgroundUrl="blob:bg"
        width={1024}
        height={768}
        buffer={createBlankBuffer(1024, 768)}
        epoch={0}
        onCommit={vi.fn()}
        selectable
        onSelect={onSelect}
        selecting
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sélection/ }));
    const overlay = screen.getByLabelText("Masque");
    const viewport = overlay.parentElement!.parentElement!;
    withRect(viewport);
    fireEvent.pointerDown(viewport, { clientX: 512, clientY: 384, pointerId: 1 });
    fireEvent.pointerUp(viewport, { clientX: 512, clientY: 384, pointerId: 1 });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
