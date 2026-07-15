"use client";

import { TEXTURES } from "@/pipeline/textures";
import { cn } from "@/lib/utils";

interface TextureBarProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Stack the chips in a scrollable column instead of a row (edit mode places
   * the picker to the right of the image). */
  vertical?: boolean;
}

/**
 * Texture picker shown only under the « Modifier » operation. First chip =
 * « Aucune » (deselect → prompt-only modify). Selection = or-lumineux ring.
 * radiogroup semantics; usable with the mouse alone (NFR-3); dark theme
 * (surface-elevee / bordure). Thumbnails render the real PNGs. Horizontal +
 * x-scroll by default; `vertical` stacks + y-scrolls (right-of-image column).
 */
export function TextureBar({ selectedId, onSelect, vertical = false }: TextureBarProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Texture"
      className={cn(
        "flex gap-2",
        vertical
          ? "min-h-0 flex-1 flex-col overflow-y-auto pr-1"
          : "w-full overflow-x-auto pb-1",
      )}
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
          <span aria-hidden className="text-texte-secondaire">
            ∅
          </span>
        )}
      </span>
      <span className="max-w-14 truncate text-xs text-texte-secondaire">
        {label}
      </span>
    </button>
  );
}
