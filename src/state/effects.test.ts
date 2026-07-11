import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the pipeline at the adapter boundary (AR-TESTS) — never mock @fal-ai/client here.
const detect = vi.fn();
const uploadArtifact = vi.fn();
vi.mock("@/pipeline", () => ({
  detect: (...a: unknown[]) => detect(...a),
  uploadArtifact: (...a: unknown[]) => uploadArtifact(...a),
}));

import { runDetect } from "./effects";
import type { Generation } from "./types";

function baseState(overrides: Partial<Generation> = {}): Generation {
  return {
    step: "mask",
    epoch: 1,
    originalPhoto: { blob: new Blob(["p"]), detectionBlob: new Blob(["d"]) },
    ...overrides,
  };
}

const notStale = () => false;
const signal = new AbortController().signal;

afterEach(() => {
  detect.mockReset();
  uploadArtifact.mockReset();
});

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

  it("skips the upload when the detection copy already has a fal URL (memoized)", async () => {
    detect.mockResolvedValue({ initialMask: null, categories: [] });
    const dispatch = vi.fn();
    const state = baseState({
      originalPhoto: {
        blob: new Blob(["p"]),
        detectionBlob: new Blob(["d"]),
        detectionFalUrl: "https://fal/detect.jpg",
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
