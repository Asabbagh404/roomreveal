import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLocal } from "./detect-local";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };
const blob = new Blob(["jpeg"], { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectLocal adapter (local Grounded-SAM backend)", () => {
  const instances = [
    { label: "cabinet", box: [0.1, 0.2, 0.4, 0.9], area: 0.21 },
    { label: "oven", box: [0.7, 0.4, 0.9, 0.9], area: 0.1 },
  ];

  it("returns the unioned mask as a data URL built from the JSON base64 payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ mask: "iVBORbase64==", instances }),
      })),
    );
    const result = await detectLocal(blob, opts);
    expect(result.initialMask).toBe("data:image/png;base64,iVBORbase64==");
    expect(result.categories).toEqual([]);
  });

  it("passes the per-object instances through (Story 4.6)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ mask: "AAAA", instances }),
      })),
    );
    const result = await detectLocal(blob, opts);
    expect(result.instances).toEqual(instances);
  });

  it("drops malformed instances at the boundary and keeps the valid ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          mask: "AAAA",
          instances: [
            instances[0],
            { label: "", box: [0.1, 0.2, 0.3, 0.4], area: 0.1 }, // empty label
            { label: "oven", box: [0.1, 0.2, 0.3], area: 0.1 }, // 3-coord box
            { label: "sink", box: [0.1, 0.2, 0.3, "x"], area: 0.1 }, // NaN coord
            { label: "rug", box: [0.1, 0.2, 0.3, 0.4] }, // missing area
          ],
        }),
      })),
    );
    const result = await detectLocal(blob, opts);
    expect(result.instances).toEqual([instances[0]]);
  });

  it("degrades non-array or all-invalid instances to undefined (fallback prompt, not an error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ mask: "AAAA", instances: "not-an-array" }),
      })),
    );
    const result = await detectLocal(blob, opts);
    expect(result.initialMask).toMatch(/^data:image\/png/);
    expect(result.instances).toBeUndefined();
  });

  it("converts an empty mask string into a retryable detect StepError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ mask: "", instances }),
      })),
    );
    const rejection = await detectLocal(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
  });

  it("maps HTTP 204 to no furniture (initialMask null, no instances, FR-16)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 204, ok: true })));
    const result = await detectLocal(blob, opts);
    expect(result.initialMask).toBeNull();
    expect(result.instances).toBeUndefined();
  });

  it("converts a malformed JSON body into a retryable detect StepError (AD-8)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      })),
    );
    const rejection = await detectLocal(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
  });

  it("converts a JSON body without a mask string into a retryable detect StepError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ instances }),
      })),
    );
    const rejection = await detectLocal(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
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
