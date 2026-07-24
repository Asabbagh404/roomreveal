import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the pipeline at the adapter boundary (AR-TESTS) — never mock @fal-ai/client here.
const detect = vi.fn();
const detectLocal = vi.fn();
const inpaint = vi.fn();
const autoEmptyRoom = vi.fn();
const editRemove = vi.fn();
const editAdd = vi.fn();
const editModify = vi.fn();
const resolveTextureUrl = vi.fn();
const findTexture = vi.fn();
const buildModifyPrompt = vi.fn();
const pointSegment = vi.fn();
const pointSegmentLocal = vi.fn();
const boxSegment = vi.fn();
const boxSegmentLocal = vi.fn();
const videoFn = vi.fn();
const videoMotionBrush = vi.fn();
const detectInstanceMasks = vi.fn();
const uploadArtifact = vi.fn();
// Mutable backend flag so the motion-brush tests can flip it without a second
// module mock (vi.mock is hoisted; the getter reads this at call time).
let videoBackend: "flf" | "motion-brush" = "flf";
vi.mock("@/pipeline", async () => ({
  DETECT_BACKEND: "fal", // these tests cover the default (fal) orchestration path
  get VIDEO_BACKEND() {
    return videoBackend;
  },
  // The REAL prompt builder (pure, no adapter behind it): runVideo's fallback
  // contract — "without instances the prompt IS REVEAL_MOTION_PROMPT" — must be
  // asserted against the true function, not a stub (Story 4.6).
  buildRevealMotionPrompt: (
    await vi.importActual<typeof import("@/pipeline/prompts")>("@/pipeline/prompts")
  ).buildRevealMotionPrompt,
  detect: (...a: unknown[]) => detect(...a),
  detectLocal: (...a: unknown[]) => detectLocal(...a),
  inpaint: (...a: unknown[]) => inpaint(...a),
  autoEmptyRoom: (...a: unknown[]) => autoEmptyRoom(...a),
  editRemove: (...a: unknown[]) => editRemove(...a),
  editAdd: (...a: unknown[]) => editAdd(...a),
  editModify: (...a: unknown[]) => editModify(...a),
  resolveTextureUrl: (...a: unknown[]) => resolveTextureUrl(...a),
  findTexture: (...a: unknown[]) => findTexture(...a),
  buildModifyPrompt: (...a: unknown[]) => buildModifyPrompt(...a),
  pointSegment: (...a: unknown[]) => pointSegment(...a),
  pointSegmentLocal: (...a: unknown[]) => pointSegmentLocal(...a),
  boxSegment: (...a: unknown[]) => boxSegment(...a),
  boxSegmentLocal: (...a: unknown[]) => boxSegmentLocal(...a),
  video: (...a: unknown[]) => videoFn(...a),
  videoMotionBrush: (...a: unknown[]) => videoMotionBrush(...a),
  detectInstanceMasks: (...a: unknown[]) => detectInstanceMasks(...a),
  uploadArtifact: (...a: unknown[]) => uploadArtifact(...a),
}));

// encodeMaskPng is browser-only (canvas) — mock at its boundary (live-verified).
const encodeMaskPng = vi.fn();
encodeMaskPng.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
vi.mock("@/lib/mask-encode", () => ({
  encodeMaskPng: (...a: unknown[]) => encodeMaskPng(...a),
}));

// decodeMaskToBuffer reads a canvas (unsupported in jsdom) — mock at its
// boundary; the real decode is covered by live-verify (Story 5.6).
const decodeMaskToBuffer = vi.fn();
vi.mock("@/lib/mask-decode", () => ({
  decodeMaskToBuffer: (...a: unknown[]) => decodeMaskToBuffer(...a),
}));

import { REVEAL_MOTION_PROMPT } from "@/pipeline/prompts";
import { runAutoEmptyRoom, runDetect, runDetectSelect, runEdit, runInpaint, runPointSegment, runValidateMask, runVideo } from "./effects";
import type { Generation } from "./types";

const paintedBuffer = { data: new Uint8Array([0, 255, 0, 0]), width: 2, height: 2 };
const emptyBuffer = { data: new Uint8Array(4), width: 2, height: 2 };

function baseState(overrides: Partial<Generation> = {}): Generation {
  return {
    step: "mask",
    epoch: 1,
    originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    ...overrides,
  };
}

const notStale = () => false;
const signal = new AbortController().signal;

afterEach(() => {
  detect.mockReset();
  inpaint.mockReset();
  autoEmptyRoom.mockReset();
  editRemove.mockReset();
  editAdd.mockReset();
  editModify.mockReset();
  resolveTextureUrl.mockReset();
  findTexture.mockReset();
  buildModifyPrompt.mockReset();
  pointSegment.mockReset();
  pointSegmentLocal.mockReset();
  boxSegment.mockReset();
  boxSegmentLocal.mockReset();
  videoFn.mockReset();
  videoMotionBrush.mockReset();
  detectInstanceMasks.mockReset();
  uploadArtifact.mockReset();
  encodeMaskPng.mockClear();
  decodeMaskToBuffer.mockReset();
  videoBackend = "flf"; // restore the default backend after each test
});

/** State sitting at the video step with an empty room + uploaded photo (post-4.1 entry). */
function videoState(overrides: Partial<Generation> = {}): Generation {
  return {
    step: "video",
    epoch: 3,
    originalPhoto: {
      blob: new Blob(["p"]),
      falUrl: "https://fal/photo.jpg",
      detectionBlob: new Blob(["d"]),
      width: 1024,
      height: 768,
    },
    mask: "https://fal/mask.png",
    emptyRoom: "https://fal/empty.png",
    ...overrides,
  };
}

