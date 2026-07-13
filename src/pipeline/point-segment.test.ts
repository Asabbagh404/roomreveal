import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the fal client (allowed only inside pipeline/, AR-TESTS). The adapter is
// the unit under test; the network boundary is faked. Never mock @fal-ai/client.
const subscribe = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: vi.fn(),
}));

import { pointSegment } from "./point-segment";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };
const point = { x: 12, y: 34 };

afterEach(() => {
  subscribe.mockReset();
});

describe("pointSegment adapter (Story 5.6, SAM point-prompt)", () => {
  it("returns the object mask URL (the clean `image` field, apply_mask:false)", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "https://fal/obj.png" } } });
    const result = await pointSegment("https://fal/work.png", point, opts);
    expect(result.mask).toBe("https://fal/obj.png");
  });

  it("falls back to defensive mask/masks fields if present", async () => {
    subscribe.mockResolvedValue({ data: { mask: { url: "https://fal/m.png" } } });
    expect((await pointSegment("u", point, opts)).mask).toBe("https://fal/m.png");
    subscribe.mockResolvedValue({ data: { masks: [{ url: "https://fal/m0.png" }] } });
    expect((await pointSegment("u", point, opts)).mask).toBe("https://fal/m0.png");
  });

  it("sends the image URL, a single positive point (rounded), and apply_mask:false", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "u" } } });
    await pointSegment("https://fal/work.png", { x: 12.7, y: 34.2 }, opts);
    const [, cfg] = subscribe.mock.calls[0] as [
      string,
      { input: Record<string, unknown> },
    ];
    expect(cfg.input.image_url).toBe("https://fal/work.png");
    expect(cfg.input.prompts).toEqual([{ x: 13, y: 34, label: "1" }]);
    expect(cfg.input.apply_mask).toBe(false);
  });

  it("maps queue statuses to wait phases", async () => {
    const onPhase = vi.fn();
    subscribe.mockImplementation(
      (_id: string, cfg: { onQueueUpdate: (u: { status: string }) => void }) => {
        cfg.onQueueUpdate({ status: "IN_QUEUE" });
        cfg.onQueueUpdate({ status: "IN_PROGRESS" });
        cfg.onQueueUpdate({ status: "COMPLETED" });
        return Promise.resolve({ data: { image: { url: "u" } } });
      },
    );
    await pointSegment("u", point, { signal: opts.signal, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("throws a retryable pointSegment StepError on an empty result", async () => {
    subscribe.mockResolvedValue({ data: {} });
    await expect(pointSegment("u", point, opts)).rejects.toMatchObject({
      step: "pointSegment",
      retryable: true,
    });
  });

  it("throws a retryable pointSegment StepError when the fal call rejects", async () => {
    subscribe.mockRejectedValue(new Error("network"));
    await expect(pointSegment("u", point, opts)).rejects.toMatchObject({
      step: "pointSegment",
      retryable: true,
    });
  });

  it("requests 24 h object retention (AD-9)", async () => {
    subscribe.mockResolvedValue({ data: { mask: { url: "u" } } });
    await pointSegment("u", point, opts);
    const [, cfg] = subscribe.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(cfg.headers["x-fal-object-lifecycle-preference"]).toContain("86400");
  });
});
