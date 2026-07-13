import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the fal client (allowed only inside pipeline/, AR-TESTS). The adapter is
// the unit under test; the network boundary is faked. Never mock @fal-ai/client.
const subscribe = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: vi.fn(),
}));

import { editAdd, editRemove } from "./edit";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };

afterEach(() => {
  subscribe.mockReset();
});

describe("editRemove adapter (Story 5.3, bria eraser)", () => {
  it("returns the erased image URL", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "https://fal/out.png" } } });
    const result = await editRemove("https://fal/work.jpg", "https://fal/mask.png", opts);
    expect(result.image).toBe("https://fal/out.png");
  });

  it("sends the work image + mask URLs and a manual mask type", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "u" } } });
    await editRemove("https://fal/work.jpg", "https://fal/mask.png", opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.image_url).toBe("https://fal/work.jpg");
    expect(cfg.input.mask_url).toBe("https://fal/mask.png");
    expect(cfg.input.mask_type).toBe("manual");
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
    await editRemove("https://fal/work.jpg", "https://fal/mask.png", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("throws a retryable edit StepError when the model returns no image", async () => {
    subscribe.mockResolvedValue({ data: {} });
    const rejection = await editRemove("https://fal/work.jpg", "https://fal/mask.png", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "edit", retryable: true });
  });

  it("treats an empty-string image URL as a failure", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "" } } });
    const rejection = await editRemove("https://fal/work.jpg", "https://fal/mask.png", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "edit", retryable: true });
  });

  it("times out into a retryable edit StepError when the model never settles", async () => {
    vi.useFakeTimers();
    try {
      subscribe.mockReturnValue(new Promise(() => {})); // never resolves
      const rejection = editRemove("https://fal/work.jpg", "https://fal/mask.png", opts).catch(
        (e) => e,
      );
      await vi.advanceTimersByTimeAsync(90_001); // TIMEOUTS_MS.edit
      expect(await rejection).toMatchObject({ step: "edit", retryable: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("converts a rejection into a retryable edit StepError, never leaking the raw fal error", async () => {
    subscribe.mockRejectedValue(new Error("fal 500 boom"));
    const rejection = await editRemove("https://fal/work.jpg", "https://fal/mask.png", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "edit", retryable: true });
    expect(rejection.userMessage).not.toContain("boom");
  });
});

describe("editAdd adapter (Story 5.4, flux-pro/v1/fill)", () => {
  it("returns the first generated image URL (flux fill returns an images[] array)", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "https://fal/added.png" }] } });
    const result = await editAdd("https://fal/work.jpg", "https://fal/mask.png", "pot de fleur", opts);
    expect(result.image).toBe("https://fal/added.png");
  });

  it("sends the work image + mask URLs and the prompt to the model input", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "u" }] } });
    await editAdd("https://fal/work.jpg", "https://fal/mask.png", "pot de fleur", opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.image_url).toBe("https://fal/work.jpg");
    expect(cfg.input.mask_url).toBe("https://fal/mask.png");
    expect(cfg.input.prompt).toBe("pot de fleur");
  });

  it("maps queue statuses to wait phases", async () => {
    const onPhase = vi.fn();
    subscribe.mockImplementation(
      (_id: string, cfg: { onQueueUpdate: (u: { status: string }) => void }) => {
        cfg.onQueueUpdate({ status: "IN_QUEUE" });
        cfg.onQueueUpdate({ status: "IN_PROGRESS" });
        cfg.onQueueUpdate({ status: "COMPLETED" });
        return Promise.resolve({ data: { images: [{ url: "u" }] } });
      },
    );
    await editAdd("https://fal/work.jpg", "https://fal/mask.png", "x", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("throws a retryable edit StepError for every degenerate output shape", async () => {
    for (const data of [
      {}, // images key absent
      { images: [] }, // empty array
      { images: [{}] }, // first item has no url
      { images: [{ url: "" }] }, // empty-string url
    ]) {
      subscribe.mockResolvedValue({ data });
      const rejection = await editAdd("https://fal/w.jpg", "https://fal/m.png", "x", opts).catch(
        (e) => e,
      );
      expect(rejection).toMatchObject({ step: "edit", retryable: true });
    }
  });

  it("times out into a retryable edit StepError when the model never settles", async () => {
    vi.useFakeTimers();
    try {
      subscribe.mockReturnValue(new Promise(() => {}));
      const rejection = editAdd("https://fal/w.jpg", "https://fal/m.png", "x", opts).catch((e) => e);
      await vi.advanceTimersByTimeAsync(90_001);
      expect(await rejection).toMatchObject({ step: "edit", retryable: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("never leaks the raw fal error", async () => {
    subscribe.mockRejectedValue(new Error("fal 500 boom"));
    const rejection = await editAdd("https://fal/w.jpg", "https://fal/m.png", "x", opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "edit", retryable: true });
    expect(rejection.userMessage).not.toContain("boom");
  });
});
