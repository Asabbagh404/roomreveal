import { describe, expect, it } from "vitest";
import { generationReducer, initialGeneration } from "./reducer";
import type { Generation } from "./types";

// A Generation with every artifact produced, sitting at the video step.
function fullGeneration(): Generation {
  return {
    step: "video",
    epoch: 2,
    originalPhoto: { blob: new Blob(["x"]), falUrl: "fal://photo" },
    maskDraft: { canonical: true },
    mask: "fal://mask",
    emptyRoom: "fal://empty",
    reveal: "fal://reveal",
  };
}

describe("generationReducer (pure, no mocks)", () => {
  it("exposes the canonical initial shape at upload / epoch 0", () => {
    expect(initialGeneration).toEqual({ step: "upload", epoch: 0 });
  });

  it("PHOTO_NORMALIZED sets originalPhoto and advances to mask", () => {
    const photo = { blob: new Blob(["p"]) };
    const next = generationReducer(initialGeneration, {
      type: "PHOTO_NORMALIZED",
      photo,
    });
    expect(next.originalPhoto).toBe(photo);
    expect(next.step).toBe("mask");
  });

  it("GO_TO_STEP backwards preserves ALL artifacts (FR-15, AD-11)", () => {
    const state = fullGeneration();
    const next = generationReducer(state, { type: "GO_TO_STEP", step: "mask" });
    expect(next.step).toBe("mask");
    expect(next.originalPhoto).toBe(state.originalPhoto);
    expect(next.maskDraft).toBe(state.maskDraft);
    expect(next.mask).toBe("fal://mask");
    expect(next.emptyRoom).toBe("fal://empty");
    expect(next.reveal).toBe("fal://reveal");
    expect(next.epoch).toBe(2); // back-nav never bumps epoch
  });

  it("GO_TO_STEP refuses to advance (forward-navigation is a no-op)", () => {
    const state: Generation = { step: "mask", epoch: 0 };
    expect(generationReducer(state, { type: "GO_TO_STEP", step: "video" })).toBe(
      state,
    );
  });

  it("CONFIRM_ADVANCE_FROM mask invalidates emptyRoom + reveal and bumps epoch", () => {
    const state = fullGeneration();
    const next = generationReducer(state, {
      type: "CONFIRM_ADVANCE_FROM",
      step: "mask",
    });
    expect(next.step).toBe("mask");
    expect(next.epoch).toBe(3);
    expect(next.mask).toBe("fal://mask"); // mask belongs to the "mask" step, kept
    expect(next.emptyRoom).toBeUndefined();
    expect(next.reveal).toBeUndefined();
    expect(next.originalPhoto).toBe(state.originalPhoto); // upstream kept
  });

  it("CONFIRM_ADVANCE_FROM upload invalidates every downstream artifact", () => {
    const next = generationReducer(fullGeneration(), {
      type: "CONFIRM_ADVANCE_FROM",
      step: "upload",
    });
    expect(next.mask).toBeUndefined();
    expect(next.emptyRoom).toBeUndefined();
    expect(next.reveal).toBeUndefined();
    expect(next.originalPhoto).toBeDefined(); // originalPhoto belongs to upload
  });

  it("SET_ERROR never destroys upstream artifacts (AD-8)", () => {
    const state = fullGeneration();
    const next = generationReducer(state, {
      type: "SET_ERROR",
      error: { step: "video", retryable: true, userMessage: "La vidéo n'a pas abouti." },
    });
    expect(next.error?.userMessage).toBe("La vidéo n'a pas abouti.");
    expect(next.mask).toBe("fal://mask");
    expect(next.emptyRoom).toBe("fal://empty");
    expect(next.reveal).toBe("fal://reveal");
  });

  it("CLEAR_ERROR removes the error", () => {
    const state: Generation = {
      step: "video",
      epoch: 1,
      error: { step: "video", retryable: true, userMessage: "x" },
    };
    expect(generationReducer(state, { type: "CLEAR_ERROR" }).error).toBeUndefined();
  });

  it("SET_WAIT_PHASE advances monotonically and refuses regression (AD-14)", () => {
    const s0: Generation = { step: "video", epoch: 1, waitPhase: "queued" };
    const forward = generationReducer(s0, {
      type: "SET_WAIT_PHASE",
      phase: "generating",
    });
    expect(forward.waitPhase).toBe("generating");

    const backward = generationReducer(forward, {
      type: "SET_WAIT_PHASE",
      phase: "uploading",
    });
    expect(backward.waitPhase).toBe("generating"); // regression refused
  });

  it("does not mutate the input state (immutability)", () => {
    const state = fullGeneration();
    const snapshot = JSON.stringify({ ...state, originalPhoto: "blob" });
    generationReducer(state, { type: "CONFIRM_ADVANCE_FROM", step: "mask" });
    expect(JSON.stringify({ ...state, originalPhoto: "blob" })).toBe(snapshot);
  });
});