/** State sitting at the emptyRoom step with a validated mask (post-2.3). */
function emptyRoomState(overrides: Partial<Generation> = {}): Generation {
  return {
    step: "emptyRoom",
    epoch: 2,
    originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    mask: "https://fal/mask.png",
    ...overrides,
  };
}

describe("runDetect (AD-12 orchestration)", () => {
  it("uploads the detection copy once, then dispatches DETECTION_UPLOADED and DETECT_SUCCEEDED", async () => {
    uploadArtifact.mockResolvedValue("https://fal/detect.jpg");
    detect.mockResolvedValue({ initialMask: "https://fal/mask.png", categories: [] });
    const dispatch = vi.fn();

    await runDetect(baseState(), dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "DETECTION_UPLOADED",
      falUrl: "https://fal/detect.jpg",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "https://fal/mask.png",
    });
  });

  // The forwarding is backend-agnostic: runDetect dispatches whatever
  // `result.instances` the adapter returned. The mock pins DETECT_BACKEND to
  // "fal", so the fal-shaped adapter stands in for detectLocal here — in
  // production only the local backend actually produces instances (types.ts).
  it("forwards the adapter's instances to DETECT_SUCCEEDED (Story 4.6, backend-agnostic)", async () => {
    const instances = [
      { label: "cabinet", box: [0.1, 0.2, 0.4, 0.9], area: 0.21 },
    ];
    detect.mockResolvedValue({
      initialMask: "https://fal/mask.png",
      categories: [],
      instances,
    });
    const dispatch = vi.fn();
    const state = baseState({
      originalPhoto: {
        blob: new Blob(["p"]),
        detectionBlob: new Blob(["d"]),
        detectionFalUrl: "https://fal/detect.jpg",
        width: 1024,
        height: 768,
      },
    });

    await runDetect(state, dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith({
      type: "DETECT_SUCCEEDED",
      detectedMaskUrl: "https://fal/mask.png",
      instances,
    });
  });

  it("skips the upload when the detection copy already has a fal URL (memoized)", async () => {
    detect.mockResolvedValue({ initialMask: null, categories: [] });
    const dispatch = vi.fn();
    const state = baseState({
      originalPhoto: {
        blob: new Blob(["p"]),
        detectionBlob: new Blob(["d"]),
        detectionFalUrl: "https://fal/detect.jpg",
        width: 1024,
        height: 768,
      },
    });

    await runDetect(state, dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).not.toHaveBeenCalled();
    expect(detect).toHaveBeenCalledWith("https://fal/detect.jpg", expect.anything());
  });

  it("drops a result that goes stale mid-flight (epoch bumped after detect starts)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    // Flip stale only once detect is actually running — proves the post-detect
    // guard (not merely an early abort) drops the superseded result.
    let stale = false;
    detect.mockImplementation(() => {
      stale = true;
      return Promise.resolve({ initialMask: "https://fal/mask.png", categories: [] });
    });
    const dispatch = vi.fn();

    await runDetect(baseState(), dispatch, { signal, isStale: () => stale });

    expect(
      dispatch.mock.calls.some((c) => c[0].type === "DETECT_SUCCEEDED"),
    ).toBe(false);
  });

  it("does not dispatch when the signal is aborted, even if the epoch is unchanged", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    detect.mockResolvedValue({ initialMask: "https://fal/mask.png", categories: [] });
    const dispatch = vi.fn();
    const aborted = new AbortController();
    aborted.abort();

    await runDetect(baseState(), dispatch, {
      signal: aborted.signal,
      isStale: () => false,
    });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0].type === "DETECT_SUCCEEDED" || c[0].type === "SET_ERROR",
      ),
    ).toBe(false);
  });

  it("emits the uploading phase before uploading the photo (FR-14)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    detect.mockResolvedValue({ initialMask: null, categories: [] });
    const dispatch = vi.fn();

    await runDetect(baseState(), dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WAIT_PHASE",
      phase: "uploading",
    });
  });

  it("dispatches SET_ERROR with the adapter's StepError on failure", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    detect.mockRejectedValue({
      step: "detect",
      retryable: true,
      userMessage: "La détection des meubles n'a pas abouti.",
    });
    const dispatch = vi.fn();

    await runDetect(baseState(), dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_ERROR",
        error: expect.objectContaining({ step: "detect" }),
      }),
    );
  });

  it("forwards adapter phases as SET_WAIT_PHASE", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    detect.mockImplementation(
      (_url: string, o: { onPhase: (p: string) => void }) => {
        o.onPhase("generating");
        return Promise.resolve({ initialMask: null, categories: [] });
      },
    );
    const dispatch = vi.fn();

    await runDetect(baseState(), dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WAIT_PHASE",
      phase: "generating",
    });
  });
});

