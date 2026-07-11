import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  canRedo,
  canUndo,
  createHistory,
  current,
  push,
  redo,
  undo,
} from "./mask-history";

describe("mask-history (pure, UX-DR8 20 actions)", () => {
  it("starts at the initial state with nothing to undo/redo", () => {
    const h = createHistory("a");
    expect(current(h)).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("push then undo/redo restores the right state", () => {
    let h = createHistory("a");
    h = push(h, "b");
    expect(current(h)).toBe("b");
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(current(h)).toBe("a");
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(current(h)).toBe("b");
  });

  it("push after an undo drops the redo tail", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = push(h, "c");
    h = undo(h); // back to "b", redo → "c" available
    expect(canRedo(h)).toBe(true);
    h = push(h, "d"); // diverge
    expect(current(h)).toBe("d");
    expect(canRedo(h)).toBe(false); // "c" is gone
    h = undo(h);
    expect(current(h)).toBe("b");
  });

  it("caps retained history at MAX_HISTORY reversible steps", () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 5; i++) h = push(h, i);
    expect(current(h)).toBe(MAX_HISTORY + 5);
    // Undo as far as possible — exactly MAX_HISTORY steps are retained.
    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(MAX_HISTORY);
    // The oldest reachable state is not the original 0 (it was dropped).
    expect(current(h)).toBe(5);
  });

  it("keeps the original at exactly MAX_HISTORY pushes, drops it at MAX_HISTORY+1", () => {
    let exact = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY; i++) exact = push(exact, i);
    while (canUndo(exact)) exact = undo(exact);
    expect(current(exact)).toBe(0); // original still reachable

    let over = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 1; i++) over = push(over, i);
    while (canUndo(over)) over = undo(over);
    expect(current(over)).toBe(1); // original 0 dropped
  });

  it("undo/redo at the bounds are no-ops", () => {
    const h = createHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
