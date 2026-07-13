import { afterEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: vi.fn(),
}));

import { autoEmptyRoom } from "./empty-room-auto";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };

afterEach(() => {
  subscribe.mockReset();
});

describe("autoEmptyRoom adapter (AD-5, maskless)", () => {
  it("returns the edited image URL as the empty room", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "https://fal/empty.png" }] } });
    const result = await autoEmptyRoom("https://fal/photo.jpg", opts);
    expect(result.emptyRoom).toBe("https://fal/empty.png");
  });

  it("sends the photo as image_urls[] and a prompt (no mask)", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "u" }] } });
    await autoEmptyRoom("https://fal/photo.jpg", opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.image_urls).toEqual(["https://fal/photo.jpg"]);
    expect(typeof cfg.input.prompt).toBe("string");
    expect(cfg.input.mask_url).toBeUndefined(); // maskless
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
    await autoEmptyRoom("https://fal/photo.jpg", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("throws a retryable inpaint StepError when no image is returned", async () => {
    subscribe.mockResolvedValue({ data: { images: [] } });
    const rejection = await autoEmptyRoom("https://fal/photo.jpg", opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "inpaint", retryable: true });
  });

  it("converts a rejection into a retryable inpaint StepError without leaking the raw error", async () => {
    subscribe.mockRejectedValue(new Error("fal 500 boom"));
    const rejection = await autoEmptyRoom("https://fal/photo.jpg", opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "inpaint", retryable: true });
    expect(rejection.userMessage).not.toContain("boom");
  });
});
