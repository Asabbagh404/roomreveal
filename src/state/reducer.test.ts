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

  it("PHOTO_NORMALIZED drops the previous photo's detected instances (Story 4.6)", () => {
    const state: Generation = {
      ...fullGeneration(),
      detectedInstances: [
        { label: "cabinet", box: [0.1, 0.2, 0.4, 0.9], area: 0.21 },
      ],
    };
    const photo = { blob: new Blob(["new"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 };
    const next = generationReducer(state, { type: "PHOTO_NORMALIZED", photo });
    expect(next.detectedInstances).toBeUndefined();
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

  it("DETECT_SUCCEEDED stores the detected instances (Story 4.6, AD-3 extension)", () => {
    const instances = [
      { label: "cabinet", box: [0.1, 0.2, 0.4, 0.9] as [number, number, number, number], area: 0.21 },
    ];
    const state: Generation = {
      step: "mask",
      epoch: 1,
      originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    };
    const next = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "fal://mask",
      instances,
    });
    expect(next.detectedInstances).toBe(instances);
    expect(next).not.toBe(state); // immutable: fresh object
  });

  it("DETECT_SUCCEEDED without instances leaves the field undefined (fal backend / 204)", () => {
    const state: Generation = { step: "mask", epoch: 1 };
    const next = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "fal://mask",
    });
    expect(next.detectedInstances).toBeUndefined();
  });

  it("DETECT_SUCCEEDED with instances preserves an already-committed buffer (stray re-dispatch)", () => {
    const buffer = { data: new Uint8Array([255, 0, 0, 0]), width: 2, height: 2 };
    const state: Generation = {
      step: "mask",
      epoch: 1,
      maskDraft: { detectedMaskUrl: "fal://old", buffer },
    };
    const next = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "fal://new",
      instances: [{ label: "oven", box: [0.7, 0.4, 0.9, 0.9], area: 0.1 }],
    });
    expect(next.maskDraft?.buffer).toBe(buffer); // manual edits survive
    expect(next.maskDraft?.detectedMaskUrl).toBe("fal://new");
  });

  it("re-detection REPLACES the previous instances (even by undefined, e.g. backend switch)", () => {
    const state: Generation = {
      step: "mask",
      epoch: 2,
      detectedInstances: [
        { label: "cabinet", box: [0.1, 0.2, 0.4, 0.9], area: 0.21 },
      ],
    };
    const replaced = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "fal://mask2",
      instances: [{ label: "stool", box: [0.4, 0.6, 0.5, 0.9], area: 0.03 }],
    });
    expect(replaced.detectedInstances).toEqual([
      { label: "stool", box: [0.4, 0.6, 0.5, 0.9], area: 0.03 },
    ]);
    const cleared = generationReducer(state, {
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "fal://mask3",
    });
    expect(cleared.detectedInstances).toBeUndefined(); // stale instances never linger
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

  it("UNION_MASK_BUFFER ORs the incoming mask into the live buffer (Story 5.6)", () => {
    const current = { data: new Uint8Array([255, 0, 0, 0]), width: 2, height: 2 };
    const state: Generation = {
      step: "editor",
      epoch: 1,
      maskDraft: { detectedMaskUrl: null, buffer: current },
    };
    const incoming = { data: new Uint8Array([0, 0, 255, 0]), width: 2, height: 2 };
    const next = generationReducer(state, { type: "UNION_MASK_BUFFER", buffer: incoming });
    // Union: pixel 0 from current, pixel 2 from incoming, both kept.
    expect([...next.maskDraft!.buffer!.data]).toEqual([255, 0, 255, 0]);
    expect(next.maskDraft).not.toBe(state.maskDraft); // immutable
    expect(current.data[2]).toBe(0); // input untouched
  });

  it("UNION_MASK_BUFFER sets the incoming mask directly when no buffer exists yet", () => {
    const state: Generation = {
      step: "editor",
      epoch: 1,
      maskDraft: { detectedMaskUrl: null, buffer: undefined },
    };
    const incoming = { data: new Uint8Array([0, 255, 0, 0]), width: 2, height: 2 };
    const next = generationReducer(state, { type: "UNION_MASK_BUFFER", buffer: incoming });
    expect(next.maskDraft?.buffer).toBe(incoming);
  });

  it("UNION_MASK_BUFFER is a no-op before a draft exists", () => {
    const state: Generation = { step: "editor", epoch: 1 };
    const buffer = { data: new Uint8Array(4), width: 2, height: 2 };
    expect(generationReducer(state, { type: "UNION_MASK_BUFFER", buffer })).toBe(state);
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

  it("RESET returns a brand-new Generation (« Nouvelle Génération »)", () => {
    const next = generationReducer(fullGeneration(), { type: "RESET" });
    expect(next).not.toBe(initialGeneration); // fresh object, not the shared singleton
    expect(next.step).toBe("upload");
    expect(next.epoch).toBe(0);
    expect(next.originalPhoto).toBeUndefined();
    expect(next.reveal).toBeUndefined();
    // fullGeneration() has no mode → RESET must keep it undefined (not default it
    // to a mode). Asserted explicitly: toEqual(initialGeneration) would pass
    // vacuously here since undefined keys are stripped in deep equality.
    expect(next.mode).toBeUndefined();
  });

  it("RESET preserves reveal mode too (not just edit)", () => {
    const next = generationReducer(
      { ...fullGeneration(), mode: "reveal" },
      { type: "RESET" },
    );
    expect(next.mode).toBe("reveal");
    expect(next.step).toBe("upload");
  });

  it("RESET preserves the current mode (« Nouvelle Génération » stays in the same mode, Story 5.1 AC5)", () => {
    const state: Generation = { ...fullGeneration(), mode: "edit" };
    const next = generationReducer(state, { type: "RESET" });
    expect(next.mode).toBe("edit");
    expect(next.step).toBe("upload"); // fresh upload, NOT the home screen
    expect(next.epoch).toBe(0);
    expect(next.originalPhoto).toBeUndefined();
    expect(next.reveal).toBeUndefined();
  });

  it("SELECT_MODE(reveal) starts a clean Generation in reveal mode at upload", () => {
    const next = generationReducer(fullGeneration(), {
      type: "SELECT_MODE",
      mode: "reveal",
    });
    expect(next.mode).toBe("reveal");
    expect(next.step).toBe("upload");
    expect(next.epoch).toBe(0);
    expect(next.originalPhoto).toBeUndefined();
    expect(next.mask).toBeUndefined();
    expect(next.emptyRoom).toBeUndefined();
    expect(next.reveal).toBeUndefined();
    expect(next).not.toBe(initialGeneration); // fresh object
  });

  it("SELECT_MODE(edit) starts a clean Generation in edit mode at upload", () => {
    const next = generationReducer(initialGeneration, {
      type: "SELECT_MODE",
      mode: "edit",
    });
    expect(next.mode).toBe("edit");
    expect(next.step).toBe("upload");
    expect(next.epoch).toBe(0);
  });

  it("PHOTO_NORMALIZED routes to the mask step in reveal mode", () => {
    const photo = { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 };
    const state: Generation = { step: "upload", epoch: 0, mode: "reveal" };
    const next = generationReducer(state, { type: "PHOTO_NORMALIZED", photo });
    expect(next.step).toBe("mask");
    expect(next.mode).toBe("reveal"); // mode persists across upload
  });

  it("PHOTO_NORMALIZED routes to the editor step in edit mode (Story 5.1)", () => {
    const photo = { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 };
    const state: Generation = { step: "upload", epoch: 0, mode: "edit" };
    const next = generationReducer(state, { type: "PHOTO_NORMALIZED", photo });
    expect(next.step).toBe("editor");
    expect(next.mode).toBe("edit");
    expect(next.originalPhoto).toBe(photo);
    expect(next.epoch).toBe(1);
  });

  it("GO_TO_STEP navigates editor→upload (edit-mode back move, Story 5.1)", () => {
    const state: Generation = { step: "editor", epoch: 1, mode: "edit" };
    const next = generationReducer(state, { type: "GO_TO_STEP", step: "upload" });
    expect(next.step).toBe("upload");
    expect(next.mode).toBe("edit"); // mode untouched
  });

  it("GO_TO_STEP never navigates a reveal step INTO editor (guarded against stepIndex -1)", () => {
    const state: Generation = { step: "mask", epoch: 1, mode: "reveal" };
    const next = generationReducer(state, { type: "GO_TO_STEP", step: "editor" });
    expect(next).toBe(state); // no-op: editor is not a reveal step
  });

  it("CONFIRM_ADVANCE_FROM('editor') is a no-op — never feeds -1 into invalidateDownstream", () => {
    const state = fullGeneration();
    const next = generationReducer(state, {
      type: "CONFIRM_ADVANCE_FROM",
      step: "editor",
    });
    expect(next).toBe(state); // untouched; reveal artifacts NOT wiped
  });

  // ---- Edit mode: editor step + iterative editBase (Story 5.3) ----
  const editorAfterUpload = (): Generation => ({
    step: "editor",
    epoch: 1,
    mode: "edit",
    originalPhoto: {
      blob: new Blob(["p"]),
      falUrl: "fal://photo",
      detectionBlob: new Blob(["d"]),
      width: 1024,
      height: 768,
    },
  });

  it("EDIT_START seeds editBase from originalPhoto and a blank maskDraft shell", () => {
    const state = editorAfterUpload();
    const next = generationReducer(state, { type: "EDIT_START" });
    expect(next.editBase).toEqual({
      blob: state.originalPhoto!.blob,
      url: "fal://photo",
      width: 1024,
      height: 768,
    });
    // Shell so SET_MASK_BUFFER (which no-ops on undefined maskDraft) can seed it.
    expect(next.maskDraft).toEqual({ detectedMaskUrl: null, buffer: undefined });
  });

  it("EDIT_START is a no-op outside the editor step or without a photo", () => {
    const noPhoto: Generation = { step: "editor", epoch: 1, mode: "edit" };
    expect(generationReducer(noPhoto, { type: "EDIT_START" })).toBe(noPhoto);
    const notEditor: Generation = { ...editorAfterUpload(), step: "upload" };
    expect(generationReducer(notEditor, { type: "EDIT_START" })).toBe(notEditor);
  });

  it("EDIT_START does not clobber an existing editBase (idempotent entry)", () => {
    const started = generationReducer(editorAfterUpload(), { type: "EDIT_START" });
    const again = generationReducer(started, { type: "EDIT_START" });
    expect(again).toBe(started);
  });

  it("EDIT_BASE_UPLOADED memoizes the fal url of the work image", () => {
    const state: Generation = {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { blob: new Blob(["w"]), width: 800, height: 600 },
    };
    const next = generationReducer(state, {
      type: "EDIT_BASE_UPLOADED",
      url: "fal://work",
    });
    expect(next.editBase).toEqual({
      blob: state.editBase!.blob,
      url: "fal://work",
      width: 800,
      height: 600,
    });
  });

  it("EDIT_APPLIED replaces editBase with the result, clears the mask, bumps epoch", () => {
    const state: Generation = {
      step: "editor",
      epoch: 3,
      mode: "edit",
      editBase: { url: "fal://work", width: 800, height: 600 },
      maskDraft: { detectedMaskUrl: null, buffer: { width: 800, height: 600, data: new Uint8Array(800 * 600) } },
    };
    const next = generationReducer(state, {
      type: "EDIT_APPLIED",
      image: "fal://edited",
    });
    expect(next.editBase).toEqual({ url: "fal://edited" }); // dims cleared → re-measure
    expect(next.maskDraft).toEqual({ detectedMaskUrl: null, buffer: undefined });
    expect(next.epoch).toBe(4);
    expect(next.step).toBe("editor");
  });

  it("EDIT_APPLIED is a no-op outside the editor step", () => {
    const state: Generation = { step: "mask", epoch: 1, mode: "reveal" };
    expect(generationReducer(state, { type: "EDIT_APPLIED", image: "x" })).toBe(state);
  });

  it("PHOTO_NORMALIZED clears a prior edit work image (re-upload doesn't reuse a stale editBase)", () => {
    const state: Generation = {
      step: "editor",
      epoch: 5,
      mode: "edit",
      editBase: { url: "fal://old-work", width: 800, height: 600 },
    };
    const photo = { blob: new Blob(["new"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 };
    const next = generationReducer(state, { type: "PHOTO_NORMALIZED", photo });
    expect(next.editBase).toBeUndefined(); // EDIT_START will re-seed from the new photo
    expect(next.step).toBe("editor"); // edit mode
    expect(next.mode).toBe("edit");
  });

  it("EDIT_BASE_MEASURED fills in the work image dimensions", () => {
    const state: Generation = {
      step: "editor",
      epoch: 4,
      mode: "edit",
      editBase: { url: "fal://edited" },
    };
    const next = generationReducer(state, {
      type: "EDIT_BASE_MEASURED",
      width: 1195,
      height: 896,
    });
    expect(next.editBase).toEqual({ url: "fal://edited", width: 1195, height: 896 });
  });

  it("SET_MASK_BUFFER seeds the blank buffer onto the edit maskDraft shell", () => {
    const shell: Generation = {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { url: "fal://work", width: 4, height: 4 },
      maskDraft: { detectedMaskUrl: null, buffer: undefined },
    };
    const buffer = { width: 4, height: 4, data: new Uint8Array(16) };
    const next = generationReducer(shell, { type: "SET_MASK_BUFFER", buffer });
    expect(next.maskDraft?.buffer).toBe(buffer);
  });

  it("VIDEO_SUCCEEDED stores reveal without advancing the step or bumping epoch", () => {
    const state: Generation = {
      step: "video",
      epoch: 6,
      mask: "fal://mask",
      emptyRoom: "fal://empty",
      waitPhase: "generating",
    };
    const next = generationReducer(state, {
      type: "VIDEO_SUCCEEDED",
      revealUrl: "fal://reveal.mp4",
    });
    expect(next.reveal).toBe("fal://reveal.mp4");
    expect(next.step).toBe("video"); // last step, stays
    expect(next.epoch).toBe(6); // production, not an invalidation
    expect(next.waitPhase).toBeUndefined();
    expect(next.error).toBeUndefined();
    expect(next.emptyRoom).toBe("fal://empty"); // upstream preserved
    expect(next.mask).toBe("fal://mask");
  });

  it("REGENERATE_EMPTY_ROOM clears emptyRoom + reveal, bumps epoch, preserves mask/photo, stays on emptyRoom", () => {
    const photo = {
      blob: new Blob(["p"]),
      falUrl: "fal://photo",
      detectionBlob: new Blob(["d"]),
      width: 1024,
      height: 768,
    };
    const state: Generation = {
      step: "emptyRoom",
      epoch: 4,
      originalPhoto: photo,
      mask: "fal://mask",
      maskDraft: { detectedMaskUrl: "d" },
      emptyRoom: "fal://empty",
      reveal: "fal://reveal",
    };
    const next = generationReducer(state, { type: "REGENERATE_EMPTY_ROOM" });
    expect(next).not.toBe(state); // immutable: fresh object
    expect(next.emptyRoom).toBeUndefined(); // cleared → entry effect re-runs inpaint
    expect(next.reveal).toBeUndefined(); // downstream invalidated (AC3)
    expect(next.epoch).toBe(5); // bumped → aborts in-flight downstream (AD-11/12)
    expect(next.step).toBe("emptyRoom"); // never returns to mask/upload
    expect(next.mask).toBe("fal://mask"); // same validated mask (FR-9)
    expect(next.maskDraft).toEqual({ detectedMaskUrl: "d" });
    expect(next.originalPhoto).toBe(photo); // memoized falUrl reused, no re-upload
    expect(next.waitPhase).toBeUndefined(); // fresh attempt → no stale phase (AD-14)
    expect(next.error).toBeUndefined();
  });

  it("REGENERATE_EMPTY_ROOM is a no-op off the emptyRoom step or with no empty room yet", () => {
    const onMask: Generation = { step: "mask", epoch: 1, mask: "fal://mask", emptyRoom: "fal://empty" };
    expect(generationReducer(onMask, { type: "REGENERATE_EMPTY_ROOM" })).toBe(onMask);
    const noEmpty: Generation = { step: "emptyRoom", epoch: 1, mask: "fal://mask" };
    expect(generationReducer(noEmpty, { type: "REGENERATE_EMPTY_ROOM" })).toBe(noEmpty);
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
