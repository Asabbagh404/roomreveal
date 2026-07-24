import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the fal client (allowed only inside pipeline/, AR-TESTS). Never mock @fal-ai/client.
const subscribe = vi.fn();
const uploadArtifact = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: (...args: unknown[]) => uploadArtifact(...args),
}));

import { LOCAL_REVERSE_URL } from "./config";
import { videoMotionBrush } from "./video-motion-brush";
import type { InstanceMasksResult } from "./types";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };

function masks(count: number): InstanceMasksResult {
  return {
    staticMask: "data:image/png;base64,SHELL",
    instances: Array.from({ length: count }, (_, i) => ({
      label: `obj${i}`,
      box: [0.1, 0.4, 0.3, 0.6] as [number, number, number, number],
      area: (count - i) / count, // desc-ish areas so ordering is testable
      mask: `data:image/png;base64,M${i}`,
    })),
  };
}

let uploadCounter = 0;

beforeEach(() => {
  uploadCounter = 0;
  // uploadArtifact: unique fal URL per call so we can tell mask uploads apart.
  uploadArtifact.mockImplementation(async () => `https://fal/up-${uploadCounter++}`);
  // Trajectories read the static mask's pixel dims.
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1000, height: 800, close: vi.fn() })),
  );
  // fetch: data URLs, the exit clip, and the /reverse round-trip.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (typeof url === "string" && url === LOCAL_REVERSE_URL) {
        return { ok: true, blob: async () => new Blob(["reversed"], { type: "video/mp4" }) };
      }
      // data: URL decode or exit-clip fetch — both return a blob.
      return { ok: true, blob: async () => new Blob(["bytes"]) };
    }),
  );
  subscribe.mockResolvedValue({ data: { video: { url: "https://fal/exit.mp4" } } });
});

afterEach(() => {
  subscribe.mockReset();
  uploadArtifact.mockReset();
  vi.unstubAllGlobals();
});

describe("videoMotionBrush adapter (Story 4.8)", () => {
  it("sends dynamic_masks + static_mask_url and NEVER tail_image_url", async () => {
    await videoMotionBrush("https://fal/photo.jpg", masks(2), opts);
    const [id, cfg] = subscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> },
    ];
    expect(id).toBe("fal-ai/kling-video/v1.5/pro/image-to-video");
    expect(cfg.input.image_url).toBe("https://fal/photo.jpg");
    expect(typeof cfg.input.static_mask_url).toBe("string");
    expect(Array.isArray(cfg.input.dynamic_masks)).toBe(true);
    expect((cfg.input.dynamic_masks as unknown[]).length).toBe(2);
    expect(cfg.input.tail_image_url).toBeUndefined();
    expect(cfg.input.duration).toBe("5");
  });

  it("attaches an exit trajectory to each dynamic mask", async () => {
    await videoMotionBrush("https://fal/photo.jpg", masks(1), opts);
    const [, cfg] = subscribe.mock.calls[0] as [
      string,
      { input: { dynamic_masks: { mask_url: string; trajectories: unknown[] }[] } },
    ];
    const dm = cfg.input.dynamic_masks[0];
    expect(typeof dm.mask_url).toBe("string");
    expect(dm.trajectories.length).toBeGreaterThanOrEqual(2);
  });

  it("caps to the 6 largest instances and logs the dropped count", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await videoMotionBrush("https://fal/photo.jpg", masks(8), opts);
    const [, cfg] = subscribe.mock.calls[0] as [
      string,
      { input: { dynamic_masks: unknown[] } },
    ];
    expect(cfg.input.dynamic_masks.length).toBe(6);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("2 dropped"));
    log.mockRestore();
  });

  it("POSTs the generated exit clip to /reverse and re-uploads the reversed MP4 as the reveal", async () => {
    const result = await videoMotionBrush("https://fal/photo.jpg", masks(1), opts);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    // The exit clip URL was fetched, and /reverse was POSTed.
    expect(fetchMock.mock.calls.some((c) => c[0] === "https://fal/exit.mp4")).toBe(true);
    const reverseCall = fetchMock.mock.calls.find((c) => c[0] === LOCAL_REVERSE_URL);
    expect(reverseCall).toBeDefined();
    expect((reverseCall?.[1] as { method: string }).method).toBe("POST");
    // The reveal is a fal URL (the reversed MP4 re-uploaded, last upload).
    expect(result.reveal).toMatch(/^https:\/\/fal\/up-/);
  });

  it("maps queue statuses to wait phases", async () => {
    const onPhase = vi.fn();
    subscribe.mockImplementation(
      (_id: string, cfg: { onQueueUpdate: (u: { status: string }) => void }) => {
        cfg.onQueueUpdate({ status: "IN_QUEUE" });
        cfg.onQueueUpdate({ status: "IN_PROGRESS" });
        cfg.onQueueUpdate({ status: "COMPLETED" });
        return Promise.resolve({ data: { video: { url: "https://fal/exit.mp4" } } });
      },
    );
    await videoMotionBrush("https://fal/photo.jpg", masks(1), { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("uploading");
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("converts a kling failure into a retryable video StepError, no raw leak", async () => {
    subscribe.mockRejectedValue(new Error("kling 500 boom"));
    const rejection = await videoMotionBrush("https://fal/photo.jpg", masks(1), opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
    expect(rejection.userMessage).not.toContain("boom");
  });

  it("treats a kling run with no video URL as a failure", async () => {
    subscribe.mockResolvedValue({ data: {} });
    const rejection = await videoMotionBrush("https://fal/photo.jpg", masks(1), opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
  });

  it("converts a failing /reverse into a retryable video StepError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (url === LOCAL_REVERSE_URL) return { ok: false, blob: async () => new Blob() };
        return { ok: true, blob: async () => new Blob(["bytes"]) };
      }),
    );
    const rejection = await videoMotionBrush("https://fal/photo.jpg", masks(1), opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
  });

  it("converts an upload failure into a retryable video StepError", async () => {
    uploadArtifact.mockRejectedValue(new Error("fal storage boom"));
    const rejection = await videoMotionBrush("https://fal/photo.jpg", masks(1), opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
    expect(rejection.userMessage).not.toContain("boom");
  });
});
