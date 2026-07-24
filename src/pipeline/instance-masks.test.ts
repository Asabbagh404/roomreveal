import { afterEach, describe, expect, it, vi } from "vitest";
import { detectInstanceMasks } from "./instance-masks";

const opts = { signal: new AbortController().signal, onPhase: vi.fn() };
const blob = new Blob(["jpeg"], { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectInstanceMasks adapter (Motion Brush, Story 4.8)", () => {
  const instances = [
    { label: "cabinet", box: [0.1, 0.2, 0.4, 0.9], area: 0.21, mask: "AAAA" },
    { label: "oven", box: [0.7, 0.4, 0.9, 0.9], area: 0.1, mask: "BBBB" },
  ];

  it("parses instances + static mask into data URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ instances, static_mask: "SHELL==" }),
      })),
    );
    const result = await detectInstanceMasks(blob, opts);
    expect(result.staticMask).toBe("data:image/png;base64,SHELL==");
    expect(result.instances).toHaveLength(2);
    expect(result.instances[0]).toEqual({
      label: "cabinet",
      box: [0.1, 0.2, 0.4, 0.9],
      area: 0.21,
      mask: "data:image/png;base64,AAAA",
    });
  });

  it("drops malformed instances at the boundary and keeps the valid ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          static_mask: "SHELL==",
          instances: [
            instances[0],
            { label: "", box: [0.1, 0.2, 0.3, 0.4], area: 0.1, mask: "x" }, // empty label
            { label: "oven", box: [0.1, 0.2, 0.3], area: 0.1, mask: "x" }, // 3-coord box
            { label: "sink", box: [0.1, 0.2, 0.3, 0.4], area: 0.1 }, // missing mask
            { label: "rug", box: [0.1, 0.2, 0.3, 0.4], area: 0.1, mask: "" }, // empty mask
          ],
        }),
      })),
    );
    const result = await detectInstanceMasks(blob, opts);
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0].label).toBe("cabinet");
  });

  it("maps HTTP 204 to no furniture (empty instances + empty staticMask, FR-16)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 204, ok: true })));
    const result = await detectInstanceMasks(blob, opts);
    expect(result.instances).toEqual([]);
    expect(result.staticMask).toBe("");
  });

  it("converts a body without a static_mask string into a retryable detect StepError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ instances }),
      })),
    );
    const rejection = await detectInstanceMasks(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
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
    const rejection = await detectInstanceMasks(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
  });

  it("converts a non-OK response into a retryable detect StepError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500, ok: false })));
    const rejection = await detectInstanceMasks(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
  });

  it("converts a network failure into a retryable detect StepError (no raw leak)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED localhost:8000");
      }),
    );
    const rejection = await detectInstanceMasks(blob, opts).catch((e) => e);
    expect(rejection).toMatchObject({ step: "detect", retryable: true });
    expect(rejection.userMessage).not.toContain("ECONNREFUSED");
  });

  it("emits the generating wait phase", async () => {
    const onPhase = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 204, ok: true })));
    await detectInstanceMasks(blob, { ...opts, onPhase });
    expect(onPhase).toHaveBeenCalledWith("generating");
  });
});