describe("runValidateMask (AD-13 validation)", () => {
  it("encodes + uploads the buffer, then dispatches MASK_VALIDATED", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    const dispatch = vi.fn();
    const state = baseState({ maskDraft: { detectedMaskUrl: "d", buffer: paintedBuffer } });

    await runValidateMask(state, dispatch, { signal, isStale: notStale });

    expect(encodeMaskPng).toHaveBeenCalledWith(paintedBuffer);
    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "MASK_VALIDATED",
      maskUrl: "https://fal/mask.png",
    });
  });

  it("is a no-op for an empty or missing buffer (never uploads)", async () => {
    const dispatch = vi.fn();
    await runValidateMask(
      baseState({ maskDraft: { detectedMaskUrl: "d", buffer: emptyBuffer } }),
      dispatch,
      { signal, isStale: notStale },
    );
    await runValidateMask(
      baseState({ maskDraft: { detectedMaskUrl: "d" } }),
      dispatch,
      { signal, isStale: notStale },
    );
    expect(uploadArtifact).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops the dispatch when the run became stale mid-upload (AD-12)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    const dispatch = vi.fn();
    const state = baseState({ maskDraft: { detectedMaskUrl: "d", buffer: paintedBuffer } });

    await runValidateMask(state, dispatch, { signal, isStale: () => true });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("throws on upload failure (handled inline by the caller, not SET_ERROR)", async () => {
    uploadArtifact.mockRejectedValue(new Error("network"));
    const dispatch = vi.fn();
    const state = baseState({ maskDraft: { detectedMaskUrl: "d", buffer: paintedBuffer } });

    await expect(
      runValidateMask(state, dispatch, { signal, isStale: notStale }),
    ).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_ERROR" }),
    );
  });
});

describe("runInpaint (AD-12 orchestration)", () => {
  it("uploads the canonical photo once, then dispatches PHOTO_UPLOADED and INPAINT_SUCCEEDED", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    inpaint.mockResolvedValue({ emptyRoom: "https://fal/empty.jpg" });
    const dispatch = vi.fn();

    await runInpaint(emptyRoomState(), dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "PHOTO_UPLOADED",
      falUrl: "https://fal/photo.jpg",
    });
    expect(inpaint).toHaveBeenCalledWith(
      "https://fal/photo.jpg",
      "https://fal/mask.png",
      expect.anything(),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "INPAINT_SUCCEEDED",
      emptyRoomUrl: "https://fal/empty.jpg",
    });
  });

  it("skips the upload when the canonical photo already has a fal URL (memoized)", async () => {
    inpaint.mockResolvedValue({ emptyRoom: "https://fal/empty.jpg" });
    const dispatch = vi.fn();
    const state = emptyRoomState({
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runInpaint(state, dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).not.toHaveBeenCalled();
    expect(inpaint).toHaveBeenCalledWith(
      "https://fal/photo.jpg",
      "https://fal/mask.png",
      expect.anything(),
    );
  });

  it("is a no-op when the mask or the photo is missing (never calls inpaint)", async () => {
    inpaint.mockResolvedValue({ emptyRoom: "u" });
    const dispatch = vi.fn();

    await runInpaint(emptyRoomState({ mask: undefined }), dispatch, { signal, isStale: notStale });
    await runInpaint(emptyRoomState({ originalPhoto: undefined }), dispatch, { signal, isStale: notStale });

    expect(inpaint).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops a result that goes stale mid-flight (epoch bumped after inpaint starts)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    let stale = false;
    inpaint.mockImplementation(() => {
      stale = true;
      return Promise.resolve({ emptyRoom: "https://fal/empty.jpg" });
    });
    const dispatch = vi.fn();

    await runInpaint(emptyRoomState(), dispatch, { signal, isStale: () => stale });

    expect(
      dispatch.mock.calls.some((c) => c[0].type === "INPAINT_SUCCEEDED"),
    ).toBe(false);
  });

  it("does not dispatch when the signal is aborted, even if the epoch is unchanged", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    inpaint.mockResolvedValue({ emptyRoom: "https://fal/empty.jpg" });
    const dispatch = vi.fn();
    const aborted = new AbortController();
    aborted.abort();

    await runInpaint(emptyRoomState(), dispatch, {
      signal: aborted.signal,
      isStale: () => false,
    });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0].type === "INPAINT_SUCCEEDED" || c[0].type === "SET_ERROR",
      ),
    ).toBe(false);
  });

  it("dispatches SET_ERROR with the adapter's inpaint StepError on failure", async () => {
    inpaint.mockRejectedValue({
      step: "inpaint",
      retryable: true,
      userMessage: "La pièce vide n'a pas abouti.",
    });
    const dispatch = vi.fn();
    const state = emptyRoomState({
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runInpaint(state, dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_ERROR",
        error: expect.objectContaining({ step: "inpaint" }),
      }),
    );
  });

  it("forwards adapter phases as SET_WAIT_PHASE", async () => {
    const dispatch = vi.fn();
    const state = emptyRoomState({
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });
    inpaint.mockImplementation(
      (_p: string, _m: string, o: { onPhase: (p: string) => void }) => {
        o.onPhase("generating");
        return Promise.resolve({ emptyRoom: "https://fal/empty.jpg" });
      },
    );

    await runInpaint(state, dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WAIT_PHASE",
      phase: "generating",
    });
  });
});

