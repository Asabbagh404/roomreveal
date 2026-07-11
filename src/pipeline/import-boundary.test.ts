import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces AD-5 / AD-4 at the source level: @fal-ai/client may be imported only
 * under src/pipeline/. A stray import elsewhere would compile and pass every
 * mocked test while risking FAL_KEY exposure — this guards the invariant that
 * comments and discipline otherwise rely on.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("architecture: @fal-ai/client import boundary (AD-5)", () => {
  it("is imported only under src/pipeline/", () => {
    const srcRoot = join(process.cwd(), "src");
    const offenders = walk(srcRoot).filter((file) => {
      if (file.includes(`${join("src", "pipeline")}`)) return false;
      const source = readFileSync(file, "utf8");
      return /from\s+["']@fal-ai\/client["']/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
