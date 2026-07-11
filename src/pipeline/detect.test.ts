import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the fal client (allowed only inside pipeline/, AR-TESTS). The adapter is
// the unit under test; the network boundary is faked.
const subscribe = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: vi.fn(),
}));

// composeMask does the browser-only canvas union + upload; mocked at its
// boundary so the adapter is unit-testable (the union itself is live-verified).
const composeMask = vi.fn(async (urls: string[]) => `composed:${urls.length}`);
vi.mock("./compose-mask", () => ({
  composeMask: (urls: string[]) => composeMask(urls),
}));

import { detect } from "./detect";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };

afterEach(() => {
  subscribe.mockReset();
  composeMask.mockClear();
});

describe("detect adapter (AD-5)", () => {
  it("unions the per-segment masks (preferred over the weaker combined preview)", async () => {
    subscribe.mockResolvedValue({
      data: {
        image: { url: "https://fal/mask.png" },
        masks: [{ url: "https://fal/seg1.png" }, { url: "https://fal/seg2.png" }],
      },
    });
    const result = await detect("https://fal/photo.jpg", opts);
    expect(composeMask).toHaveBeenCalledWith([
      "https://fal/seg1.png",
      "https://fal/seg2.png",
    ]);
    expect(result.initialMask).toBe("composed:2"); // union, not image preview
    expect(Array.isArray(result.categories)).toBe(true); // internal-only, never shown
  });

  it("unions even a single segment (ignores the combined preview when masks exist)", async () => {
    subscribe.mockResolvedValue({
      data: { masks: [{ url: "https://fal/seg1.png" }] },
    });
    const result = await detect("https://fal/photo.jpg", opts);
    expect(composeMask).toHaveBeenCalledWith(["https://fal/seg1.png"]);
    expect(result.initialMask).toBe("composed:1");
  });

  it("falls back to the combined preview when no per-segment masks are returned", async () => {
    subscribe.mockResolvedValue({
      data: { image: { url: "https://fal/preview.png" }, masks: [] },
    });
    const result = await detect("https://fal/photo.jpg", opts);
    expect(composeMask).not.toHaveBeenCalled();
    expect(result.initialMask).toBe("https://fal/preview.png");
  });

  it("returns initialMask null when no segment is found (FR-16)", async () => {
    subscribe.mockResolvedValue({ data: { masks: [] } });
    const result = await detect("https://fal/photo.jpg", opts);
    expect(result.initialMask).toBeNull();
  });

  it("maps queue statuses to wait phases", async () => {
    const onPhase = vi.fn();
    subscribe.mockImplementation(
      (_id: string, cfg: { onQueueUpdate: (u: { status: string }) => void }) => {
        cfg.onQueueUpdate({ status: "IN_QUEUE" });
        cfg.onQueueUpdate({ status: "IN_PROGRESS" });
        return Promise.resolve({ data: { image: { url: "u" } } });
      },
    );
    await detect("https://fal/photo.jpg", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
  });

  it("maps a COMPLETED queue status to the finalizing phase", async () => {
    const onPhase = vi.fn();
    subscribe.mockImplementation(
      (_id: string, cfg: { onQueueUpdate: (u: { status: string }) => void }) => {
        cfg.onQueueUpdate({ status: "COMPLETED" });
        return Promise.resolve({ data: { image: { url: "u" } } });
      },
    );
    await detect("https://fal/photo.jpg", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("treats an empty-string mask URL as no furniture (FR-16)", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "" }, masks: [{ url: "" }] } });
    const result = await detect("https://fal/photo.jpg", opts);
    expect(result.initialMask).toBeNull();
  });

  it("converts a rejection into a retryable detect StepError, never leaking the raw fal error", async () => {
    subscribe.mockRejectedValue(new Error("fal 500 boom"));
    const rejection = await detect("https://fal/photo.jpg", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
    expect(rejection.userMessage).not.toContain("boom"); // no native trace in UI text
  });
});
