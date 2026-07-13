import { afterEach, describe, expect, it, vi } from "vitest";

const uploadArtifact = vi.fn();
vi.mock("./client", () => ({ uploadArtifact: (...a: unknown[]) => uploadArtifact(...a) }));

// fetch → blob, faked.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { resolveTextureUrl, __resetTextureCache } from "./texture-upload";

afterEach(() => {
  uploadArtifact.mockReset();
  fetchMock.mockReset();
  __resetTextureCache();
});

describe("resolveTextureUrl", () => {
  it("fetches the file, uploads it once, and memoizes the URL", async () => {
    fetchMock.mockResolvedValue({ blob: () => Promise.resolve(new Blob(["x"])) });
    uploadArtifact.mockResolvedValue("https://fal/bois.png");

    const a = await resolveTextureUrl("bois");
    const b = await resolveTextureUrl("bois");

    expect(a).toBe("https://fal/bois.png");
    expect(b).toBe("https://fal/bois.png");
    expect(uploadArtifact).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a retryable edit StepError for an unknown texture id", async () => {
    const err = await resolveTextureUrl("nope").catch((e) => e);
    expect(err).toMatchObject({ step: "edit", retryable: true });
  });
});