describe("runAutoEmptyRoom (AD-12 maskless, Story 3.4)", () => {
  it("calls autoEmptyRoom(photo) and dispatches INPAINT_SUCCEEDED; no re-upload when photo on fal", async () => {
    autoEmptyRoom.mockResolvedValue({ emptyRoom: "https://fal/empty.png" });
    const dispatch = vi.fn();
    const state = emptyRoomState({
      mask: undefined, // maskless / auto mode
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runAutoEmptyRoom(state, dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).not.toHaveBeenCalled();
    expect(autoEmptyRoom).toHaveBeenCalledWith("https://fal/photo.jpg", expect.anything());
    expect(dispatch).toHaveBeenCalledWith({
      type: "INPAINT_SUCCEEDED",
      emptyRoomUrl: "https://fal/empty.png",
    });
  });

  it("uploads the canonical photo lazily when its fal URL is missing", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    autoEmptyRoom.mockResolvedValue({ emptyRoom: "https://fal/empty.png" });
    const dispatch = vi.fn();
    const state = emptyRoomState({
      mask: undefined,
      originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]), width: 1024, height: 768 },
    });

    await runAutoEmptyRoom(state, dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "PHOTO_UPLOADED", falUrl: "https://fal/photo.jpg" });
  });

  it("is a no-op when the photo is missing", async () => {
    autoEmptyRoom.mockResolvedValue({ emptyRoom: "u" });
    const dispatch = vi.fn();
    await runAutoEmptyRoom(emptyRoomState({ mask: undefined, originalPhoto: undefined }), dispatch, {
      signal,
      isStale: notStale,
    });
    expect(autoEmptyRoom).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops a result that goes stale mid-flight (epoch bumped after the call starts)", async () => {
    let stale = false;
    autoEmptyRoom.mockImplementation(() => {
      stale = true;
      return Promise.resolve({ emptyRoom: "https://fal/empty.png" });
    });
    const dispatch = vi.fn();
    const state = emptyRoomState({
      mask: undefined,
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runAutoEmptyRoom(state, dispatch, { signal, isStale: () => stale });

    expect(dispatch.mock.calls.some((c) => c[0].type === "INPAINT_SUCCEEDED")).toBe(false);
  });

  it("does not dispatch when the signal is aborted, even if the epoch is unchanged", async () => {
    autoEmptyRoom.mockResolvedValue({ emptyRoom: "https://fal/empty.png" });
    const dispatch = vi.fn();
    const aborted = new AbortController();
    aborted.abort();
    const state = emptyRoomState({
      mask: undefined,
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runAutoEmptyRoom(state, dispatch, { signal: aborted.signal, isStale: () => false });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0].type === "INPAINT_SUCCEEDED" || c[0].type === "SET_ERROR",
      ),
    ).toBe(false);
  });

  it("dispatches SET_ERROR (inpaint step) on failure", async () => {
    autoEmptyRoom.mockRejectedValue({ step: "inpaint", retryable: true, userMessage: "…" });
    const dispatch = vi.fn();
    const state = emptyRoomState({
      mask: undefined,
      originalPhoto: {
        blob: new Blob(["p"]),
        falUrl: "https://fal/photo.jpg",
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runAutoEmptyRoom(state, dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_ERROR", error: expect.objectContaining({ step: "inpaint" }) }),
    );
  });
});

describe("runVideo (AD-12 FLF orchestration)", () => {
  it("calls video(emptyRoom, photo) and dispatches VIDEO_SUCCEEDED; no re-upload when photo already on fal", async () => {
    videoFn.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).not.toHaveBeenCalled(); // photo.falUrl already set
    // Seeds a phase immediately so the WaitPanel shows without dead-air (UX-DR11).
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_WAIT_PHASE", phase: "queued" });
    expect(videoFn).toHaveBeenCalledWith(
      "https://fal/empty.png", // first frame = empty room
      "https://fal/photo.jpg", // last frame = canonical photo
      expect.any(String), // motion prompt built by the effect layer (Story 4.6)
      expect.anything(),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "VIDEO_SUCCEEDED",
      revealUrl: "https://fal/reveal.mp4",
    });
  });

  it("uploads the canonical photo lazily when its fal URL is missing", async () => {
    uploadArtifact.mockResolvedValue("https://fal/photo.jpg");
    videoFn.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();
    const state = videoState({
      originalPhoto: {
        blob: new Blob(["p"]),
        detectionBlob: new Blob(["d"]),
        width: 1024,
        height: 768,
      },
    });

    await runVideo(state, dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "PHOTO_UPLOADED", falUrl: "https://fal/photo.jpg" });
    expect(videoFn).toHaveBeenCalledWith("https://fal/empty.png", "https://fal/photo.jpg", expect.any(String), expect.anything());
  });

  it("is a no-op when the empty room or the photo is missing", async () => {
    videoFn.mockResolvedValue({ reveal: "u" });
    const dispatch = vi.fn();

    await runVideo(videoState({ emptyRoom: undefined }), dispatch, { signal, isStale: notStale });
    await runVideo(videoState({ originalPhoto: undefined }), dispatch, { signal, isStale: notStale });

    expect(videoFn).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops a result that goes stale mid-flight (epoch bumped, e.g. Pièce vide regenerated)", async () => {
    let stale = false;
    videoFn.mockImplementation(() => {
      stale = true;
      return Promise.resolve({ reveal: "https://fal/reveal.mp4" });
    });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: () => stale });

    expect(dispatch.mock.calls.some((c) => c[0].type === "VIDEO_SUCCEEDED")).toBe(false);
  });

  it("builds the motion prompt from the detected instances (labels + trajectories, Story 4.6)", async () => {
    videoFn.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();
    const state = videoState({
      detectedInstances: [
        { label: "cabinet", box: [0.0, 0.3, 0.3, 0.9], area: 0.6 },
        { label: "refrigerator", box: [0.8, 0.2, 1.0, 0.9], area: 0.5 },
      ],
    });

    await runVideo(state, dispatch, { signal, isStale: notStale });

    const [, , motionPrompt] = videoFn.mock.calls[0] as [string, string, string];
    expect(motionPrompt).toContain("the cabinet slides in from the left");
    expect(motionPrompt).toContain("the refrigerator slides in from the right");
    expect(motionPrompt).toContain("no morphing"); // anti-morph clause kept
  });

  it("falls back to exactly REVEAL_MOTION_PROMPT without instances (zero regression, Story 4.6)", async () => {
    videoFn.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: notStale });

    const [, , motionPrompt] = videoFn.mock.calls[0] as [string, string, string];
    expect(motionPrompt).toBe(REVEAL_MOTION_PROMPT); // strict identity, not toContain
  });

  it("also falls back strictly for an EMPTY instances array", async () => {
    videoFn.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();

    await runVideo(videoState({ detectedInstances: [] }), dispatch, { signal, isStale: notStale });

    const [, , motionPrompt] = videoFn.mock.calls[0] as [string, string, string];
    expect(motionPrompt).toBe(REVEAL_MOTION_PROMPT);
  });

  it("dispatches SET_ERROR with the adapter's video StepError on failure", async () => {
    videoFn.mockRejectedValue({
      step: "video",
      retryable: true,
      userMessage: "La vidéo n'a pas abouti.",
    });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_ERROR",
        error: expect.objectContaining({ step: "video" }),
      }),
    );
  });
});

