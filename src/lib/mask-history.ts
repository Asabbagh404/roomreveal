/**
 * Undo/redo history for the mask editor (UX-DR8: 20 actions). Per AD-13 this
 * stack is UI-local state — it lives in the component, NOT the reducer, and is
 * assumed lost on navigation (only the current buffer survives, in
 * generation.maskDraft). Pure and immutable; generic over the buffer type so it
 * stays a leaf with no state/ coupling. Fully jsdom-testable.
 */

/** Maximum number of undoable actions retained (UX-DR8). */
export const MAX_HISTORY = 20;

/**
 * A linear history: `stack[cursor]` is the current state. Undo moves the cursor
 * back, redo forward. Pushing truncates any redo tail and appends, capping the
 * retained length at MAX_HISTORY + 1 states (MAX_HISTORY reversible steps).
 */
export interface History<T> {
  stack: readonly T[];
  cursor: number;
}

export function createHistory<T>(initial: T): History<T> {
  return { stack: [initial], cursor: 0 };
}

export function current<T>(history: History<T>): T {
  return history.stack[history.cursor];
}

export function canUndo<T>(history: History<T>): boolean {
  return history.cursor > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.cursor < history.stack.length - 1;
}

/** Appends a new current state, dropping the redo tail and capping length. */
export function push<T>(history: History<T>, next: T): History<T> {
  // Drop any redo tail (states after the cursor become unreachable), then
  // append — built immutably (no in-place mutation, project rule).
  const kept = [...history.stack.slice(0, history.cursor + 1), next];
  // Cap: keep at most MAX_HISTORY + 1 states so undo covers MAX_HISTORY steps.
  const stack =
    kept.length > MAX_HISTORY + 1
      ? kept.slice(kept.length - (MAX_HISTORY + 1))
      : kept;
  return { stack, cursor: stack.length - 1 };
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  return { stack: history.stack, cursor: history.cursor - 1 };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  return { stack: history.stack, cursor: history.cursor + 1 };
}
