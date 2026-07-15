"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, ImagePlus } from "lucide-react";
import { useGeneration } from "@/state/generation-context";
import { runEdit, runPointSegment } from "@/state/effects";
import { makeStepError } from "@/state/step-error";
import { createBlankBuffer, isBufferEmpty, type SelectRegion } from "@/lib/mask-buffer";
import { downloadFile } from "@/lib/download-file";
import { MaskCanvas } from "@/components/mask-canvas";
import { TextureBar } from "@/components/texture-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePhotoObjectUrl } from "@/components/use-photo-object-url";

/**
 * Free-edit editor (edit mode, Stories 5.3–5.5). Iterative retouch: draw a zone
 * on the working image and « Enlever » (bria eraser) or « Ajouter » (flux fill
 * from a text prompt); the result becomes the base for the next retouch. Closure
 * actions « Télécharger l'image » (save the current result) and « Nouvelle image »
 * (RESET to a blank upload, confirming first if unsaved retouches exist) end the
 * cycle (Story 5.5). The effect layer owns the pipeline call (AR-LAYERS); this
 * component reads state, dispatches intents, and runs housekeeping effects (seed
 * a blank mask, measure a new result's dims). The mask editing surface is the
 * reusable MaskCanvas (Story 5.2). WaitPanel/ErrorBanner overlays live in
 * ParcoursScene; the beforeunload guard (5.1) already covers this step.
 */