describe("runVideo (VIDEO_BACKEND=motion-brush, Story 4.8)", () => {
  const instanceMasks = {
    staticMask: "data:image/png;base64,SHELL",
    instances: [
      { label: "cabinet", box: [0.1, 0.4, 0.3, 0.6], area: 0.2, mask: "data:image/png;base64,A" },
    ],
  };

  it("calls detectInstanceMasks then videoMotionBrush and dispatches VIDEO_SUCCEEDED", async () => {
    videoBackend = "motion-brush";
    detectInstanceMasks.mockResolvedValue(instanceMasks);
    videoMotionBrush.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: notStale });

    expect(detectInstanceMasks).toHaveBeenCalledOnce();
    expect(videoMotionBrush).toHaveBeenCalledWith(
      "https://fal/photo.jpg", // canonical photo = start frame
      instanceMasks,
      expect.anything(),
    );
    // The flf adapter must NOT run on the motion-brush path.
    expect(videoFn).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "VIDEO_SUCCEEDED",
      revealUrl: "https://fal/reveal.mp4",
    });
  });

  it("falls back to the flf path when the service finds no instances (204)", async () => {
    videoBackend = "motion-brush";
    detectInstanceMasks.mockResolvedValue({ instances: [], staticMask: "" });
    videoFn.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: notStale });

    expect(videoMotionBrush).not.toHaveBeenCalled();
    expect(videoFn).toHaveBeenCalledOnce(); // flf reveal still renders
    expect(dispatch).toHaveBeenCalledWith({
      type: "VIDEO_SUCCEEDED",
      revealUrl: "https://fal/reveal.mp4",
    });
  });

  it("drops a stale result after detectInstanceMasks (epoch bumped)", async () => {
    videoBackend = "motion-brush";
    let stale = false;
    detectInstanceMasks.mockImplementation(() => {
      stale = true;
      return Promise.resolve(instanceMasks);
    });
    videoMotionBrush.mockResolvedValue({ reveal: "https://fal/reveal.mp4" });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: () => stale });

    expect(videoMotionBrush).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((c) => c[0].type === "VIDEO_SUCCEEDED")).toBe(false);
  });

  it("surfaces a mask-detection failure as a retryable video error (AC5)", async () => {
    videoBackend = "motion-brush";
    detectInstanceMasks.mockRejectedValue({
      step: "detect",
      retryable: true,
      userMessage: "détection ratée",
    });
    const dispatch = vi.fn();

    await runVideo(videoState(), dispatch, { signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_ERROR",
        error: expect.objectContaining({ step: "video" }),
      }),
    );
  });
});

