import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeScene } from "./home-scene";
import { ParcoursScene } from "./parcours-scene";
import { GenerationProvider } from "@/state/generation-context";

describe("HomeScene (Story 5.1, AC1/AC2)", () => {
  it("renders the two mode cards with clear CTAs", () => {
    render(
      <GenerationProvider>
        <HomeScene />
      </GenerationProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Créer la vidéo révélation/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Éditer une image/ }),
    ).toBeDefined();
  });

  it("is what ParcoursScene shows while no mode is chosen (mode undefined)", () => {
    render(
      <GenerationProvider>
        <ParcoursScene />
      </GenerationProvider>,
    );
    expect(screen.getByText("Que voulez-vous créer ?")).toBeDefined();
  });

  it("choosing « Éditer une image » selects edit mode and moves to upload", () => {
    render(
      <GenerationProvider>
        <ParcoursScene />
      </GenerationProvider>,
    );
    // Home first…
    expect(screen.getByText("Que voulez-vous créer ?")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Éditer une image/ }));
    // …then the shared upload zone (edit mode, upload step). Home is gone.
    expect(screen.queryByText("Que voulez-vous créer ?")).toBeNull();
  });

  it("choosing the reveal card selects reveal mode and shows its upload title", () => {
    render(
      <GenerationProvider>
        <ParcoursScene />
      </GenerationProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Créer la vidéo révélation/ }),
    );
    expect(
      screen.getByText("Une photo. Une pièce qui se meuble toute seule."),
    ).toBeDefined();
  });

  it("ParcoursScene shows the editor placeholder at the editor step in edit mode", () => {
    render(
      <GenerationProvider
        initialState={{ step: "editor", epoch: 1, mode: "edit" }}
      >
        <ParcoursScene />
      </GenerationProvider>,
    );
    expect(
      screen.getByText("L'éditeur arrive à l'étape suivante."),
    ).toBeDefined();
  });
});
