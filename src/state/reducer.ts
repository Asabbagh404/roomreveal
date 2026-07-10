import {
  type Generation,
  type OriginalPhoto,
  type Step,
  type StepError,
  type WaitPhase,
  STEP_ORDER,
  WAIT_PHASE_ORDER,
} from "./types";

/** Initial Generation: at Upload, epoch 0, no artifacts (AD-3). */
export const initialGeneration: Generation = {
  step: "upload",
  epoch: 0,
};

/**
 * Actions dispatched to the Generation reducer. Only the transitions needed for
 * Epic 1 are defined here; detect/inpaint/video result actions arrive with
 * their epics. The reducer is pure — no effects, no fal calls (AD-12: effects
 * live in src/state/effects.ts, created later).
 */
export type GenerationAction =
  | { type: "PHOTO_NORMALIZED"; photo: OriginalPhoto }
  | { type: "GO_TO_STEP"; step: Step }
  | { type: "CONFIRM_ADVANCE_FROM"; step: Step }
  | { type: "SET_WAIT_PHASE"; phase: WaitPhase }
  | { type: "SET_ERROR"; error: StepError }
  | { type: "CLEAR_ERROR" };

function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

/** Clears every artifact strictly downstream of `step` (AD-11). */
function invalidateDownstream(
  state: Generation,
  step: Step,
): Partial<Generation> {
  const from = stepIndex(step);
  const cleared: Partial<Generation> = {};
  // mask belongs to the "mask" step, emptyRoom to "emptyRoom", reveal to "video".
  if (from < stepIndex("mask")) cleared.mask = undefined;
  if (from < stepIndex("emptyRoom")) cleared.emptyRoom = undefined;
  if (from < stepIndex("video")) cleared.reveal = undefined;
  return cleared;
}

/**
 * Pure reducer for the Generation state machine.
 *
 * Invalidation semantics (AD-11) live here and nowhere else:
 * - GO_TO_STEP preserves every artifact (back-navigation is lossless, FR-15).
 * - CONFIRM_ADVANCE_FROM invalidates downstream artifacts and bumps epoch.
 * - SET_ERROR never destroys upstream artifacts (AD-8).
 * WaitPhase monotonicity per attempt is enforced (AD-14).
 */
export function generationReducer(
  state: Generation,
  action: GenerationAction,
): Generation {
  switch (action.type) {
    case "PHOTO_NORMALIZED":
      // A new photo is a fresh Generation attempt: every downstream artifact
      // that belonged to the previous photo is now stale and must be dropped
      // (AD-11), and the epoch is bumped so any in-flight prior job is discarded
      // (AD-12). Only originalPhoto survives, at the mask step.
      return {
        ...state,
        ...invalidateDownstream(state, "upload"),
        originalPhoto: action.photo,
        maskDraft: undefined,
        step: "mask",
        epoch: state.epoch + 1,
        error: undefined,
        waitPhase: undefined,
      };

    case "GO_TO_STEP":
      // Back (or same) navigation only: never advance, never touch artifacts.
      // Clear transient per-attempt fields (error, waitPhase) — a preserved
      // waitPhase would otherwise make AD-14 monotonicity reject the next attempt.
      if (stepIndex(action.step) > stepIndex(state.step)) return state;
      return { ...state, step: action.step, error: undefined, waitPhase: undefined };

    case "CONFIRM_ADVANCE_FROM": {
      const next = { ...state, ...invalidateDownstream(state, action.step) };
      return {
        ...next,
        step: action.step,
        epoch: state.epoch + 1,
        waitPhase: undefined,
        error: undefined,
      };
    }

    case "SET_WAIT_PHASE": {
      // Monotonic per attempt: refuse a regressive phase (AD-14).
      const current = state.waitPhase;
      if (
        current !== undefined &&
        WAIT_PHASE_ORDER.indexOf(action.phase) <
          WAIT_PHASE_ORDER.indexOf(current)
      ) {
        return state;
      }
      return { ...state, waitPhase: action.phase };
    }

    case "SET_ERROR":
      // Errors never destroy upstream artifacts (AD-8).
      return { ...state, error: action.error, waitPhase: undefined };

    case "CLEAR_ERROR":
      return { ...state, error: undefined };

    default:
      return state;
  }
}