export function EditorSurface() {
  const { state, dispatch } = useGeneration();
  const editBase = state.editBase;
  const buffer = state.maskDraft?.buffer;
  const width = editBase?.width ?? 0;
  const height = editBase?.height ?? 0;

  // Background: the fal URL of a result, or the object URL of the uploaded blob.
  const blobUrl = usePhotoObjectUrl(editBase?.blob);
  const backgroundUrl = editBase?.url ?? blobUrl;

  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const runControllerRef = useRef<AbortController | null>(null);

  // Click-to-select (Story 5.6): a click segments the object under it and unions
  // its mask into the draft. Its own controller so it never clobbers an apply.
  const [selecting, setSelecting] = useState(false);
  const selectingRef = useRef(false);
  const selectControllerRef = useRef<AbortController | null>(null);

  // Operation toggle: « Enlever » (bria eraser, 5.3) · « Ajouter » (flux fill
  // from a text prompt, 5.4) · « Modifier » (flux-general inpaint with an optional
  // texture reference + free instruction, texture bank). `prompt` is only used by
  // « Ajouter »; `instruction` + `selectedTextureId` only by « Modifier ».
  const [operation, setOperation] = useState<"remove" | "add" | "modify">("remove");
  const [prompt, setPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [selectedTextureId, setSelectedTextureId] = useState<string | null>(null);

  // Live epoch for the effect layer to discard superseded results (AD-12).
  const epochRef = useRef(state.epoch);
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);

  // Clear the « Ajouter » prompt after each applied retouch (EDIT_APPLIED bumps
  // the epoch): the described object was added, so the next add starts fresh. On
  // an error the epoch does NOT bump, so the prompt is preserved for a re-try.
  // Toggling operation is intentionally NOT reset — the field is only shown for
  // « Ajouter » and restoring a just-typed prompt on toggle-back is fine.
  // Also clears the « Modifier » instruction + texture selection: a bumped epoch
  // means the retouch applied, so the next one starts fresh (mirrors the prompt).
  const lastEpochRef = useRef(state.epoch);
  useEffect(() => {
    if (state.epoch !== lastEpochRef.current) {
      lastEpochRef.current = state.epoch;
      setPrompt("");
      setInstruction("");
      setSelectedTextureId(null);
    }
  }, [state.epoch]);

  // Count of applied retouches: in edit mode only EDIT_APPLIED bumps the epoch,
  // so (current epoch − entry epoch) is the number of edits applied. Captured
  // once on mount via useState so it's stable and not read from a ref in render.
  const [entryEpoch] = useState(state.epoch);
  const retouchCount = state.epoch - entryEpoch;

  // ---- Establish the work image + blank-mask shell on entry (EDIT_START) ----
  useEffect(() => {
    if (state.step !== "editor") return;
    if (editBase === undefined) dispatch({ type: "EDIT_START" });
  }, [state.step, editBase, dispatch]);

  // ---- Seed a blank editable buffer once dims are known (mirror MaskSurface) ----
  useEffect(() => {
    if (state.maskDraft === undefined) return;
    if (state.maskDraft.buffer !== undefined) return;
    if (width === 0 || height === 0) return;
    dispatch({ type: "SET_MASK_BUFFER", buffer: createBlankBuffer(width, height) });
  }, [state.maskDraft, width, height, dispatch]);

  // ---- Measure a new result's real canonical dims (EDIT_BASE_MEASURED) ----
  useEffect(() => {
    const url = editBase?.url;
    if (url === undefined) return;
    if (editBase?.width !== undefined) return; // already measured
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // Decode the bitmap BEFORE announcing dims: EDIT_BASE_MEASURED is what
      // flips the displayed image to this result (via `view` below). Decoding
      // first guarantees the swap paints in a single frame — no empty flash
      // between the old and the new image. decode() may reject (src swapped
      // mid-flight); dispatch anyway so a rejection can't strand the editor.
      const announce = () => {
        if (alive) {
          dispatch({ type: "EDIT_BASE_MEASURED", width: w, height: h });
        }
      };
      if (typeof img.decode === "function") {
        img.decode().then(announce, announce);
      } else {
        announce();
      }
    };
    // Without this, a result URL that fails to load (transient CDN/network,
    // expired object) would leave dims undefined forever → no mask seed → the
    // editor is stuck with « Appliquer » disabled. Surface a retryable error
    // instead; the user can go back to Upload via the « Photo » step.
    img.onerror = () => {
      if (!alive) return;
      dispatch({ type: "SET_ERROR", error: makeStepError("edit", true) });
    };
    img.src = url;
    return () => {
      alive = false;
      img.src = ""; // stop the background decode of a superseded/unmounted load
    };
  }, [editBase?.url, editBase?.width, dispatch]);

  // Abort a running edit or segmentation if the surface unmounts (back-nav).
  useEffect(() => {
    return () => {
      runControllerRef.current?.abort();
      selectControllerRef.current?.abort();
    };
  }, []);

  // A select gesture: segment the object (point click or box drag) and union it
  // into the draft mask (5.6/5.7).
  const handleSelect = useCallback(
    async (region: SelectRegion) => {
      if (selectingRef.current) return; // one segmentation at a time
      selectingRef.current = true;
      setSelecting(true);
      const controller = new AbortController();
      selectControllerRef.current = controller;
      const startEpoch = epochRef.current;
      try {
        await runPointSegment(state, dispatch, {
          region,
          signal: controller.signal,
          isStale: () => epochRef.current !== startEpoch,
        });
      } finally {
        selectingRef.current = false;
        // Guard against a resolve after unmount (back-nav aborted the run).
        if (mountedRef.current) setSelecting(false);
      }
    },
    [state, dispatch],
  );

  const hasZone = buffer !== undefined && !isBufferEmpty(buffer);
  // « Enlever » only needs a zone; « Ajouter » also needs a description; « Modifier »
  // needs a chosen texture OR a non-empty instruction (either drives the change).
  const canApply =
    hasZone &&
    (operation === "remove" ||
      (operation === "add" && prompt.trim() !== "") ||
      (operation === "modify" &&
        (selectedTextureId !== null || instruction.trim() !== "")));

  const handleApply = useCallback(async () => {
    const buf = state.maskDraft?.buffer;
    if (applyingRef.current || buf === undefined || isBufferEmpty(buf)) return;
    if (operation === "add" && prompt.trim() === "") return;
    if (
      operation === "modify" &&
      selectedTextureId === null &&
      instruction.trim() === ""
    )
      return;
    applyingRef.current = true;
    setApplying(true);
    const controller = new AbortController();
    runControllerRef.current = controller;
    const startEpoch = epochRef.current;
    try {
      // runEdit dispatches EDIT_APPLIED on success or SET_ERROR on failure. The
      // effect layer owns texture resolution + prompt composition (AR-LAYERS);
      // here we just pass the operation and its inputs.
      await runEdit(state, dispatch, {
        operation,
        prompt: prompt.trim(),
        textureId: selectedTextureId ?? undefined,
        instruction: instruction.trim(),
        signal: controller.signal,
        isStale: () => epochRef.current !== startEpoch,
      });
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }, [state, dispatch, operation, prompt, selectedTextureId, instruction]);

  // ---- Closure actions (Story 5.5): download the current image, start over ----
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // The epoch at which the current work image was last downloaded. « downloaded »
  // is only true while no retouch has been applied SINCE (each EDIT_APPLIED bumps
  // the epoch) — so a download-then-re-edit correctly re-arms the unsaved guard.
  const [downloadedAtEpoch, setDownloadedAtEpoch] = useState<number | null>(null);
  const hasDownloaded = downloadedAtEpoch === state.epoch;
  const [confirmingNew, setConfirmingNew] = useState(false);
  // Guard state updates that resolve after the surface unmounts mid-download.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleDownload = useCallback(async () => {
    if (downloading || !backgroundUrl) return;
    setDownloading(true);
    setDownloadError(null);
    const epochAtDownload = epochRef.current;
    try {
      // downloadFile fetches the URL → blob → <a download>; works for a fal
      // result URL (public GET, no re-host — AD-4/AD-9) and a blob: objectURL.
      await downloadFile(backgroundUrl, "roomreveal-edition.png");
      if (mountedRef.current) setDownloadedAtEpoch(epochAtDownload);
    } catch {
      if (mountedRef.current) setDownloadError("Le téléchargement a échoué. Réessayez.");
    } finally {
      if (mountedRef.current) setDownloading(false);
    }
  }, [downloading, backgroundUrl]);

  // « Nouvelle image » (Story 5.5): RESET to a blank Upload (mode preserved since
  // 5.1). Confirm first only if unsaved retouches exist (UX-DR16); otherwise
  // there's nothing to lose (fresh editor, or already downloaded).
  const newImage = useCallback(() => {
    if (retouchCount > 0 && !hasDownloaded) setConfirmingNew(true);
    else dispatch({ type: "RESET" });
  }, [retouchCount, hasDownloaded, dispatch]);

  // The image actually painted by the canvas. It intentionally LAGS editBase:
  // a just-applied result only becomes the view once its dims are measured AND
  // its bitmap decoded (see the measure effect's decode() above). Until then we
  // hold the previous frame, so a retouch never flashes the empty placeholder
  // between the old and new image. Advancing only when width/height are known
  // (they're cleared by EDIT_APPLIED) is what gates the swap.
  const [view, setView] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    if (!backgroundUrl || width === 0 || height === 0) return;
    setView((prev) =>
      prev !== null &&
      prev.url === backgroundUrl &&
      prev.width === width &&
      prev.height === height
        ? prev
        : { url: backgroundUrl, width, height },
    );
  }, [backgroundUrl, width, height]);

  // The CURRENT work image is fully available (measured) — gates « Télécharger ».
  // Distinct from `view` (which may still hold the previous frame mid-swap).
  const ready = !!backgroundUrl && width > 0 && height > 0;

  // What to paint: the held frame if we have one, else the live image once it's
  // measured. The fallback only matters on initial entry (before the `view`
  // effect has run) so entering the editor doesn't flash the placeholder; once
  // `view` is set it stays set and drives the retouch hold-until-decoded swap.
  const displayed =
    view ??
    (backgroundUrl && width > 0 && height > 0
      ? { url: backgroundUrl, width, height }
      : null);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Closure actions (Story 5.5) as icons, top-right above the image:
          « Nouvelle image » (ghost) · « Télécharger l'image » (gold primary).
          Aligned to the image's max width so they sit at its top-right corner. */}
      <div className="flex w-full max-w-3xl flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Nouvelle image"
            title="Nouvelle image"
            onClick={newImage}
          >
            <ImagePlus className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            aria-label="Télécharger l’image"
            title="Télécharger l’image"
            disabled={!ready || downloading}
            onClick={handleDownload}
          >
            <Download className="size-4" aria-hidden />
          </Button>
        </div>
        {downloadError !== null && (
          <p role="alert" aria-live="assertive" className="text-sm text-erreur">
            {downloadError}
          </p>
        )}
      </div>

      {/* Image, with (in « Modifier ») a vertical texture picker floated into the
          right margin. The picker is absolutely positioned so it NEVER resizes
          the image — the image keeps its max-w-3xl dimensions in every mode. */}
      <div className="relative flex w-full max-w-3xl flex-col items-center gap-4">
        {displayed !== null ? (
          <MaskCanvas
            backgroundUrl={displayed.url}
            width={displayed.width}
            height={displayed.height}
            // Only pass the draft once it matches the shown image (post-swap,
            // seeded at the new dims). During the hold window the buffer is
            // still undefined (EDIT_APPLIED cleared it) → the overlay stays
            // empty on the held frame rather than showing a stale mask.
            buffer={buffer}
            epoch={state.epoch}
            onCommit={(next) => dispatch({ type: "SET_MASK_BUFFER", buffer: next })}
            backgroundAlt="Image de travail"
            selectable
            onSelect={handleSelect}
            selecting={selecting}
            pulsing={applying}
            toolbarAction={
              // « Appliquer » (Story 5.4): a gold check button integrated at the
              // right end of the mask toolbar. Disabled until the operation's
              // inputs are valid; the wave on the zone is progress.
              <button
                type="button"
                aria-label="Appliquer"
                title="Appliquer"
                disabled={!canApply || applying}
                onClick={handleApply}
                className="flex h-9 w-14 shrink-0 items-center justify-center rounded-md bg-or-lumineux text-or-lumineux-foreground transition-colors hover:bg-or-lumineux/80 disabled:pointer-events-none disabled:opacity-50"
              >
                <Check className="size-5" aria-hidden />
              </button>
            }
          />
        ) : (
          <div className="w-full overflow-hidden rounded-lg border border-bordure">
            <div className="aspect-[4/3] w-full bg-surface-elevee" aria-hidden />
          </div>
        )}

        {operation === "modify" && (
          <div className="absolute inset-y-0 left-full ml-3 flex w-20 flex-col gap-2">
            <span className="text-carton-titre text-texte-secondaire">Texture</span>
            <TextureBar
              vertical
              selectedId={selectedTextureId}
              onSelect={setSelectedTextureId}
            />
          </div>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-3">
        {/* Operation toggle (Story 5.4): a secondary control, not a second gold
            action — « Appliquer » stays the single primary (UX-DR13). */}
        <div
          role="group"
          aria-label="Opération"
          className="relative flex w-72 rounded-full border border-bordure bg-surface-elevee p-1"
        >
          {/* Sliding indicator: glides between the three options instead of the
              fill snapping instantly (Story 5.4 polish, extended to 3). Its width
              is one third of the inner track; it translates by whole segments. */}
          <span
            aria-hidden
            className={
              "pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-or-lumineux transition-transform duration-300 ease-out motion-reduce:transition-none " +
              (operation === "add"
                ? "translate-x-[100%]"
                : operation === "modify"
                  ? "translate-x-[200%]"
                  : "translate-x-0")
            }
          />
          {(["remove", "add", "modify"] as const).map((op) => (
            <button
              key={op}
              type="button"
              aria-pressed={operation === op}
              onClick={() => setOperation(op)}
              className={
                "relative z-10 flex-1 rounded-full px-3 py-1.5 text-carton-titre transition-colors " +
                (operation === op
                  ? "text-or-lumineux-foreground"
                  : "text-texte-secondaire hover:text-texte-principal")
              }
            >
              {op === "remove" ? "Enlever" : op === "add" ? "Ajouter" : "Modifier"}
            </button>
          ))}
        </div>

        {operation === "add" && (
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="pot de fleur, tableau…"
            aria-label="Objet à ajouter"
            className="w-full rounded-lg border border-bordure bg-surface-carte px-4 py-2 text-texte-principal placeholder:text-texte-secondaire focus:border-or-lumineux focus:outline-none"
          />
        )}

        {operation === "modify" && (
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="plus foncé, bleu marine, mat… (optionnel si texture)"
            aria-label="Modification à appliquer"
            className="w-full rounded-lg border border-bordure bg-surface-carte px-4 py-2 text-texte-principal placeholder:text-texte-secondaire focus:border-or-lumineux focus:outline-none"
          />
        )}

        {/* « Appliquer » moved next to the mask toolbar (a gold check button);
            the wave pulsing on the selected zones IS the progress feedback. */}
        <p className="text-center text-sm text-texte-secondaire">
          {operation === "add"
            ? "Dessinez où placer l’objet, décrivez-le, puis appliquez."
            : ""}
          {retouchCount > 0 ? ` · Retouche n° ${retouchCount}` : ""}
        </p>
      </div>

      <Dialog
        open={confirmingNew}
        onOpenChange={(open) => {
          if (!open) setConfirmingNew(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repartir d’une nouvelle image ?</DialogTitle>
            <DialogDescription>
              Vos retouches n’ont pas été téléchargées. Elles seront perdues si
              vous continuez.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingNew(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                setConfirmingNew(false);
                dispatch({ type: "RESET" });
              }}
            >
              Continuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
