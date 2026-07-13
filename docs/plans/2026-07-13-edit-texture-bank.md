# « Modifier » + banque de textures — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter une 3ᵉ opération « Modifier » à l'éditeur qui applique une texture (vraie image de référence + prompt) et/ou une instruction texte à l'élément masqué.

**Architecture:** Extension de l'existant (mode édition, Epic 5). Nouveau modèle `flux-general/image-to-image` (masque d'inpainting + IP-Adapter + prompt) via un adaptateur `editModify` calqué sur `editAdd`. Banque servie depuis `public/textures/` + manifeste `textures.ts`, upload fal mémoïsé. UI : 3ᵉ pilule + bande de textures inline dans `EditorSurface`. Zéro changement de reducer.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind 4 + shadcn, fal.ai via proxy (`@fal-ai/client` confiné à `src/pipeline/`), Vitest.

**Référence design :** `docs/plans/2026-07-13-edit-texture-bank-design.md`. Respecter le spine : AD-3/5/6/7/8/9/11/12/14, AR-MODELS/PROMPTS/PIXELS/LAYERS.

> **Convention de commit** (règle globale) : `<type>: <description>`, pas d'attribution. Commit après chaque tâche verte.
>
> **Commande de test ciblée** : `npx vitest run <chemin>` (le script `npm test` lance tout).

---

### Task 1 : Banque — assets + manifeste

**Files:**
- Move: `textures/bois.png` → `public/textures/bois.png`
- Create: `src/pipeline/textures.ts`
- Test: `src/pipeline/textures.test.ts`

**Step 1 : Déplacer l'asset**

```bash
mkdir -p public/textures
git mv textures/bois.png public/textures/bois.png 2>/dev/null || (mv textures/bois.png public/textures/bois.png)
rmdir textures 2>/dev/null || true
```

**Step 2 : Écrire le test qui échoue** — `src/pipeline/textures.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { TEXTURES } from "./textures";

describe("texture bank manifest", () => {
  it("has at least the bois texture", () => {
    expect(TEXTURES.length).toBeGreaterThanOrEqual(1);
    expect(TEXTURES.some((t) => t.id === "bois")).toBe(true);
  });

  it("has unique ids", () => {
    const ids = TEXTURES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("serves every file from /textures/ with non-empty label and prompt", () => {
    for (const t of TEXTURES) {
      expect(t.file.startsWith("/textures/")).toBe(true);
      expect(t.label.trim()).not.toBe("");
      expect(t.prompt.trim()).not.toBe("");
    }
  });
});
```

**Step 3 : Lancer → échec**

Run: `npx vitest run src/pipeline/textures.test.ts`
Expected: FAIL (`Cannot find module './textures'`).

**Step 4 : Implémenter** — `src/pipeline/textures.ts`

```ts
/**
 * Texture bank manifest (edit-mode « Modifier »). Single source of truth: adding
 * a texture = drop a PNG in public/textures/ + one entry here. `file` is a
 * public path served by Next; `prompt` is the text half of the hybrid material
 * transfer (paired with the PNG as an IP-Adapter reference in editModify).
 * Holds constants only — no fal import (AD-5).
 */
export interface Texture {
  id: string;
  label: string;
  /** Public path under /textures/, served by Next from public/. */
  file: string;
  /** Descriptive prompt fed alongside the reference image (AR-PROMPTS). */
  prompt: string;
}

export const TEXTURES: readonly Texture[] = [
  {
    id: "bois",
    label: "Bois",
    file: "/textures/bois.png",
    prompt: "natural oak wood texture, visible wood grain, matte finish",
  },
] as const;

/** Lookup a texture by id (returns undefined if unknown). */
export function findTexture(id: string): Texture | undefined {
  return TEXTURES.find((t) => t.id === id);
}
```

**Step 5 : Lancer → succès**

Run: `npx vitest run src/pipeline/textures.test.ts` → PASS.

**Step 6 : Commit**

```bash
git add public/textures src/pipeline/textures.ts src/pipeline/textures.test.ts
git commit -m "feat: add texture bank manifest and serve textures from public/"
```

---

### Task 2 : Config — rôle modèle, timeout, allowlist

**Files:**
- Modify: `src/pipeline/config.ts`
- Test: `src/pipeline/config.test.ts` (ajouter des assertions)

**Step 1 : Écrire le test qui échoue** — ajouter dans `src/pipeline/config.test.ts`

