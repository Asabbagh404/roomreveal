import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLocal } from "./detect-local";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };
const blob = new Blob(["jpeg"], { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectLocal adapter (local Grounded-SAM backend)", () => {
  it("returns the unioned mask as a data URL on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      })),
    );
    const result = await detectLocal(blob, opts);
    expect(result.initialMask).toMatch(/^data:image\/png/);
    expect(result.categories).toEqual([]);
  });

  it("maps HTTP 204 to no furniture (initialMask null, FR-16)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 204, ok: true })));
    const result = await detectLocal(blob, opts);
    expect(result.initialMask).toBeNull();
  });

  it("converts a non-OK response into a retryable detect StepError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500, ok: false })));
    const rejection = await detectLocal(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
  });

  it("converts a network failure into a retryable detect StepError (no raw leak)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED localhost:8000");
      }),
    );
    const rejection = await detectLocal(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
    expect(rejection.userMessage).not.toContain("ECONNREFUSED");
  });

  it("emits the generating wait phase", async () => {
    const onPhase = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 204, ok: true })),
    );
    await detectLocal(blob, { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("generating");
  });
});
