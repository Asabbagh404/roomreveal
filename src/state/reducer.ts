import {
  type Generation,
  type MaskBuffer,
  type Mode,
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
  | { type: "SELECT_MODE"; mode: Mode }
  | { type: "PHOTO_NORMALIZED"; photo: OriginalPhoto }
  | { type: "PHOTO_UPLOADED"; falUrl: string }
  | { type: "DETECTION_UPLOADED"; falUrl: string }
  | { type: "DETECT_SUCCEEDED"; detectedMaskUrl: string | null }
  | { type: "SET_MASK_BUFFER"; buffer: MaskBuffer }
  | { type: "MASK_VALIDATED"; maskUrl: string }
  | { type: "INPAINT_SUCCEEDED"; emptyRoomUrl: string }
  | { type: "REGENERATE_EMPTY_ROOM" }
  | { type: "VIDEO_SUCCEEDED"; revealUrl: string }
  | { type: "RESET" }
  | { type: "GO_TO_STEP"; step: Step }
  // `step` is the DESTINATION to advance to (not the source): sets step=step and
  // invalidates everything strictly downstream of it. Named "…_FROM" for the
  // stepper's "re-advance from an earlier point" flow; callers pass the target.
  | { type: "CONFIRM_ADVANCE_FROM"; step: Step }
  | { type: "SET_WAIT_PHASE"; phase: WaitPhase }
  | { type: "SET_ERROR"; error: StepError }
  | { type: "CLEAR_ERROR" };

function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

/** Clears every artifact strictly downstream of `step` (AD-11). */
function invalidateDownstream(step: Step): Partial<Generation> {
  const from = stepIndex(step);
  const cleared: Partial<Generation> = {};
  // maskDraft + mask belong to the "mask" step, emptyRoom to "emptyRoom",
  // reveal to "video".
  if (from < stepIndex("mask")) {
    cleared.maskDraft = undefined;
    cleared.mask = undefined;
  }
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
    case "SELECT_MODE":
      // Home-screen choice (Story 5.1): start a clean Generation in the chosen
      // mode, at the Upload step. Fresh object (not the shared singleton), so
      // nothing from a previous mode/attempt leaks (AD-3/AD-11).
      return { ...initialGeneration, mode: action.mode };

    case "PHOTO_NORMALIZED":
      // A new photo is a fresh Generation attempt: every downstream artifact
      // that belonged to the previous photo is now stale and must be dropped
      // (AD-11), and the epoch is bumped so any in-flight prior job is discarded
      // (AD-12). Only originalPhoto (and the mode) survive. The next step is
      // mode-aware (Story 5.1): reveal → "mask" (detection), edit → "editor".
      return {
        ...state,
        ...invalidateDownstream("upload"),
        originalPhoto: action.photo,
        maskDraft: undefined,
        step: state.mode === "edit" ? "editor" : "mask",
        epoch: state.epoch + 1,
        error: undefined,
        waitPhase: undefined,
      };

    case "PHOTO_UPLOADED":
      // Memoize the fal URL of the canonical photo (uploaded once per attempt).
      if (state.originalPhoto === undefined) return state;
      return {
        ...state,
        originalPhoto: { ...state.originalPhoto, falUrl: action.falUrl },
      };

    case "DETECTION_UPLOADED":
      // Memoize the fal URL of the higher-res detection copy (AD-2 amendment).
      if (state.originalPhoto === undefined) return state;
      return {
        ...state,
        originalPhoto: {
          ...state.originalPhoto,
          detectionFalUrl: action.falUrl,
        },
      };

    case "DETECT_SUCCEEDED":
      // Seed the mask draft from detection; its presence marks "detection ran".
      // A null detectedMaskUrl is the no-furniture case (FR-16), not an error.
      // Preserve any buffer already committed this attempt so a stray re-dispatch
      // (that slipped past the effect-layer epoch guard) can't wipe manual edits.
      return {
        ...state,
        maskDraft: {
          detectedMaskUrl: action.detectedMaskUrl,
          buffer: state.maskDraft?.buffer,
        },
        waitPhase: undefined,
        error: undefined,
      };

    case "SET_MASK_BUFFER":
      // Commit an editable mask buffer (seed, stroke, or undo/redo). Replaces
      // maskDraft immutably (new object) so referential-equality checks fire and
      // no already-referenced Uint8Array is mutated in place (AD-13). Ignored if
      // no draft exists yet (detection must have produced one first).
      if (state.maskDraft === undefined) return state;
      return {
        ...state,
        maskDraft: { ...state.maskDraft, buffer: action.buffer },
      };

    case "MASK_VALIDATED":
      // Ignore a validation that resolves after the user already left the mask
      // step (e.g. GO_TO_STEP back-nav mid-upload — which does NOT bump epoch, so
      // the effect's staleness guard can't catch it): never yank them forward.
      if (state.step !== "mask") return state;
      // Encode+upload done in effects; store the fal URL of the verbatim mask
      // (AD-13) and advance to Pièce vide. invalidateDownstream("mask") clears
      // emptyRoom+reveal but PRESERVES maskDraft+mask — it uses a STRICT `<`, so
      // the "mask" step's own artifacts survive (back-nav re-shows the draft,
      // FR-15/AD-13; do NOT relax to `<=`). epoch bumps to discard any in-flight
      // downstream job (AD-11/12).
      return {
        ...state,
        ...invalidateDownstream("mask"),
        mask: action.maskUrl,
        step: "emptyRoom",
        epoch: state.epoch + 1,
        waitPhase: undefined,
        error: undefined,
      };

    case "INPAINT_SUCCEEDED":
      // Store the generated Pièce vide. This is a PRODUCTION, not a transition:
      // the step stays "emptyRoom" (the user reviews it; "Créer ma vidéo" will
      // advance later) and the epoch does NOT bump — nothing downstream is
      // invalidated (AD-11). Mirrors DETECT_SUCCEEDED. No `step` guard is needed:
      // back-nav unmounts the surface, whose effect aborts the run, so the effect
      // layer drops the result before dispatch (AD-12); and even a late set of
      // emptyRoom on another step is harmless — it is preserved upstream and
      // re-invalidated on the next advance.
      return {
        ...state,
        emptyRoom: action.emptyRoomUrl,
        waitPhase: undefined,
        error: undefined,
      };

    case "VIDEO_SUCCEEDED":
      // Store the generated Révélation (last step). Like INPAINT_SUCCEEDED, this
      // is a PRODUCTION, not a transition: step stays "video" and the epoch does
      // NOT bump (nothing downstream to invalidate). No `step` guard — back-nav
      // unmounts the surface, whose effect aborts the run before dispatch (AD-12).
      return {
        ...state,
        reveal: action.revealUrl,
        waitPhase: undefined,
        error: undefined,
      };

    case "REGENERATE_EMPTY_ROOM":
      // Régénération (FR-9): re-run inpaint with the SAME validated mask, without
      // revisiting earlier steps. No-op unless a result is currently shown on the
      // emptyRoom step. Clearing `emptyRoom` re-satisfies the surface's entry-effect
      // guard so runInpaint fires again (orchestration stays in effects, AR-LAYERS).
      // invalidateDownstream("emptyRoom") drops any `reveal` (strict `<` keeps mask/
      // maskDraft); the epoch bump aborts any in-flight downstream video job — a
      // Révélation can never coexist with an emptyRoom that isn't its own (AC3,
      // AR-INVALIDATION/AD-11/12). mask + originalPhoto (memoized falUrl) preserved.
      if (state.step !== "emptyRoom" || state.emptyRoom === undefined) return state;
      return {
        ...state,
        ...invalidateDownstream("emptyRoom"),
        emptyRoom: undefined,
        epoch: state.epoch + 1,
        waitPhase: undefined,
        error: undefined,
      };

    case "RESET":
      // « Nouvelle Génération » (FR, Story 4.4): start a brand-new Generation
      // from scratch (back to Upload, epoch 0, no artifacts). The epoch reset +
      // the surfaces unmounting make any in-flight downstream job stale/aborted
      // (AD-11/12); nothing from the finished Generation survives (AD-3).
      // Fresh object (not the shared singleton) — consistent with every other
      // branch and safe if initialGeneration ever gains mutable fields. The
      // mode is PRESERVED (Story 5.1 AC5): « Nouvelle Génération » restarts on
      // a blank Upload within the SAME mode, not back at the home screen.
      return { ...initialGeneration, mode: state.mode };

    case "GO_TO_STEP":
      // Back (or same) navigation only: never advance, never touch artifacts.
      // Clear transient per-attempt fields (error, waitPhase) — a preserved
      // waitPhase would otherwise make AD-14 monotonicity reject the next attempt.
      // "editor" (edit mode) is outside STEP_ORDER, so it must NOT go through the
      // stepIndex comparison (which would return -1 and mis-classify moves):
      // - from "editor", only editor→upload is a valid back move (the edit
      //   stepper's « Photo »); anything else is a no-op.
      // - a reveal step may never navigate INTO "editor".
      if (state.step === "editor") {
        if (action.step !== "upload") return state;
      } else if (action.step === "editor") {
        return state;
      } else if (stepIndex(action.step) > stepIndex(state.step)) {
        return state;
      }
      return { ...state, step: action.step, error: undefined, waitPhase: undefined };

    case "CONFIRM_ADVANCE_FROM": {
      // Reveal-flow action only (STEP_ORDER). "editor" is reached via
      // PHOTO_NORMALIZED, never here — reject it so a stray dispatch can't feed
      // "editor" into invalidateDownstream (stepIndex -1 would wipe everything).
      if (action.step === "editor") return state;
      const next = { ...state, ...invalidateDownstream(action.step) };
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