```ts
it("registers the editModify model, timeout and allowlist entries", () => {
  expect(MODELS.editModify).toBe("fal-ai/flux-general/image-to-image");
  expect(TIMEOUTS_MS.editModify).toBeGreaterThan(0);
  expect(FAL_ALLOWED_ENDPOINTS).toContain(`${MODELS.editModify}`);
  expect(FAL_ALLOWED_ENDPOINTS).toContain(`${MODELS.editModify}/**`);
});
```

(S'assurer que `MODELS`, `TIMEOUTS_MS`, `FAL_ALLOWED_ENDPOINTS` sont importés en tête du fichier de test.)

**Step 2 : Lancer → échec**

Run: `npx vitest run src/pipeline/config.test.ts`
Expected: FAIL (`editModify` undefined).

**Step 3 : Implémenter** — `src/pipeline/config.ts`

Dans `MODELS`, après `editAdd` :

```ts
  // Masked inpaint + IP-Adapter (real texture image reference) + prompt for the
  // free-edit « Modifier » (texture bank): regenerates the WHITE masked region
  // constrained by an IP-Adapter reference image (the chosen texture) and the
  // prompt, leaving the rest pixel-identical (mask-native locality). Swappable /
  // bench-gated. Documented fallback: nano-banana-2/edit (maskless) + a
  // highlighted-region guidance image, if the IP-Adapter `scale` proves fiddly.
  editModify: "fal-ai/flux-general/image-to-image",
```

Dans `TIMEOUTS_MS`, après `editAdd` :

```ts
  editModify: 90_000,
```

Dans `FAL_ALLOWED_ENDPOINTS`, avant `video` :

```ts
  // Masked IP-Adapter inpaint for the free-edit « Modifier » (texture bank).
  `${MODELS.editModify}/**`,
  `${MODELS.editModify}`,
```

(Mettre aussi à jour le commentaire « Wired models: … » de l'allowlist pour inclure `editModify`.)

**Step 4 : Lancer → succès**

Run: `npx vitest run src/pipeline/config.test.ts` → PASS.

**Step 5 : Commit**

```bash
git add src/pipeline/config.ts src/pipeline/config.test.ts
git commit -m "feat: register editModify model role, timeout and proxy allowlist"
```

---

### Task 3 : Prompt composé `buildModifyPrompt`

**Files:**
- Modify: `src/pipeline/prompts.ts`
- Test: `src/pipeline/prompts.test.ts` (créer si absent)

**Step 1 : Écrire le test qui échoue** — `src/pipeline/prompts.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildModifyPrompt } from "./prompts";

describe("buildModifyPrompt", () => {
  it("always bounds the change to the masked region", () => {
    const p = buildModifyPrompt("oak wood texture", "darker");
    expect(p.toLowerCase()).toContain("masked");
    expect(p).toContain("oak wood texture");
    expect(p).toContain("darker");
  });

  it("works with the texture prompt only", () => {
    const p = buildModifyPrompt("marble texture", undefined);
    expect(p).toContain("marble texture");
  });

  it("works with the instruction only", () => {
    const p = buildModifyPrompt(undefined, "navy blue");
    expect(p).toContain("navy blue");
  });

  it("still returns a bounded prompt when both are empty", () => {
    const p = buildModifyPrompt(undefined, undefined);
    expect(p.toLowerCase()).toContain("masked");
  });
});
```

**Step 2 : Lancer → échec**

Run: `npx vitest run src/pipeline/prompts.test.ts`
Expected: FAIL (`buildModifyPrompt` not exported).

**Step 3 : Implémenter** — ajouter à `src/pipeline/prompts.ts`

```ts
/**
 * Free-edit « Modifier » prompt (Story: texture bank). Composes an instruction
 * that (a) bounds the change to the masked element, preserving its shape,
 * lighting and perspective, (b) folds in the chosen texture's descriptive prompt
 * (paired with the texture image as an IP-Adapter reference in editModify), and
 * (c) folds in the user's free instruction. Either half may be empty (texture OR
 * instruction), but the region-bounding sentence is always present. [À calibrer
 * live avec le scale IP-Adapter de flux-general.]
 */