describe("runEdit (AD-12 free-edit remove, Story 5.3)", () => {
  const paintedMask = { data: new Uint8Array([0, 255, 0, 0]), width: 2, height: 2 };

  /** Editor state on the first retouch: work image is the uploaded blob (no url). */
  function editState(overrides: Partial<Generation> = {}): Generation {
    return {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { blob: new Blob(["w"]), width: 1024, height: 768 },
      maskDraft: { detectedMaskUrl: null, buffer: paintedMask },
      ...overrides,
    };
  }

  it("first retouch: uploads the work image, encodes+uploads the mask, then EDIT_APPLIED", async () => {
    uploadArtifact
      .mockResolvedValueOnce("https://fal/work.jpg") // work image
      .mockResolvedValueOnce("https://fal/mask.png"); // mask png
    editRemove.mockResolvedValue({ image: "https://fal/edited.png" });
    const dispatch = vi.fn();

    await runEdit(editState(), dispatch, { operation: "remove", signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith({
      type: "EDIT_BASE_UPLOADED",
      url: "https://fal/work.jpg",
    });
    expect(editRemove).toHaveBeenCalledWith(
      "https://fal/work.jpg",
      "https://fal/mask.png",
      expect.anything(),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "EDIT_APPLIED",
      image: "https://fal/edited.png",
    });
  });

  it("subsequent retouch: reuses the fal URL of the previous result (no re-upload of the image)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png"); // only the mask is uploaded
    editRemove.mockResolvedValue({ image: "https://fal/edited2.png" });
    const dispatch = vi.fn();
    const state = editState({ editBase: { url: "https://fal/prev.png", width: 1195, height: 896 } });

    await runEdit(state, dispatch, { operation: "remove", signal, isStale: notStale });

    // uploadArtifact called once (mask only), never for the image.
    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(
      dispatch.mock.calls.some((c) => c[0].type === "EDIT_BASE_UPLOADED"),
    ).toBe(false);
    expect(editRemove).toHaveBeenCalledWith(
      "https://fal/prev.png",
      "https://fal/mask.png",
      expect.anything(),
    );
  });

  it("is a no-op when the mask is empty or editBase is missing", async () => {
    const dispatch = vi.fn();
    await runEdit(editState({ maskDraft: { detectedMaskUrl: null, buffer: emptyBuffer } }), dispatch, {
      operation: "remove",
      signal,
      isStale: notStale,
    });
    await runEdit(editState({ editBase: undefined }), dispatch, {
      operation: "remove",
      signal,
      isStale: notStale,
    });
    expect(editRemove).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("surfaces a failure as a retryable SET_ERROR of step edit", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    editRemove.mockRejectedValue(new Error("boom"));
    const dispatch = vi.fn();
    const state = editState({ editBase: { url: "https://fal/prev.png", width: 4, height: 4 } });

    await runEdit(state, dispatch, { operation: "remove", signal, isStale: notStale });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_ERROR",
        error: expect.objectContaining({ step: "edit" }),
      }),
    );
  });

  it("drops a result that goes stale mid-flight (no EDIT_APPLIED)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    let stale = false;
    editRemove.mockImplementation(() => {
      stale = true;
      return Promise.resolve({ image: "https://fal/edited.png" });
    });
    const dispatch = vi.fn();
    const state = editState({ editBase: { url: "https://fal/prev.png", width: 4, height: 4 } });

    await runEdit(state, dispatch, { operation: "remove", signal, isStale: () => stale });

    expect(dispatch.mock.calls.some((c) => c[0].type === "EDIT_APPLIED")).toBe(false);
  });

  it("does not dispatch when the signal is aborted", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    editRemove.mockResolvedValue({ image: "https://fal/edited.png" });
    const dispatch = vi.fn();
    const aborted = new AbortController();
    aborted.abort();
    const state = editState({ editBase: { url: "https://fal/prev.png", width: 4, height: 4 } });

    await runEdit(state, dispatch, {
      operation: "remove",
      signal: aborted.signal,
      isStale: () => false,
    });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0].type === "EDIT_APPLIED" || c[0].type === "SET_ERROR",
      ),
    ).toBe(false);
  });
});

describe("runEdit — add operation (Story 5.4, flux fill)", () => {
  const paintedMask = { data: new Uint8Array([0, 255, 0, 0]), width: 2, height: 2 };
  function editState(overrides: Partial<Generation> = {}): Generation {
    return {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { url: "https://fal/work.jpg", width: 1024, height: 768 },
      maskDraft: { detectedMaskUrl: null, buffer: paintedMask },
      ...overrides,
    };
  }

  it("calls editAdd with the prompt and dispatches EDIT_APPLIED", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    editAdd.mockResolvedValue({ image: "https://fal/added.png" });
    const dispatch = vi.fn();

    await runEdit(editState(), dispatch, {
      operation: "add",
      prompt: "pot de fleur",
      signal,
      isStale: notStale,
    });

    expect(editAdd).toHaveBeenCalledWith(
      "https://fal/work.jpg",
      "https://fal/mask.png",
      "pot de fleur",
      expect.anything(),
    );
    expect(editRemove).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "EDIT_APPLIED",
      image: "https://fal/added.png",
    });
  });

  it("is a no-op for add with an empty/whitespace prompt (never calls editAdd)", async () => {
    const dispatch = vi.fn();
    await runEdit(editState(), dispatch, {
      operation: "add",
      prompt: "   ",
      signal,
      isStale: notStale,
    });
    await runEdit(editState(), dispatch, {
      operation: "add",
      prompt: undefined,
      signal,
      isStale: notStale,
    });
    expect(editAdd).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("remove operation still routes to editRemove, not editAdd", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    editRemove.mockResolvedValue({ image: "https://fal/erased.png" });
    const dispatch = vi.fn();

    await runEdit(editState(), dispatch, {
      operation: "remove",
      signal,
      isStale: notStale,
    });

    expect(editRemove).toHaveBeenCalledOnce();
    expect(editAdd).not.toHaveBeenCalled();
  });
});

describe("runEdit — modify operation (texture bank, flux-general)", () => {
  const paintedMask = { data: new Uint8Array([0, 255, 0, 0]), width: 2, height: 2 };
  function editState(overrides: Partial<Generation> = {}): Generation {
    return {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { url: "https://fal/work.jpg", width: 1024, height: 768 },
      maskDraft: { detectedMaskUrl: null, buffer: paintedMask },
      ...overrides,
    };
  }

  it("modify with a texture: resolves the texture URL and calls editModify with it", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    resolveTextureUrl.mockResolvedValue("https://fal/texture.png");
    findTexture.mockReturnValue({
      id: "bois",
      label: "Bois",
      file: "/textures/bois.png",
      prompt: "oak wood",
    });
    buildModifyPrompt.mockReturnValue("Change only the masked object. Apply this material to it: oak wood.");
    editModify.mockResolvedValue({ image: "https://fal/mod.png" });
    const dispatch = vi.fn();

    await runEdit(editState(), dispatch, {
      operation: "modify",
      textureId: "bois",
      signal,
      isStale: notStale,
    });

    expect(resolveTextureUrl).toHaveBeenCalledWith("bois");
    // Texture resolve shows the WaitPanel feedback (mirrors the lazy upload).
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_WAIT_PHASE", phase: "uploading" });
    expect(editModify).toHaveBeenCalledWith(
      "https://fal/work.jpg",
      "https://fal/mask.png",
      expect.objectContaining({
        textureUrl: "https://fal/texture.png",
        prompt: expect.stringMatching(/\S/),
      }),
      expect.anything(),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "EDIT_APPLIED",
      image: "https://fal/mod.png",
    });
  });

  it("modify instruction-only (no texture): editModify with textureUrl undefined, prompt carries the instruction", async () => {
    uploadArtifact.mockResolvedValue("https://fal/mask.png");
    buildModifyPrompt.mockReturnValue("Change only the masked object. navy");
    editModify.mockResolvedValue({ image: "https://fal/mod.png" });
    const dispatch = vi.fn();

    await runEdit(editState(), dispatch, {
      operation: "modify",
      instruction: "navy",
      signal,
      isStale: notStale,
    });

    expect(resolveTextureUrl).not.toHaveBeenCalled();
    expect(editModify).toHaveBeenCalledWith(
      "https://fal/work.jpg",
      "https://fal/mask.png",
      expect.objectContaining({
        textureUrl: undefined,
        prompt: expect.stringContaining("navy"),
      }),
      expect.anything(),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "EDIT_APPLIED",
      image: "https://fal/mod.png",
    });
  });

  it("is a no-op for modify with no texture and an empty instruction (never calls editModify)", async () => {
    const dispatch = vi.fn();

    await runEdit(editState(), dispatch, {
      operation: "modify",
      textureId: undefined,
      instruction: "   ",
      signal,
      isStale: notStale,
    });

    expect(editModify).not.toHaveBeenCalled();
    expect(resolveTextureUrl).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((c) => c[0].type === "EDIT_APPLIED")).toBe(false);
  });
});

