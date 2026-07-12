import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the fal client (allowed only inside pipeline/, AR-TESTS). Never mock @fal-ai/client.
const subscribe = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: vi.fn(),
}));

import { video } from "./video";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };

afterEach(() => {
  subscribe.mockReset();
});

describe("video adapter (AD-5, FLF)", () => {
  it("returns the generated MP4 URL as the reveal", async () => {
    subscribe.mockResolvedValue({ data: { video: { url: "https://fal/reveal.mp4" } } });
    const result = await video("https://fal/empty.png", "https://fal/photo.jpg", opts);
    expect(result.reveal).toBe("https://fal/reveal.mp4");
  });

  it("sends the empty room as the FIRST frame and the photo as the LAST frame (AD-1)", async () => {
    subscribe.mockResolvedValue({ data: { video: { url: "u" } } });
    await video("https://fal/empty.png", "https://fal/photo.jpg", opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.start_image_url).toBe("https://fal/empty.png"); // Pièce vide = 1re frame
    expect(cfg.input.end_image_url).toBe("https://fal/photo.jpg"); // Photo originale = dernière frame
    expect(typeof cfg.input.prompt).toBe("string");
    expect(cfg.input.duration).toBe("5");
  });

  it("does not force an aspect_ratio (ratio inferred from the frames, AR-PIXELS)", async () => {
    subscribe.mockResolvedValue({ data: { video: { url: "u" } } });
    await video("https://fal/empty.png", "https://fal/photo.jpg", opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.aspect_ratio).toBeUndefined();
  });

  it("maps queue statuses to wait phases", async () => {
    const onPhase = vi.fn();
    subscribe.mockImplementation(
      (_id: string, cfg: { onQueueUpdate: (u: { status: string }) => void }) => {
        cfg.onQueueUpdate({ status: "IN_QUEUE" });
        cfg.onQueueUpdate({ status: "IN_PROGRESS" });
        cfg.onQueueUpdate({ status: "COMPLETED" });
        return Promise.resolve({ data: { video: { url: "u" } } });
      },
    );
    await video("https://fal/empty.png", "https://fal/photo.jpg", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("throws a retryable video StepError when no video is returned", async () => {
    subscribe.mockResolvedValue({ data: {} });
    const rejection = await video("https://fal/empty.png", "https://fal/photo.jpg", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
  });

  it("treats an empty-string video URL as a failure", async () => {
    subscribe.mockResolvedValue({ data: { video: { url: "" } } });
    const rejection = await video("https://fal/empty.png", "https://fal/photo.jpg", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
  });

  it("converts a rejection into a retryable video StepError, never leaking the raw fal error", async () => {
    subscribe.mockRejectedValue(new Error("fal 500 boom"));
    const rejection = await video("https://fal/empty.png", "https://fal/photo.jpg", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "video", retryable: true });
    expect(rejection.userMessage).not.toContain("boom");
  });
});