export function buildModifyPrompt(
  texturePrompt?: string,
  instruction?: string,
): string {
  const parts = [
    "Change only the masked object, keeping its exact shape, position, lighting and perspective; leave everything outside the masked region unchanged.",
  ];
  const tex = texturePrompt?.trim();
  const ins = instruction?.trim();
  if (tex) parts.push(`Apply this material to it: ${tex}.`);
  if (ins) parts.push(ins);
  return parts.join(" ");
}
```

**Step 4 : Lancer → succès**

Run: `npx vitest run src/pipeline/prompts.test.ts` → PASS.

**Step 5 : Commit**

```bash
git add src/pipeline/prompts.ts src/pipeline/prompts.test.ts
git commit -m "feat: add buildModifyPrompt for the texture/recolor edit"
```

---

### Task 4 : Adaptateur `editModify`

**Files:**
- Modify: `src/pipeline/edit.ts`, `src/pipeline/index.ts`
- Test: `src/pipeline/edit.test.ts` (ajouter un `describe`)

**Step 1 : Écrire le test qui échoue** — ajouter à `src/pipeline/edit.test.ts`

```ts
import { editModify } from "./edit"; // ajouter à l'import existant

describe("editModify adapter (texture bank)", () => {
  it("returns the modified image URL (flux images[0])", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "https://fal/mod.png" }] } });
    const result = await editModify(
      "https://fal/work.jpg",
      { textureUrl: "https://fal/bois.png", instruction: "darker" },
      opts,
    );
    expect(result.image).toBe("https://fal/mod.png");
  });

  it("passes image + mask and an ip_adapter only when a texture is given", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "u" }] } });
    await editModify(
      "https://fal/work.jpg",
      { textureUrl: "https://fal/bois.png", instruction: "" },
      opts,
    );
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.image_url).toBe("https://fal/work.jpg");
    expect(cfg.input.mask_url).toBe("https://fal/mask.png"); // voir Step 3: le mask est passé par runEdit; ici l'adaptateur reçoit maskUrl
    expect(Array.isArray(cfg.input.ip_adapters)).toBe(true);
  });

  it("omits ip_adapters when no texture is given (instruction-only recolor)", async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: "u" }] } });
    await editModify("https://fal/work.jpg", "https://fal/mask.png", { instruction: "navy" }, opts);
    const [, cfg] = subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(cfg.input.ip_adapters).toBeUndefined();
  });

  it("throws a retryable edit StepError when the model returns no image", async () => {
    subscribe.mockResolvedValue({ data: { images: [] } });
    const rejection = await editModify(
      "https://fal/work.jpg",
      "https://fal/mask.png",
      { textureUrl: "https://fal/bois.png" },
      opts,
    ).catch((e) => e);
    expect(rejection).toMatchObject({ step: "edit", retryable: true });
  });
});
```

> **Note de signature** : l'adaptateur prend `(imageUrl, maskUrl, { textureUrl?, instruction? }, opts)` — le masque est un argument positionnel (comme `editAdd`), la texture/instruction dans l'objet. Ajuster les appels ci-dessus en conséquence avant de figer (garder cohérent avec `editAdd(imageUrl, maskUrl, prompt, opts)`).

**Step 2 : Lancer → échec**

Run: `npx vitest run src/pipeline/edit.test.ts`
Expected: FAIL (`editModify` not exported).

**Step 3 : Implémenter** — ajouter à `src/pipeline/edit.ts`

```ts
/**
 * Free-edit MODIFY adapter (texture bank): recolors / re-textures the masked
 * region of the working image with flux-general image-to-image — masked
 * inpainting (white = edited, rest preserved: mask-native locality, dims kept)
 * conditioned by an optional IP-Adapter reference image (the chosen texture) and
 * a composed prompt. Same skeleton as editAdd; flux returns `images[]` (read
 * images[0].url). `ip_adapters` is present only when a texture is chosen — an
 * instruction-only call is a pure prompt-driven recolor. `IP_ADAPTER_SCALE` /
 * `strength` are calibrated live. @fal-ai/client is reached only through
 * ./client. Documented fallback: nano-banana-2/edit maskless + highlighted-region
 * guidance if the IP-Adapter proves fiddly.
 */