describe("runPointSegment (AD-12 click-to-select, Story 5.6)", () => {
  const buffer = { data: new Uint8Array(16), width: 4, height: 4 };
  const decoded = { data: new Uint8Array(16).fill(255), width: 4, height: 4 };

  /** Editor state on a work image with dims + a (blank) draft buffer. */
  function segState(overrides: Partial<Generation> = {}): Generation {
    return {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { url: "https://fal/work.png", width: 4, height: 4 },
      maskDraft: { detectedMaskUrl: null, buffer },
      ...overrides,
    };
  }

  it("segments the point, decodes the mask, and dispatches UNION_MASK_BUFFER (union runs in the reducer)", async () => {
    pointSegment.mockResolvedValue({ mask: "https://fal/objmask.png" });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();

    await runPointSegment(segState(), dispatch, {
      region: { kind: "point", x: 2, y: 3 },
      signal,
      isStale: notStale,
    });

    expect(pointSegment).toHaveBeenCalledWith(
      "https://fal/work.png",
      { kind: "point", x: 2, y: 3 },
      expect.anything(),
    );
    expect(decodeMaskToBuffer).toHaveBeenCalledWith("https://fal/objmask.png", 4, 4);
    // The effect dispatches the DECODED mask; the reducer ORs it into the live
    // buffer (so a concurrent brush stroke isn't clobbered by a stale union).
    const call = dispatch.mock.calls.find((c) => c[0].type === "UNION_MASK_BUFFER");
    expect(call).toBeDefined();
    expect(call![0].buffer).toBe(decoded);
    // The effect must NOT pre-compute the union itself.
    expect(dispatch.mock.calls.some((c) => c[0].type === "SET_MASK_BUFFER")).toBe(false);
  });

  it("does NOT touch waitPhase (no full-screen WaitPanel — inline pulse instead)", async () => {
    pointSegment.mockResolvedValue({ mask: "https://fal/objmask.png" });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();

    await runPointSegment(segState(), dispatch, {
      region: { kind: "point", x: 1, y: 1 },
      signal,
      isStale: notStale,
    });

    expect(dispatch.mock.calls.some((c) => c[0].type === "SET_WAIT_PHASE")).toBe(false);
  });

  it("lazily uploads the work image on the first click (blob → EDIT_BASE_UPLOADED)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/uploaded.png");
    pointSegment.mockResolvedValue({ mask: "https://fal/objmask.png" });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();

    const state = segState({ editBase: { blob: new Blob(["w"]), width: 4, height: 4 } });
    await runPointSegment(state, dispatch, {
      region: { kind: "point", x: 1, y: 1 },
      signal,
      isStale: notStale,
    });

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "EDIT_BASE_UPLOADED", url: "https://fal/uploaded.png" });
    expect(pointSegment).toHaveBeenCalledWith("https://fal/uploaded.png", { kind: "point", x: 1, y: 1 }, expect.anything());
  });

  it("routes a box region to boxSegment (whole-object select)", async () => {
    boxSegment.mockResolvedValue({ mask: "https://fal/boxmask.png" });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();

    await runPointSegment(segState(), dispatch, {
      region: { kind: "box", x0: 1, y0: 1, x1: 3, y1: 3 },
      signal,
      isStale: notStale,
    });

    expect(boxSegment).toHaveBeenCalledWith(
      "https://fal/work.png",
      { kind: "box", x0: 1, y0: 1, x1: 3, y1: 3 },
      expect.anything(),
    );
    expect(pointSegment).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((c) => c[0].type === "UNION_MASK_BUFFER")).toBe(true);
  });

  it("is a no-op when editBase is missing or dims are not yet measured", async () => {
    const dispatch = vi.fn();
    await runPointSegment(segState({ editBase: undefined }), dispatch, {
      region: { kind: "point", x: 1, y: 1 },
      signal,
      isStale: notStale,
    });
    await runPointSegment(
      segState({ editBase: { url: "https://fal/work.png" } }),
      dispatch,
      { region: { kind: "point", x: 1, y: 1 }, signal, isStale: notStale },
    );
    expect(pointSegment).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops the result without dispatch when the run is stale (superseded)", async () => {
    pointSegment.mockResolvedValue({ mask: "https://fal/objmask.png" });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();
    let stale = false;

    const p = runPointSegment(segState(), dispatch, {
      region: { kind: "point", x: 1, y: 1 },
      signal,
      isStale: () => stale,
    });
    stale = true;
    await p;

    expect(dispatch.mock.calls.some((c) => c[0].type === "UNION_MASK_BUFFER")).toBe(false);
  });

  it("does not dispatch when the signal is already aborted (AD-12)", async () => {
    pointSegment.mockResolvedValue({ mask: "https://fal/objmask.png" });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();
    const aborted = new AbortController();
    aborted.abort();

    await runPointSegment(segState(), dispatch, {
      region: { kind: "point", x: 1, y: 1 },
      signal: aborted.signal,
      isStale: notStale,
    });

    expect(
      dispatch.mock.calls.some(
        (c) => c[0].type === "UNION_MASK_BUFFER" || c[0].type === "SET_ERROR",
      ),
    ).toBe(false);
  });

  it("maps a failure to a retryable SET_ERROR of step pointSegment", async () => {
    pointSegment.mockRejectedValue(new Error("boom"));
    const dispatch = vi.fn();

    await runPointSegment(segState(), dispatch, {
      region: { kind: "point", x: 1, y: 1 },
      signal,
      isStale: notStale,
    });

    const err = dispatch.mock.calls.find((c) => c[0].type === "SET_ERROR");
    expect(err).toBeDefined();
    expect(err![0].error.step).toBe("pointSegment");
    expect(err![0].error.retryable).toBe(true);
  });
});

