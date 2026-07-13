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
