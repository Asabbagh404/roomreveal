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
