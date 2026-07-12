import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the fal client (allowed only inside pipeline/, AR-TESTS). The adapter is
// the unit under test; the network boundary is faked. Never mock @fal-ai/client.
const subscribe = vi.fn();
vi.mock("./client", () => ({
  fal: { subscribe: (...args: unknown[]) => subscribe(...args) },
  uploadArtifact: vi.fn(),
}));

import { inpaint } from "./inpaint";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };

afterEach(() => {
  subscribe.mockReset();
});

describe("inpaint adapter (AD-5)", () => {
  it("returns the erased image URL as the empty room", async () => {
    subscribe.mockResolvedValue({
      data: { image: { url: "https://fal/empty.png", width: 1024, height: 768 } },
    });
    const result = await inpaint("https://fal/photo.jpg", "https://fal/mask.png", opts);
    expect(result.emptyRoom).toBe("https://fal/empty.png");
  });

  it("sends the photo + mask URLs and a manual mask type to the model input", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "u" } } });
    await inpaint("https://fal/photo.jpg", "https://fal/mask.png", opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.image_url).toBe("https://fal/photo.jpg");
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
    await inpaint("https://fal/photo.jpg", "https://fal/mask.png", { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("queued");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledWith("finalizing");
  });

  it("throws a retryable inpaint StepError when the model returns no image", async () => {
    subscribe.mockResolvedValue({ data: {} });
    const rejection = await inpaint("https://fal/photo.jpg", "https://fal/mask.png", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "inpaint", retryable: true });
  });

  it("treats an empty-string image URL as a failure (no silent empty result)", async () => {
    subscribe.mockResolvedValue({ data: { image: { url: "" } } });
    const rejection = await inpaint("https://fal/photo.jpg", "https://fal/mask.png", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "inpaint", retryable: true });
  });

  it("converts a rejection into a retryable inpaint StepError, never leaking the raw fal error", async () => {
    subscribe.mockRejectedValue(new Error("fal 500 boom"));
    const rejection = await inpaint("https://fal/photo.jpg", "https://fal/mask.png", opts).catch(
      (e) => e,
    );
    expect(rejection).toMatchObject({ step: "inpaint", retryable: true });
    expect(rejection.userMessage).not.toContain("boom"); // no native trace in UI text
  });
});