export async function editModify(
  imageUrl: string,
  maskUrl: string,
  { textureUrl, prompt }: { textureUrl?: string; prompt: string },
  { signal, onPhase }: AdapterOptions,
): Promise<EditResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(makeStepError("edit", true));
    }, TIMEOUTS_MS.editModify);
  });

  try {
    const input: Record<string, unknown> = {
      image_url: imageUrl,
      mask_url: maskUrl,
      prompt,
    };
    if (textureUrl) {
      // IP-Adapter reference = the chosen texture image (scale calibrated live).
      input.ip_adapters = [{ image_url: textureUrl, scale: IP_ADAPTER_SCALE }];
    }

    const run = fal.subscribe(MODELS.editModify, {
      input,
      abortSignal: controller.signal,
      headers: {
        "x-fal-object-lifecycle-preference": JSON.stringify({
          expiration_duration_seconds: ARTIFACT_EXPIRES_IN_SECONDS,
        }),
      },
      onQueueUpdate: (update: { status: string }) => {
        if (update.status === "IN_QUEUE") onPhase("queued");
        else if (update.status === "IN_PROGRESS") onPhase("generating");
        else if (update.status === "COMPLETED") onPhase("finalizing");
      },
    });
    run.catch(() => {});

    const result = (await Promise.race([run, timeoutPromise])) as {
      data?: EditAddRawOutput;
    };

    const url = result.data?.images?.[0]?.url;
    if (typeof url !== "string" || url.trim() === "") {
      throw makeStepError("edit", true);
    }
    return { image: url };
  } catch {
    throw makeStepError("edit", true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/** IP-Adapter reference strength for editModify (calibrate live). */
const IP_ADAPTER_SCALE = 0.7;
```

> Le mask field name exact (`mask_url` vs `image_url`+`fill_image`+`mask_image_url`) est **à pinner** sur la doc fal `flux-general/image-to-image` avant de verrouiller ; garder `mask_url` par cohérence si l'endpoint l'accepte. Réutiliser `EditAddRawOutput` (déjà défini : `images?: { url?: string }[]`).

Puis `src/pipeline/index.ts` :

```ts
export { editRemove, editAdd, editModify } from "./edit";
```

**Step 4 : Aligner les appels de test** sur la signature `(imageUrl, maskUrl, { textureUrl?, prompt }, opts)` et lancer → succès.

Run: `npx vitest run src/pipeline/edit.test.ts` → PASS.

**Step 5 : Commit**

```bash
git add src/pipeline/edit.ts src/pipeline/edit.test.ts src/pipeline/index.ts
git commit -m "feat: add editModify adapter (masked IP-Adapter texture/recolor)"
```

---

### Task 5 : Cache d'upload des textures

**Files:**
- Create: `src/pipeline/texture-upload.ts`
- Modify: `src/pipeline/index.ts`
- Test: `src/pipeline/texture-upload.test.ts`

**Step 1 : Écrire le test qui échoue** — `src/pipeline/texture-upload.test.ts`

```ts
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
```

**Step 2 : Lancer → échec**

Run: `npx vitest run src/pipeline/texture-upload.test.ts` → FAIL.

**Step 3 : Implémenter** — `src/pipeline/texture-upload.ts`

```ts
import { makeStepError } from "@/state/step-error";
import { uploadArtifact } from "./client";
import { findTexture } from "./textures";

/**
 * Session cache of texture id → fal URL. Textures are static, so each is fetched
 * from public/ and uploaded to fal at most once per session (AD-9 retention is
 * applied by uploadArtifact/client). Kept in module scope (NOT in the reducer —
 * this is not Generation state). Stores the in-flight Promise so concurrent
 * callers dedupe.
 */
const cache = new Map<string, Promise<string>>();

export function resolveTextureUrl(id: string): Promise<string> {
  const existing = cache.get(id);
  if (existing) return existing;

  const p = (async () => {
    const texture = findTexture(id);
    if (!texture) throw makeStepError("edit", true);
    const res = await fetch(texture.file);
    const blob = await res.blob();
    return uploadArtifact(blob);
  })();

  // Drop the cache entry on failure so a retry re-attempts the upload.
  p.catch(() => cache.delete(id));
  cache.set(id, p);
  return p;
}

/** Test-only: clear the memoization between cases. */
export function __resetTextureCache(): void {
  cache.clear();
}
```

`src/pipeline/index.ts` :

```ts
export { resolveTextureUrl } from "./texture-upload";
```

**Step 4 : Lancer → succès**

Run: `npx vitest run src/pipeline/texture-upload.test.ts` → PASS.

**Step 5 : Commit**

```bash
git add src/pipeline/texture-upload.ts src/pipeline/texture-upload.test.ts src/pipeline/index.ts
git commit -m "feat: memoized lazy fal upload for texture bank assets"
```

---

### Task 6 : Orchestration `runEdit` — branche `modify`

**Files:**
- Modify: `src/state/effects.ts`
- Test: `src/state/effects.test.ts` (ajouter des cas)

**Step 1 : Écrire le test qui échoue** — dans `src/state/effects.test.ts`, suivre le patron des cas `runEdit` existants (mock du pipeline). Ajouter :

```ts
it("runEdit modify: resolves the texture URL and dispatches EDIT_APPLIED", async () => {
  // editModify mocké → { image }, resolveTextureUrl mocké → URL fal.
  // state avec editBase.url + buffer non vide.
  // Attendu: EDIT_APPLIED avec l'image résultat ; editModify reçoit textureUrl + prompt composé.
});

it("runEdit modify: no-ops when neither texture nor instruction is provided", async () => {
  // buffer non vide, textureId undefined, instruction "" → aucun dispatch EDIT_APPLIED, editModify non appelé.
});
```

(Copier la structure exacte des mocks/`describe` des cas `runEdit` "add"/"remove" déjà présents dans ce fichier ; mocker `@/pipeline` pour inclure `editModify` et `resolveTextureUrl`.)

**Step 2 : Lancer → échec**

Run: `npx vitest run src/state/effects.test.ts` → FAIL.

**Step 3 : Implémenter** — `src/state/effects.ts`

Imports : ajouter `editModify, resolveTextureUrl` à l'import depuis `@/pipeline`, et `buildModifyPrompt` depuis `@/pipeline/prompts` (vérifier le chemin d'import des prompts déjà utilisé dans le fichier ; sinon exporter via `@/pipeline`).

Étendre la signature de `runEdit` :

```ts
  {
    operation,
    prompt,
    textureId,
    instruction,
    signal,
    isStale,
  }: RunContext & {
    operation: "remove" | "add" | "modify";
    prompt?: string;
    textureId?: string;
    instruction?: string;
  },
```

Garde-fou modify (après le garde-fou add existant) :

```ts
  const trimmedInstruction = instruction?.trim() ?? "";
  if (operation === "modify" && textureId === undefined && trimmedInstruction === "") {
    return;
  }
```

Dans le `try`, après l'obtention de `maskUrl`, remplacer le choix `result` par un switch à trois branches :

```ts
    let result: EditResult;
    if (operation === "add") {
      result = await editAdd(imageUrl, maskUrl, trimmedPrompt, { signal, onPhase });
    } else if (operation === "modify") {
      // Resolve the chosen texture's fal URL (lazy, memoized). uploading phase.
      let textureUrl: string | undefined;
      if (textureId !== undefined) {
        if (!dead()) dispatch({ type: "SET_WAIT_PHASE", phase: "uploading" });
        textureUrl = await resolveTextureUrl(textureId);
        if (dead()) return;
      }
      const composed = buildModifyPrompt(
        textureId !== undefined ? findTexture(textureId)?.prompt : undefined,
        trimmedInstruction,
      );
      result = await editModify(imageUrl, maskUrl, { textureUrl, prompt: composed }, { signal, onPhase });
    } else {
      result = await editRemove(imageUrl, maskUrl, { signal, onPhase });
    }
    if (dead()) return;
    dispatch({ type: "EDIT_APPLIED", image: result.image });
```

(Importer `findTexture` depuis `@/pipeline` — l'exporter dans `index.ts` si besoin. Ou passer le prompt de texture déjà résolu depuis le composant ; garder la résolution ici pour que la couche effet reste seule maître du pipeline, AR-LAYERS.)

**Step 4 : Lancer → succès**

Run: `npx vitest run src/state/effects.test.ts` → PASS.

**Step 5 : Commit**

```bash
git add src/state/effects.ts src/state/effects.test.ts src/pipeline/index.ts
git commit -m "feat: runEdit modify branch (texture resolve + composed prompt)"
```

---

### Task 7 : Composant `TextureBar`

**Files:**
- Create: `src/components/texture-bar.tsx`
- Test: `src/components/texture-bar.test.tsx`

**Step 1 : Écrire le test qui échoue** — `src/components/texture-bar.test.tsx`

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextureBar } from "./texture-bar";

describe("TextureBar", () => {
  it("renders a radiogroup with « Aucune » plus every texture", () => {
    render(<TextureBar selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: /texture/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /aucune/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /bois/i })).toBeInTheDocument();
  });

  it("marks the selected texture as checked", () => {
    render(<TextureBar selectedId="bois" onSelect={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /bois/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /aucune/i })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onSelect with the id on click, and null for « Aucune »", () => {
    const onSelect = vi.fn();
    render(<TextureBar selectedId="bois" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: /bois/i }));
    expect(onSelect).toHaveBeenCalledWith("bois");
    fireEvent.click(screen.getByRole("radio", { name: /aucune/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

**Step 2 : Lancer → échec**

Run: `npx vitest run src/components/texture-bar.test.tsx` → FAIL.

**Step 3 : Implémenter** — `src/components/texture-bar.tsx`

```tsx
"use client";

import { TEXTURES } from "@/pipeline/textures";
import { cn } from "@/lib/utils";

interface TextureBarProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Horizontal, scrollable texture picker shown only under the « Modifier »
 * operation. First chip = « Aucune » (deselect → prompt-only modify). Selection
 * = or-lumineux ring. radiogroup semantics; usable with the mouse alone (NFR-3);
 * dark theme (surface-elevee / bordure). Thumbnails render the real PNGs.
 */
export function TextureBar({ selectedId, onSelect }: TextureBarProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Texture"
      className="flex w-full gap-2 overflow-x-auto pb-1"
    >
      <Chip
        label="Aucune"
        checked={selectedId === null}
        onClick={() => onSelect(null)}
      />
      {TEXTURES.map((t) => (
        <Chip
          key={t.id}
          label={t.label}
          imageUrl={t.file}
          checked={selectedId === t.id}
          onClick={() => onSelect(t.id)}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  label: string;
  imageUrl?: string;
  checked: boolean;
  onClick: () => void;
}

function Chip({ label, imageUrl, checked, onClick }: ChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1"
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center overflow-hidden rounded-md border bg-surface-elevee transition-colors",
          checked
            ? "border-or-lumineux ring-2 ring-or-lumineux"
            : "border-bordure hover:border-texte-secondaire",
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny static thumbnail
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <span aria-hidden className="text-texte-secondaire">∅</span>
        )}
      </span>
      <span className="max-w-14 truncate text-xs text-texte-secondaire">{label}</span>
    </button>
  );
}
```

> Vérifier la config du test runner (jsdom + `@testing-library/*` déjà utilisés par `src/components/*.test.tsx` existants — voir `src/test-setup.ts`). Aligner l'import de `img` sur la convention lint du repo ; si `next/image` est imposé ailleurs, adapter (mais un `<img>` statique convient pour une vignette).

**Step 4 : Lancer → succès**

Run: `npx vitest run src/components/texture-bar.test.tsx` → PASS.

**Step 5 : Commit**

```bash
git add src/components/texture-bar.tsx src/components/texture-bar.test.tsx
git commit -m "feat: TextureBar inline texture picker (radiogroup, dark theme)"
```

---

### Task 8 : `EditorSurface` — 3ᵉ opération « Modifier »

**Files:**
- Modify: `src/components/editor-surface.tsx`
- Test: `src/components/editor-surface.test.tsx` (ajouter des cas)

**Step 1 : Écrire les tests qui échouent** — dans `src/components/editor-surface.test.tsx`

```tsx
it("shows the texture bar and instruction field only under « Modifier »", () => {
  // rendre EditorSurface (avec un editBase prêt via le provider de test existant)
  // cliquer « Modifier » → TextureBar (radiogroup « Texture ») visible ; champ instruction visible
  // revenir sur « Enlever » → plus de TextureBar
});

it("enables « Appliquer » under Modifier when a texture OR an instruction is provided", () => {
  // zone peinte simulée + Modifier :
  //  - ni texture ni instruction → « Appliquer » désactivé
  //  - texture choisie → activé
  //  - instruction seule → activé
});
```

(Réutiliser le harnais de rendu/état des tests `editor-surface.test.tsx` existants — provider `GenerationContext`, seed d'un `editBase` + buffer non vide.)

**Step 2 : Lancer → échec**

Run: `npx vitest run src/components/editor-surface.test.tsx` → FAIL.

**Step 3 : Implémenter** — `src/components/editor-surface.tsx`

- Import : `import { TextureBar } from "@/components/texture-bar";`
- État : élargir l'opération et ajouter la texture.
  ```ts
  const [operation, setOperation] = useState<"remove" | "add" | "modify">("remove");
  const [prompt, setPrompt] = useState("");            // « Ajouter »
  const [instruction, setInstruction] = useState("");   // « Modifier »
  const [selectedTextureId, setSelectedTextureId] = useState<string | null>(null);
  ```
- Reset au bump d'epoch (retouche appliquée) : dans l'effet qui `setPrompt("")`, ajouter `setInstruction(""); setSelectedTextureId(null);`.
- Toggle : itérer sur `["remove", "add", "modify"] as const` ; libellé `modify` → « Modifier ».
- Sous le toggle, remplacer le bloc `operation === "add"` par les deux blocs conditionnels :
  ```tsx
  {operation === "add" && (
    /* champ existant "Objet à ajouter" inchangé */
  )}
  {operation === "modify" && (
    <div className="flex w-full flex-col gap-2">
      <span className="text-carton-titre text-texte-secondaire">Texture</span>
      <TextureBar selectedId={selectedTextureId} onSelect={setSelectedTextureId} />
      <input
        type="text"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="plus foncé, bleu marine, mat… (optionnel si texture)"
        aria-label="Modification à appliquer"
        className="w-full rounded-lg border border-bordure bg-surface-carte px-4 py-2 text-texte-principal placeholder:text-texte-secondaire focus:border-or-lumineux focus:outline-none"
      />
    </div>
  )}
  ```
- Activation :
  ```ts
  const canApply =
    hasZone &&
    (operation === "remove" ||
      (operation === "add" && prompt.trim() !== "") ||
      (operation === "modify" && (selectedTextureId !== null || instruction.trim() !== "")));
  ```
- `handleApply` : passer le payload selon l'opération.
  ```ts
  await runEdit(state, dispatch, {
    operation,
    prompt: prompt.trim(),
    textureId: selectedTextureId ?? undefined,
    instruction: instruction.trim(),
    signal: controller.signal,
    isStale: () => epochRef.current !== startEpoch,
  });
  ```
  Ajuster la garde en tête de `handleApply` pour le cas modify (ni texture ni instruction → return), miroir de la garde `add`.
- Texte d'aide : ajouter la branche `modify` → « Sélectionnez l'élément, choisissez une texture et/ou décrivez le changement, puis appliquez. »

**Step 4 : Lancer → succès**

Run: `npx vitest run src/components/editor-surface.test.tsx` → PASS.

**Step 5 : Commit**

```bash
git add src/components/editor-surface.tsx src/components/editor-surface.test.tsx
git commit -m "feat: Modifier operation with inline texture bank in the editor"
```

---

### Task 9 : Vérification finale (qualité avant push)

**Step 1 : Suite complète**

Run: `npm test`
Expected: tous verts (nouveaux + non-régression reveal/edit).

**Step 2 : Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.

**Step 3 : Build de production**

Run: `npm run build`
Expected: succès (vérifie que `public/textures/bois.png` est bien servi et les imports résolus).

**Step 4 : Calibrage live (manuel, hors test auto)** — avec une vraie `FAL_KEY`, `npm run dev` :
- Mode édition → sélectionner un élément (clic ou pinceau) → « Modifier » → texture « Bois » → « Appliquer ».
- Vérifier : la matière est plaquée sur le seul élément, le reste inchangé. Régler `IP_ADAPTER_SCALE`/`strength` et `buildModifyPrompt` si besoin.
- Tester : instruction seule (« bleu marine ») sans texture ; texture + instruction combinées.
- Si débordement/faible fidélité de l'IP-Adapter → basculer sur le **fallback nano-banana + guidage surbrillance** documenté (`config.ts` / `edit.ts`).

**Step 5 : Commit final éventuel** (ajustements de calibrage)

```bash
git add -A
git commit -m "chore: calibrate editModify texture transfer (live)"
```

---

## Notes transversales

- **Non-régression** : `Enlever`/`Ajouter` intacts (mêmes modèles, mêmes branches) ; reducer, `MaskCanvas`, clic-pour-sélectionner, overlays réutilisés sans changement de contrat.
- **AD-5** : `@fal-ai/client` reste confiné à `src/pipeline/` (client.ts). `texture-upload.ts` ne fait que `fetch` + `uploadArtifact`.
- **AR-LAYERS** : le composant lit l'état et dispatch ; toute la logique pipeline (résolution texture, prompt composé, appel modèle) vit dans `effects.ts` + `pipeline/`.
- **À pinner sur la doc fal avant verrouillage** : champs exacts masque + IP-Adapter de `flux-general/image-to-image`, `scale`, `strength`, forme de sortie (`images[]` supposée).
