import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadZone } from "./upload-zone";
import { Stepper } from "./stepper";
import { GenerationProvider } from "@/state/generation-context";
import { UPLOAD_MESSAGES } from "@/lib/validate-upload";

// Canvas is unavailable in jsdom — mock the browser-only resize primitive.
vi.mock("@/lib/resize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resize")>();
  return {
    ...actual,
    resizeToCanonicalJpeg: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
  };
});

function fileOfType(type: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], "photo", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function renderWithParcours() {
  return render(
    <GenerationProvider>
      <Stepper />
      <UploadZone />
    </GenerationProvider>,
  );
}

describe("UploadZone (FR-1/2/3, AC1/2/4)", () => {
  it("shows the format rejection message in the zone for a non-image file", async () => {
    renderWithParcours();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOfType("application/pdf")] } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(UPLOAD_MESSAGES.format);
  });

  it("normalizes a valid photo and advances the Parcours to Masque (AC4)", async () => {
    renderWithParcours();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOfType("image/jpeg")] } });

    // After PHOTO_NORMALIZED the stepper's current step is Masque.
    await waitFor(() => {
      expect(
        screen.getByText("Masque").closest("button")?.getAttribute("aria-current"),
      ).toBe("step");
    });
  });
});
