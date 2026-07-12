import { describe, expect, it } from "vitest";
import { generationReducer, initialGeneration } from "./reducer";
import type { Generation } from "./types";

// A Generation with every artifact produced, sitting at the video step.
function fullGeneration(): Generation {
  return {
    step: "video",
    epoch: 2,
    originalPhoto: {
      blob: new Blob(["x"]),
      falUrl: "fal://photo",
      detectionBlob: new Blob(["d"]),
      detectionFalUrl: "fal://detect",
      width: 1024,
      height: 768,
    },
    maskDraft: { detectedMaskUrl: "fal://mask" },
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
    const photo = { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 };
    const next = generationReducer(initialGeneration, {
      type: "PHOTO_NORMALIZED",
      photo,
    });
    expect(next.originalPhoto).toBe(photo);
    expect(next.step).toBe("mask");
  });

  it("PHOTO_NORMALIZED on a re-upload drops stale downstream artifacts and bumps epoch (AD-11/AD-12)", () => {
    const state = fullGeneration();
    const photo = { blob: new Blob(["new"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 };
    const next = generationReducer(state, { type: "PHOTO_NORMALIZED", photo });
    expect(next.originalPhoto).toBe(photo);
    expect(next.step).toBe("mask");
    expect(next.epoch).toBe(3); // was 2
    expect(next.maskDraft).toBeUndefined();
    expect(next.mask).toBeUndefined();
    expect(next.emptyRoom).toBeUndefined();
    expect(next.reveal).toBeUndefined();
  });

  it("GO_TO_STEP clears a stale waitPhase so the next attempt is not blocked (AD-14)", () => {
    const state: Generation = {
      step: "video",
      epoch: 1,
      waitPhase: "generating",
    };
    const next = generationReducer(state, { type: "GO_TO_STEP", step: "mask" });
    expect(next.waitPhase).toBeUndefined();
  });

  it("PHOTO_UPLOADED memoizes the canonical fal URL on the existing photo", () => {
    const state: Generation = {
      step: "mask",
      epoch: 1,
      originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    };
    const next = generationReducer(state, {
      type: "PHOTO_UPLOADED",
      falUrl: "fal://photo",
    });
    expect(next.originalPhoto?.falUrl).toBe("fal://photo");
    expect(next.originalPhoto?.blob).toBe(state.originalPhoto?.blob);
  });

  it("DETECTION_UPLOADED memoizes the detection fal URL", () => {
    const state: Generation = {
      step: "mask",
      epoch: 1,
      originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    };
    const next = generationReducer(state, {
      type: "DETECTION_UPLOADED",
      falUrl: "fal://detect",
    });
    expect(next.originalPhoto?.detectionFalUrl).toBe("fal://detect");
    expect(next.originalPhoto?.falUrl).toBeUndefined();
  });

  it("DETECT_SUCCEEDED seeds maskDraft and clears the wait phase", () => {
    const state: Generation = {
      step: "mask",
      epoch: 1,
      originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
      waitPhase: "generating",
    };
    const next = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "fal://mask",
    });
    expect(next.maskDraft).toEqual({ detectedMaskUrl: "fal://mask" });
    expect(next.waitPhase).toBeUndefined();
  });

  it("DETECT_SUCCEEDED with null marks detection ran without a mask (FR-16)", () => {
    const state: Generation = {
      step: "mask",
      epoch: 1,
      originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
      waitPhase: "generating",
    };
    const next = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: null,
    });
    expect(next.maskDraft).toEqual({ detectedMaskUrl: null });
  });

  it("SET_MASK_BUFFER commits an editable buffer onto the existing draft (AD-13)", () => {
    const state: Generation = {
      step: "mask",
      epoch: 1,
      maskDraft: { detectedMaskUrl: "fal://mask" },
    };
    const buffer = { data: new Uint8Array(4), width: 2, height: 2 };
    const next = generationReducer(state, { type: "SET_MASK_BUFFER", buffer });
    expect(next.maskDraft?.buffer).toBe(buffer);
    expect(next.maskDraft?.detectedMaskUrl).toBe("fal://mask"); // preserved
    expect(next.maskDraft).not.toBe(state.maskDraft); // new object (immutable)
  });

  it("SET_MASK_BUFFER is a no-op before a draft exists (detection must run first)", () => {
    const state: Generation = { step: "mask", epoch: 1 };
    const buffer = { data: new Uint8Array(4), width: 2, height: 2 };
    expect(generationReducer(state, { type: "SET_MASK_BUFFER", buffer })).toBe(
      state,
    );
  });

  it("MASK_VALIDATED stores the mask URL, advances to emptyRoom, preserves the draft (AD-13)", () => {
    const maskDraft = {
      detectedMaskUrl: "fal://d",
      buffer: { data: new Uint8Array(4), width: 2, height: 2 },
    };
    const state: Generation = {
      step: "mask",
      epoch: 3,
      maskDraft,
      emptyRoom: "fal://old-empty",
      reveal: "fal://old-reveal",
    };
    const next = generationReducer(state, {
      type: "MASK_VALIDATED",
      maskUrl: "fal://mask",
    });
    expect(next.mask).toBe("fal://mask");
    expect(next.step).toBe("emptyRoom");
    expect(next.epoch).toBe(4);
    expect(next.maskDraft).toBe(maskDraft); // draft kept for lossless back-nav
    expect(next.emptyRoom).toBeUndefined(); // downstream invalidated (AD-11)
    expect(next.reveal).toBeUndefined();
  });

  it("MASK_VALIDATED is a no-op once the user has left the mask step (B6 back-nav)", () => {
    const state: Generation = {
      step: "upload", // navigated back mid-upload
      epoch: 3,
      maskDraft: { detectedMaskUrl: "d", buffer: { data: new Uint8Array(4), width: 2, height: 2 } },
    };
    expect(
      generationReducer(state, { type: "MASK_VALIDATED", maskUrl: "fal://mask" }),
    ).toBe(state); // unchanged — not yanked forward
  });

  it("MASK_VALIDATED on re-validation overwrites the mask and re-invalidates downstream", () => {
    const state: Generation = {
      step: "mask",
      epoch: 5,
      mask: "fal://old-mask",
      maskDraft: { detectedMaskUrl: "d", buffer: { data: new Uint8Array(4), width: 2, height: 2 } },
      emptyRoom: "fal://empty",
    };
    const next = generationReducer(state, {
      type: "MASK_VALIDATED",
      maskUrl: "fal://new-mask",
    });
    expect(next.mask).toBe("fal://new-mask"); // overwritten cleanly
    expect(next.emptyRoom).toBeUndefined(); // downstream re-invalidated
    expect(next.step).toBe("emptyRoom");
    expect(next.epoch).toBe(6);
  });

  it("INPAINT_SUCCEEDED stores emptyRoom without advancing the step or bumping epoch", () => {
    const state: Generation = {
      step: "emptyRoom",
      epoch: 4,
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "fal://photo",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
      mask: "fal://mask",
      maskDraft: { detectedMaskUrl: "d" },
      waitPhase: "generating",
    };
    const next = generationReducer(state, {
      type: "INPAINT_SUCCEEDED",
      emptyRoomUrl: "fal://empty",
    });
    expect(next.emptyRoom).toBe("fal://empty");
    expect(next.step).toBe("emptyRoom"); // stays — "Créer ma vidéo" advances later
    expect(next.epoch).toBe(4); // production, not an invalidation (AD-11)
    expect(next.waitPhase).toBeUndefined();
    expect(next.error).toBeUndefined();
    // Upstream artifacts preserved.
    expect(next.mask).toBe("fal://mask");
    expect(next.maskDraft).toEqual({ detectedMaskUrl: "d" });
    expect(next.originalPhoto).toBe(state.originalPhoto);
  });

  it("CONFIRM_ADVANCE_FROM video (« Créer ma vidéo ») advances to video and preserves emptyRoom + mask", () => {
    const state: Generation = {
      step: "emptyRoom",
      epoch: 3,
      mask: "fal://mask",
      emptyRoom: "fal://empty",
    };
    const next = generationReducer(state, {
      type: "CONFIRM_ADVANCE_FROM",
      step: "video",
    });
    expect(next.step).toBe("video");
    expect(next.epoch).toBe(4);
    expect(next.emptyRoom).toBe("fal://empty"); // strict `<` keeps the step's own upstream artifacts
    expect(next.mask).toBe("fal://mask");
  });

  it("CONFIRM_ADVANCE_FROM upload also invalidates the mask draft", () => {
    const next = generationReducer(fullGeneration(), {
      type: "CONFIRM_ADVANCE_FROM",
      step: "upload",
    });
    expect(next.maskDraft).toBeUndefined();
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
    // Object.freeze makes any in-place write throw in strict mode, so a mutating
    // reducer fails hard instead of silently passing (JSON.stringify drops the
    // undefined fields the invalidation sets, hiding mutations).
    const state = Object.freeze(fullGeneration());
    const next = generationReducer(state, {
      type: "CONFIRM_ADVANCE_FROM",
      step: "mask",
    });
    expect(next).not.toBe(state);
    // Original still carries its downstream artifacts unchanged.
    expect(state.emptyRoom).toBe("fal://empty");
    expect(state.reveal).toBe("fal://reveal");
    expect(state.epoch).toBe(2);
  });
});
