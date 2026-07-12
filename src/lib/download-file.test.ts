import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./download-file";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadFile", () => {
  it("fetches the URL, wraps it in a blob: object URL, and clicks an <a download>", async () => {
    const blob = new Blob(["mp4-bytes"], { type: "video/mp4" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => blob })),
    );
    // jsdom doesn't implement createObjectURL — stub it.
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    // Capture the anchor the util creates (it's removed after click), and no-op
    // the click so jsdom doesn't try to navigate.
    let anchor: HTMLAnchorElement | undefined;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") anchor = el as HTMLAnchorElement;
      return el;
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await downloadFile("https://fal.media/x/reveal.mp4", "roomreveal.mp4");

    expect(fetch).toHaveBeenCalledWith("https://fal.media/x/reveal.mp4");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(anchor?.getAttribute("download")).toBe("roomreveal.mp4");
    expect(anchor?.getAttribute("href")).toBe("blob:mock-url");
    // The anchor is detached again after the click (no DOM litter).
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("revokes the object URL after the download (deferred, not synchronous)", async () => {
    vi.useFakeTimers();
    const blob = new Blob(["mp4"], { type: "video/mp4" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => blob })));
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadFile("https://fal.media/x/reveal.mp4", "roomreveal.mp4");

    expect(revokeObjectURL).not.toHaveBeenCalled(); // deferred — not synchronous
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    vi.useRealTimers();
  });

  it("rejects when the fetch is not ok (e.g. expired fal URL)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob() })),
    );
    await expect(
      downloadFile("https://fal.media/x/gone.mp4", "roomreveal.mp4"),
    ).rejects.toThrow(/404/);
  });
});
