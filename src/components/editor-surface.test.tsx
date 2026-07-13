import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSurface } from "./editor-surface";
import { ParcoursScene } from "./parcours-scene";
import {
  GenerationProvider,
  useGeneration,
} from "@/state/generation-context";
import type { Generation } from "@/state/types";
import type { GenerationAction } from "@/state/reducer";

// downloadFile is browser-only (fetch + DOM) and already unit-tested in
// download-file.test.ts — mock it at the boundary to assert the wiring.
const downloadFile = vi.fn();
vi.mock("@/lib/download-file", () => ({
  downloadFile: (...a: unknown[]) => downloadFile(...a),
}));

// jsdom Images never load, so the dims-measure effect (new Image().onload) would
// never fire and the surface would stay dims-less. Stub Image to resolve onload
// synchronously with fixed canonical dims so the edit loop is testable.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 4;
  naturalHeight = 4;
  set src(_v: string) {
    if (this.onload) this.onload();
  }
}

const buffer = { data: new Uint8Array(16), width: 4, height: 4 };

/** Editor sitting on an edited work image (fal result URL + dims + blank mask). */
function editorState(overrides: Partial<Generation> = {}): Generation {
  return {
    step: "editor",
    epoch: 1,
    mode: "edit",
    editBase: { url: "https://fal/work.png", width: 4, height: 4 },
    maskDraft: { detectedMaskUrl: null, buffer },
    ...overrides,
  };
}

// Test harness: exposes the provider's dispatch so a test can simulate an applied
// retouche (EDIT_APPLIED bumps the epoch → retouchCount > 0).
let dispatchRef: ((a: GenerationAction) => void) | null = null;
function Capture() {
  const { dispatch } = useGeneration();
  useEffect(() => {
    dispatchRef = dispatch;
  }, [dispatch]);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => {
  downloadFile.mockReset();
  dispatchRef = null;
  vi.unstubAllGlobals();
});

describe("EditorSurface closure actions (Story 5.5)", () => {
  it("« Télécharger l'image » downloads the current work image via downloadFile", async () => {
    downloadFile.mockResolvedValue(undefined);
    render(
      <GenerationProvider initialState={editorState()}>
        <EditorSurface />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Télécharger l’image/ }));
    await waitFor(() =>
      expect(downloadFile).toHaveBeenCalledWith(
        "https://fal/work.png",
        "roomreveal-edition.png",
      ),
    );
  });

  it("« Nouvelle image » with no applied retouch resets directly (no confirm dialog)", () => {
    render(
      <GenerationProvider initialState={editorState()}>
        <ParcoursScene />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle image" }));
    expect(screen.queryByText("Repartir d’une nouvelle image ?")).toBeNull();
    expect(screen.getByText(/Déposez la photo/)).toBeDefined();
  });

  it("« Nouvelle image » with an applied, undownloaded retouch asks for confirmation", () => {
    render(
      <GenerationProvider initialState={editorState()}>
        <Capture />
        <EditorSurface />
      </GenerationProvider>,
    );
    // Simulate an applied retouch → epoch bumps → retouchCount > 0.
    act(() => dispatchRef!({ type: "EDIT_APPLIED", image: "https://fal/edited.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle image" }));
    expect(screen.getByText("Repartir d’une nouvelle image ?")).toBeDefined();
  });

  it("re-arms the unsaved guard after a download followed by a new retouch (case d)", async () => {
    downloadFile.mockResolvedValue(undefined);
    render(
      <GenerationProvider initialState={editorState()}>
        <Capture />
        <EditorSurface />
      </GenerationProvider>,
    );
    // Apply a retouch, download it, then apply ANOTHER retouch.
    act(() => dispatchRef!({ type: "EDIT_APPLIED", image: "https://fal/edited1.png" }));
    fireEvent.click(screen.getByRole("button", { name: /Télécharger l’image/ }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    act(() => dispatchRef!({ type: "EDIT_APPLIED", image: "https://fal/edited2.png" }));
    // The new retouch is unsaved → « Nouvelle image » must confirm again.
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle image" }));
    expect(screen.getByText("Repartir d’une nouvelle image ?")).toBeDefined();
  });

  it("disables « Télécharger l'image » until the work image is ready", () => {
    render(
      <GenerationProvider
        initialState={{ step: "editor", epoch: 1, mode: "edit" }}
      >
        <EditorSurface />
      </GenerationProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Télécharger l’image/ }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("EditorSurface « Modifier » operation (texture bank)", () => {
  // A painted zone: any non-zero byte makes the buffer non-empty (isBufferEmpty).
  function paintedState(overrides: Partial<Generation> = {}): Generation {
    const data = new Uint8Array(16);
    data[0] = 255;
    return editorState({
      maskDraft: { detectedMaskUrl: null, buffer: { data, width: 4, height: 4 } },
      ...overrides,
    });
  }

  it("shows the texture bar and instruction field only under « Modifier »", () => {
    render(
      <GenerationProvider initialState={editorState()}>
        <EditorSurface />
      </GenerationProvider>,
    );
    // Not visible under the default « Enlever ».
    expect(screen.queryByRole("radiogroup", { name: /texture/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByRole("radiogroup", { name: /texture/i })).toBeDefined();
    expect(screen.getByLabelText("Modification à appliquer")).toBeDefined();

    // Switching away hides them again.
    fireEvent.click(screen.getByRole("button", { name: "Enlever" }));
    expect(screen.queryByRole("radiogroup", { name: /texture/i })).toBeNull();
  });

  it("enables « Appliquer » when a texture is chosen (zone painted)", () => {
    render(
      <GenerationProvider initialState={paintedState()}>
        <EditorSurface />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const apply = screen.getByRole("button", { name: "Appliquer" });
    // No texture and no instruction yet → disabled.
    expect(apply.hasAttribute("disabled")).toBe(true);
    // Choosing a texture is enough.
    fireEvent.click(screen.getByRole("radio", { name: /bois/i }));
    expect(apply.hasAttribute("disabled")).toBe(false);
  });

  it("enables « Appliquer » with an instruction only, no texture (zone painted)", () => {
    render(
      <GenerationProvider initialState={paintedState()}>
        <EditorSurface />
      </GenerationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const apply = screen.getByRole("button", { name: "Appliquer" });
    expect(apply.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Modification à appliquer"), {
      target: { value: "bleu marine" },
    });
    expect(apply.hasAttribute("disabled")).toBe(false);
  });
});