describe("runDetectSelect (edit-mode auto furniture detect, texture bank)", () => {
  const buffer = { data: new Uint8Array(16), width: 4, height: 4 };
  const decoded = { data: new Uint8Array(16).fill(255), width: 4, height: 4 };

  function segState(overrides: Partial<Generation> = {}): Generation {
    return {
      step: "editor",
      epoch: 1,
      mode: "edit",
      editBase: { url: "https://fal/work.png", width: 4, height: 4 },
      maskDraft: { detectedMaskUrl: null, buffer },
      ...overrides,
    };
  }

  it("runs SAM detect on the work image, decodes, and dispatches UNION_MASK_BUFFER", async () => {
    detect.mockResolvedValue({ initialMask: "https://fal/furniture.png", categories: [] });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();

    await runDetectSelect(segState(), dispatch, { signal, isStale: notStale });

    expect(detect).toHaveBeenCalledWith("https://fal/work.png", expect.anything());
    expect(decodeMaskToBuffer).toHaveBeenCalledWith("https://fal/furniture.png", 4, 4);
    const call = dispatch.mock.calls.find((c) => c[0].type === "UNION_MASK_BUFFER");
    expect(call).toBeDefined();
    expect(call![0].buffer).toBe(decoded);
    // Reuses the editor's inline loader — no full-screen WaitPanel.
    expect(dispatch.mock.calls.some((c) => c[0].type === "SET_WAIT_PHASE")).toBe(false);
  });

  it("no-ops on « no furniture found » (null mask) without decoding or unioning", async () => {
    detect.mockResolvedValue({ initialMask: null, categories: [] });
    const dispatch = vi.fn();

    await runDetectSelect(segState(), dispatch, { signal, isStale: notStale });

    expect(decodeMaskToBuffer).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((c) => c[0].type === "UNION_MASK_BUFFER")).toBe(false);
  });

  it("lazily uploads the work image when only a blob is present (EDIT_BASE_UPLOADED)", async () => {
    uploadArtifact.mockResolvedValue("https://fal/uploaded.png");
    detect.mockResolvedValue({ initialMask: "https://fal/furniture.png", categories: [] });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();

    const state = segState({ editBase: { blob: new Blob(["w"]), width: 4, height: 4 } });
    await runDetectSelect(state, dispatch, { signal, isStale: notStale });

    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "EDIT_BASE_UPLOADED", url: "https://fal/uploaded.png" });
    expect(detect).toHaveBeenCalledWith("https://fal/uploaded.png", expect.anything());
  });

  it("is a no-op when editBase is missing or dims are not yet measured", async () => {
    const dispatch = vi.fn();
    await runDetectSelect(segState({ editBase: undefined }), dispatch, { signal, isStale: notStale });
    await runDetectSelect(
      segState({ editBase: { url: "https://fal/work.png" } }),
      dispatch,
      { signal, isStale: notStale },
    );
    expect(detect).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops the result without dispatch when the run goes stale mid-flight", async () => {
    detect.mockResolvedValue({ initialMask: "https://fal/furniture.png", categories: [] });
    decodeMaskToBuffer.mockResolvedValue(decoded);
    const dispatch = vi.fn();
    let stale = false;

    const p = runDetectSelect(segState(), dispatch, { signal, isStale: () => stale });
    stale = true;
    await p;

    expect(dispatch.mock.calls.some((c) => c[0].type === "UNION_MASK_BUFFER")).toBe(false);
  });

  it("maps a failure to a retryable SET_ERROR of step detect", async () => {
    detect.mockRejectedValue(new Error("boom"));
    const dispatch = vi.fn();

    await runDetectSelect(segState(), dispatch, { signal, isStale: notStale });

    const err = dispatch.mock.calls.find((c) => c[0].type === "SET_ERROR");
    expect(err).toBeDefined();
    expect(err![0].error.step).toBe("detect");
    expect(err![0].error.retryable).toBe(true);
  });
});
