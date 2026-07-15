"use client";

import { Brush, Eraser, Loader2, MousePointerClick, Redo2, Sparkles, Undo2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { MAX_BRUSH, MIN_BRUSH } from "@/lib/mask-tools";
import type { MaskTool } from "@/lib/mask-buffer";
import { cn } from "@/lib/utils";

interface MaskToolbarProps {
  tool: MaskTool;
  size: number;
  /** Shows the click-to-select tool (Story 5.6, edit mode only). */
  selectable?: boolean;
  /** Runs the whole-scene « détection auto » (SAM furniture detection) in one
   * action (edit mode). When provided (and `selectable`), a magic-wand button
   * appears next to the select tool — the edit analog of the Masque step's
   * automatic detect-all pass. */
  onSelectAll?: () => void;
  /** True while the detection is running: the button shows a spinner and is
   * disabled so it can't re-fire mid-run. */
  selectAllBusy?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: MaskTool) => void;
  onSizeChange: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Optional trailing control rendered inside the bar, past undo/redo (edit
   * mode's « Appliquer » gold check button). Separated by a divider. */
  action?: React.ReactNode;
}

/**
 * Floating mask toolbar (DESIGN#Barre d'outils du Masque). Brush/eraser are
 * mutually exclusive (active = or-lumineux); the Slider sets the tool size
 * (4–128 px); undo/redo are ghost buttons disabled at the bounds. All controls
 * have keyboard-shortcut hints in their labels (UX-DR8) — the app is fully
 * usable with the mouse alone (NFR-3).
 */
export function MaskToolbar({
  tool,
  size,
  selectable = false,
  onSelectAll,
  selectAllBusy = false,
  canUndo,
  canRedo,
  onToolChange,
  onSizeChange,
  onUndo,
  onRedo,
  action,
}: MaskToolbarProps) {
  return (
    <div className="flex w-full max-w-2xl items-center gap-4 rounded-lg border border-bordure bg-surface-elevee px-4 py-3">
      <div className="flex gap-1" role="group" aria-label="Outil">
        {selectable && (
          <ToolButton
            active={tool === "select"}
            label="Sélection : clic (objet) ou glisser (zone) (S)"
            onClick={() => onToolChange("select")}
          >
            <MousePointerClick className="size-4" aria-hidden />
          </ToolButton>
        )}
        {selectable && onSelectAll !== undefined && (
          <button
            type="button"
            aria-label="Détection auto des meubles de la cuisine (A)"
            title="Détection auto des meubles de la cuisine (A)"
            onClick={onSelectAll}
            disabled={selectAllBusy}
            className="flex size-9 items-center justify-center rounded-md text-texte-secondaire transition-colors hover:bg-bordure disabled:pointer-events-none disabled:opacity-50"
          >
            {selectAllBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
          </button>
        )}
        <ToolButton
          active={tool === "brush"}
          label="Pinceau (B)"
          onClick={() => onToolChange("brush")}
        >
          <Brush className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          label="Gomme (E)"
          onClick={() => onToolChange("eraser")}
        >
          <Eraser className="size-4" aria-hidden />
        </ToolButton>
      </div>

      <label className="flex min-w-40 flex-1 items-center gap-3 text-sm text-texte-secondaire">
        <span className="sr-only">Taille de l’outil</span>
        <Slider
          aria-label="Taille de l’outil"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          step={1}
          value={[size]}
          onValueChange={(v) => onSizeChange(v[0])}
        />
        <span className="w-10 shrink-0 text-right tabular-nums">{size} px</span>
      </label>

      <div className="flex gap-1" role="group" aria-label="Historique">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Annuler (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Rétablir (Ctrl+Maj+Z)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="size-4" aria-hidden />
        </Button>
      </div>

      {action !== undefined && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-bordure" />
          {action}
        </>
      )}
    </div>
  );
}

interface ToolButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolButton({ active, label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-or-lumineux text-or-lumineux-foreground"
          : "text-texte-secondaire hover:bg-bordure",
      )}
    >
      {children}
    </button>
  );
}
