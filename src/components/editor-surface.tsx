"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGeneration } from "@/state/generation-context";
import { runEdit } from "@/state/effects";
import { makeStepError } from "@/state/step-error";
import { createBlankBuffer, isBufferEmpty } from "@/lib/mask-buffer";
import { MaskCanvas } from "@/components/mask-canvas";
import { GenerationButton } from "@/components/generation-button";
import { usePhotoObjectUrl } from "@/components/use-photo-object-url";

/**
 * Free-edit editor (Story 5.3, edit mode). Iterative « Enlever »: the user draws
 * a zone on the working image and erases it; the result becomes the base for the
 * next retouch. The effect layer owns the pipeline call (AR-LAYERS); this
 * component only reads state and dispatches intents, plus two housekeeping
 * effects (seed a blank mask, measure a new result's dims). The mask editing
 * surface is the reusable MaskCanvas (Story 5.2). WaitPanel/ErrorBanner overlays
 * live in ParcoursScene. Download + « Nouvelle image » arrive in Story 5.5;
 * « Ajouter » (text → flux fill) in Story 5.4.
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

  // Operation toggle (Story 5.4): « Enlever » (bria eraser) or « Ajouter » (flux
  // fill from a text prompt). The prompt is only used for « Ajouter ».
  const [operation, setOperation] = useState<"remove" | "add">("remove");
  const [prompt, setPrompt] = useState("");

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
  const lastEpochRef = useRef(state.epoch);
  useEffect(() => {
    if (state.epoch !== lastEpochRef.current) {
      lastEpochRef.current = state.epoch;
      setPrompt("");
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
      dispatch({
        type: "EDIT_BASE_MEASURED",
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
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

  // Abort a running edit if the surface unmounts (back-nav to Upload).
  useEffect(() => {
    return () => runControllerRef.current?.abort();
  }, []);

  const hasZone = buffer !== undefined && !isBufferEmpty(buffer);
  // « Ajouter » also needs a non-empty description; « Enlever » only needs a zone.
  const canApply = hasZone && (operation === "remove" || prompt.trim() !== "");

  const handleApply = useCallback(async () => {
    const buf = state.maskDraft?.buffer;
    if (applyingRef.current || buf === undefined || isBufferEmpty(buf)) return;
    if (operation === "add" && prompt.trim() === "") return;
    applyingRef.current = true;
    setApplying(true);
    const controller = new AbortController();
    runControllerRef.current = controller;
    const startEpoch = epochRef.current;
    try {
      // runEdit dispatches EDIT_APPLIED on success or SET_ERROR on failure.
      await runEdit(state, dispatch, {
        operation,
        prompt: prompt.trim(),
        signal: controller.signal,
        isStale: () => epochRef.current !== startEpoch,
      });
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }, [state, dispatch, operation, prompt]);

  const ready = backgroundUrl !== null && width > 0 && height > 0;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {ready ? (
        <MaskCanvas
          backgroundUrl={backgroundUrl}
          width={width}
          height={height}
          buffer={buffer}
          epoch={state.epoch}
          onCommit={(next) => dispatch({ type: "SET_MASK_BUFFER", buffer: next })}
          backgroundAlt="Image de travail"
        />
      ) : (
        <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-bordure">
          <div className="aspect-[4/3] w-full bg-surface-elevee" aria-hidden />
        </div>
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-3">
        {/* Operation toggle (Story 5.4): a secondary control, not a second gold
            action — « Appliquer » stays the single primary (UX-DR13). */}
        <div
          role="group"
          aria-label="Opération"
          className="flex gap-1 rounded-full border border-bordure bg-surface-elevee p-1"
        >
          {(["remove", "add"] as const).map((op) => (
            <button
              key={op}
              type="button"
              aria-pressed={operation === op}
              onClick={() => setOperation(op)}
              className={
                "rounded-full px-4 py-1.5 text-carton-titre transition-colors " +
                (operation === op
                  ? "bg-or-lumineux text-or-lumineux-foreground"
                  : "text-texte-secondaire hover:text-texte-principal")
              }
            >
              {op === "remove" ? "Enlever" : "Ajouter"}
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

        <GenerationButton
          subtext="30 s à 1 minute"
          disabled={!canApply || applying}
          onClick={handleApply}
        >
          {applying ? "Retouche en cours…" : "Appliquer"}
        </GenerationButton>
        <p className="text-center text-sm text-texte-secondaire">
          {operation === "add"
            ? "Dessinez où placer l’objet, décrivez-le, puis appliquez."
            : "Peignez la zone de l’objet à retirer, puis appliquez."}
          {retouchCount > 0 ? ` · Retouche n° ${retouchCount}` : ""}
        </p>
      </div>
    </div>
  );
}
