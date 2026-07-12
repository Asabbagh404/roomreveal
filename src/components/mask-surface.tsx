"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGeneration } from "@/state/generation-context";
import type { Generation } from "@/state/types";
import { runDetect, runValidateMask } from "@/state/effects";
import {
  createBlankBuffer,
  isBufferEmpty,
  paintStroke,
  type MaskBuffer,
  type Point,
  type StrokeMode,
} from "@/lib/mask-buffer";
import { rasterizeMaskUrl } from "@/lib/mask-raster";
import { GenerationButton } from "@/components/generation-button";
import { ErrorBanner } from "@/components/error-banner";
import {
  canRedo as canRedoH,
  canUndo as canUndoH,
  createHistory,
  current as currentH,
  push as pushH,
  redo as redoH,
  undo as undoH,
  type History,
} from "@/lib/mask-history";
import { clampZoom, screenToBuffer, stepBrush } from "@/lib/mask-tools";
import { MaskToolbar } from "@/components/mask-toolbar";
import { usePhotoObjectUrl } from "@/components/use-photo-object-url";

// Concrete RGB of --color-masque-overlay (#ff2e9e). Canvas pixels can't read a
// CSS variable, so the token value is mirrored here (kept in sync with globals).
const OVERLAY_RGB = { r: 255, g: 46, b: 158 } as const;
const DEFAULT_BRUSH = 32;
/** Wheel zoom multiplier per notch. */
const ZOOM_STEP = 1.15;

/**
 * Mask step: the manual brush/eraser editor (Story 2.2). The binary buffer is
 * the pipeline draft (AD-13), owned by the reducer so it survives unmount; this
 * canvas is only a VIEW of it. Zoom/pan/devicePixelRatio are display transforms
 * — the buffer is never resampled (AD-7). The undo stack is UI-local, lost on
 * navigation (AD-13). Detection still runs on entry (Story 2.1, unchanged).
 */
export function MaskSurface() {
  const { state, dispatch } = useGeneration();
  const photoUrl = usePhotoObjectUrl(state.originalPhoto?.blob);

  const buffer = state.maskDraft?.buffer;
  const photoWidth = state.originalPhoto?.width ?? 0;
  const photoHeight = state.originalPhoto?.height ?? 0;

  // ---- UI-local editor state (lost on unmount per AD-13) ----
  const [tool, setTool] = useState<StrokeMode>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<History<MaskBuffer> | null>(null);
  // Mask validation (Story 2.3) — user-initiated, so errors are inline & local.
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const validatingRef = useRef(false); // synchronous re-entry guard for validate

  // Latest values read inside imperative event handlers without stale closures.
  const toolRef = useRef(tool);
  const brushRef = useRef(brushSize);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const historyRef = useRef(history);
  const bufferRef = useRef(buffer);
  useEffect(() => void (toolRef.current = tool), [tool]);
  useEffect(() => void (brushRef.current = brushSize), [brushSize]);
  useEffect(() => void (zoomRef.current = zoom), [zoom]);
  useEffect(() => void (panRef.current = pan), [pan]);
  useEffect(() => void (historyRef.current = history), [history]);
  useEffect(() => void (bufferRef.current = buffer), [buffer]);

  // Live epoch for the effect layer to discard superseded results (AD-12).
  const epochRef = useRef(state.epoch);
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);

  // ---- Detection on entry (Story 2.1 — deps deliberately EXCLUDE waitPhase to
  // avoid the abort loop fixed in 2.1) ----
  useEffect(() => {
    if (state.step !== "mask") return;
    if (state.originalPhoto === undefined) return;
    if (state.maskDraft !== undefined) return;
    if (state.error !== undefined) return;

    const startEpoch = state.epoch;
    const controller = new AbortController();
    void runDetect(state, dispatch, {
      signal: controller.signal,
      isStale: () => epochRef.current !== startEpoch,
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.epoch, state.maskDraft, state.error, state.originalPhoto]);

  // ---- Seed the editable buffer once detection has produced a draft ----
  useEffect(() => {
    if (state.maskDraft === undefined) return;
    if (state.maskDraft.buffer !== undefined) return;
    if (photoWidth === 0 || photoHeight === 0) return;

    let alive = true;
    const startEpoch = state.epoch;
    const detectedUrl = state.maskDraft.detectedMaskUrl;
    void (async () => {
      // On a rasterize failure (transient CORS/decode of the detected mask),
      // fall back to a blank editable buffer so the Parcours stays usable — the
      // user can paint manually. A dedicated retry is deferred (documented).
      const seeded =
        detectedUrl !== null
          ? await rasterizeMaskUrl(detectedUrl, photoWidth, photoHeight).catch(
              () => createBlankBuffer(photoWidth, photoHeight),
            )
          : createBlankBuffer(photoWidth, photoHeight);
      // Discard a superseded seed (epoch guard, AD-12) or an unmounted one.
      if (!alive || epochRef.current !== startEpoch) return;
      dispatch({ type: "SET_MASK_BUFFER", buffer: seeded });
    })();
    return () => {
      alive = false;
    };
  }, [state.maskDraft, state.epoch, photoWidth, photoHeight, dispatch]);

  // ---- (Re)initialize the local undo stack from the surviving buffer, once
  // per attempt — history is UI-local and rebuilt on remount (AD-13). ----
  const historyEpochRef = useRef<number | null>(null);
  useEffect(() => {
    if (buffer === undefined) return;
    if (historyEpochRef.current === state.epoch) return;
    historyEpochRef.current = state.epoch;
    setHistory(createHistory(buffer));
  }, [buffer, state.epoch]);

  // ---- Redraw the overlay canvas from the authoritative buffer ----
  const drawOverlay = useCallback((buf: MaskBuffer) => {
    const canvas = overlayRef.current;
    if (canvas === null) return;
    if (canvas.width !== buf.width) canvas.width = buf.width;
    if (canvas.height !== buf.height) canvas.height = buf.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const image = ctx.createImageData(buf.width, buf.height);
    const d = image.data;
    for (let i = 0; i < buf.data.length; i++) {
      if (buf.data[i] === 255) {
        d[i * 4] = OVERLAY_RGB.r;
        d[i * 4 + 1] = OVERLAY_RGB.g;
        d[i * 4 + 2] = OVERLAY_RGB.b;
        d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  useEffect(() => {
    if (buffer !== undefined) drawOverlay(buffer);
  }, [buffer, drawOverlay]);

  // ---- Commit / undo / redo (mirror the reducer to the local history) ----
  const commitBuffer = useCallback(
    (next: MaskBuffer) => {
      dispatch({ type: "SET_MASK_BUFFER", buffer: next });
      const h = historyRef.current;
      if (h !== null) setHistory(pushH(h, next));
    },
    [dispatch],
  );

  const doUndo = useCallback(() => {
    const h = historyRef.current;
    if (h === null || !canUndoH(h)) return;
    const n = undoH(h);
    setHistory(n);
    dispatch({ type: "SET_MASK_BUFFER", buffer: currentH(n) });
  }, [dispatch]);

  const doRedo = useCallback(() => {
    const h = historyRef.current;
    if (h === null || !canRedoH(h)) return;
    const n = redoH(h);
    setHistory(n);
    dispatch({ type: "SET_MASK_BUFFER", buffer: currentH(n) });
  }, [dispatch]);

  // ---- Pointer painting + pan ----
  const strokePointsRef = useRef<Point[]>([]);
  const lastBufPointRef = useRef<Point | null>(null);
  const paintingRef = useRef(false);
  const spaceRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef<{ client: Point; pan: Point } | null>(null);

  const toBufferPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const el = viewportRef.current;
      if (el === null || photoWidth === 0 || photoHeight === 0) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const p = screenToBuffer({
        clientX,
        clientY,
        rect,
        zoom: zoomRef.current,
        pan: panRef.current,
        bufferWidth: photoWidth,
        bufferHeight: photoHeight,
      });
      // A non-finite coord (degenerate transform) must never enter the buffer.
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return p;
    },
    [photoWidth, photoHeight],
  );

  const strokeFeedback = useCallback((from: Point, to: Point) => {
    const ctx = overlayRef.current?.getContext("2d");
    if (!ctx) return;
    const eraser = toolRef.current === "eraser";
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = `rgb(${OVERLAY_RGB.r}, ${OVERLAY_RGB.g}, ${OVERLAY_RGB.b})`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushRef.current;
    if (from.x === to.x && from.y === to.y) {
      // Zero-length stroke (a tap): draw an explicit disc so the dot is visible
      // immediately rather than relying on line-cap behavior.
      ctx.beginPath();
      ctx.arc(from.x, from.y, brushRef.current / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const updateCursor = useCallback((clientX: number, clientY: number) => {
    const el = viewportRef.current;
    const cursor = cursorRef.current;
    if (el === null || cursor === null || photoWidth === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const scale = (rect.width / photoWidth) * zoomRef.current;
    const diameter = brushRef.current * scale;
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.left = `${clientX - rect.left}px`;
    cursor.style.top = `${clientY - rect.top}px`;
  }, [photoWidth]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (bufferRef.current === undefined) return;
      // Pointer capture keeps events flowing if the pointer leaves the element
      // mid-stroke; it is an optimization, so a rare NotFoundError (no active
      // pointer) must not abort the stroke.
      try {
        viewportRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture unavailable — painting still works without it */
      }
      if (spaceRef.current) {
        panningRef.current = true;
        panStartRef.current = {
          client: { x: e.clientX, y: e.clientY },
          pan: panRef.current,
        };
        return;
      }
      const p = toBufferPoint(e.clientX, e.clientY);
      if (p === null) return;
      paintingRef.current = true;
      strokePointsRef.current = [p];
      lastBufPointRef.current = p;
      strokeFeedback(p, p); // a single tap leaves a dot
    },
    [toBufferPoint, strokeFeedback],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      updateCursor(e.clientX, e.clientY);
      if (panningRef.current && panStartRef.current !== null) {
        const s = panStartRef.current;
        const nextPan = {
          x: s.pan.x + (e.clientX - s.client.x),
          y: s.pan.y + (e.clientY - s.client.y),
        };
        panRef.current = nextPan; // sync now: painting reads the ref, not state
        setPan(nextPan);
        return;
      }
      if (!paintingRef.current) return;
      const p = toBufferPoint(e.clientX, e.clientY);
      if (p === null) return;
      strokePointsRef.current.push(p);
      if (lastBufPointRef.current !== null) strokeFeedback(lastBufPointRef.current, p);
      lastBufPointRef.current = p;
    },
    [toBufferPoint, strokeFeedback, updateCursor],
  );

  const endStroke = useCallback(() => {
    if (panningRef.current) {
      panningRef.current = false;
      panStartRef.current = null;
      return;
    }
    if (!paintingRef.current) return;
    paintingRef.current = false;
    const base = bufferRef.current;
    const points = strokePointsRef.current;
    strokePointsRef.current = [];
    lastBufPointRef.current = null;
    if (base === undefined || points.length === 0) return;
    const next = paintStroke(base, points, brushRef.current, toolRef.current);
    commitBuffer(next); // authoritative; the overlay effect redraws (snaps binary)
  }, [commitBuffer]);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = viewportRef.current;
      if (el === null || photoWidth === 0 || photoHeight === 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const oldZoom = zoomRef.current;
      const newZoom = clampZoom(
        oldZoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      );
      if (newZoom === oldZoom) return;
      // Keep the buffer point under the cursor fixed (zoom centered on cursor).
      const b = screenToBuffer({
        clientX: e.clientX,
        clientY: e.clientY,
        rect,
        zoom: oldZoom,
        pan: panRef.current,
        bufferWidth: photoWidth,
        bufferHeight: photoHeight,
      });
      const scaleX = rect.width / photoWidth;
      const scaleY = rect.height / photoHeight;
      const nextPan = {
        x: e.clientX - rect.left - newZoom * scaleX * b.x,
        y: e.clientY - rect.top - newZoom * scaleY * b.y,
      };
      // Sync refs synchronously: a rapid wheel burst (and any paint before the
      // next render) must read the just-applied zoom/pan, not the stale render.
      zoomRef.current = newZoom;
      panRef.current = nextPan;
      setZoom(newZoom);
      setPan(nextPan);
    },
    [photoWidth, photoHeight],
  );

  // ---- Keyboard shortcuts (mask step only; removed on unmount) ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      // A stroke in flight owns the interaction — don't let a shortcut mutate
      // the buffer or history mid-drag (would commit onto a shifted base).
      if (paintingRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
        return;
      }
      if (mod) return;
      switch (e.key) {
        case "b":
        case "B":
          setTool("brush");
          break;
        case "e":
        case "E":
          setTool("eraser");
          break;
        case "[":
          setBrushSize((s) => stepBrush(s, -1));
          break;
        case "]":
          setBrushSize((s) => stepBrush(s, 1));
          break;
        case " ":
          spaceRef.current = true;
          e.preventDefault();
          break;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") spaceRef.current = false;
    }
    // If focus leaves the window while Space is held, the keyup is missed —
    // clear the pan flag so the next pointer-down paints instead of panning.
    function onBlur() {
      spaceRef.current = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [doUndo, doRedo]);

  // ---- Validate the mask (Story 2.3) ----
  const canValidate = buffer !== undefined && !isBufferEmpty(buffer);
  const handleValidate = useCallback(async () => {
    // Read the LIVE buffer from the ref (not the closure `state`, which could lag
    // a paint commit by a frame) and guard re-entry synchronously via a ref (the
    // `validating` state flips only on the next render).
    const buf = bufferRef.current;
    if (validatingRef.current || buf === undefined || isBufferEmpty(buf)) return;
    validatingRef.current = true;
    setValidating(true);
    setValidateError(null);
    const controller = new AbortController();
    const startEpoch = epochRef.current;
    const snapshot: Generation = {
      ...state,
      maskDraft: {
        detectedMaskUrl: state.maskDraft?.detectedMaskUrl ?? null,
        buffer: buf,
      },
    };
    try {
      await runValidateMask(snapshot, dispatch, {
        signal: controller.signal,
        isStale: () => epochRef.current !== startEpoch,
      });
    } catch {
      setValidateError("L’envoi du Masque a échoué. Réessayez.");
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }
  }, [state, dispatch]);

  const aspectRatio =
    photoWidth > 0 && photoHeight > 0 ? `${photoWidth} / ${photoHeight}` : undefined;
  const h = history;
  // No-furniture fallback (FR-16): detection ran but found nothing. NOT an error
  // (AR-ERRORS) — a neutral banner; the blank buffer + default brush let the user
  // paint manually (Story 2.4).
  const noFurniture =
    state.maskDraft !== undefined && state.maskDraft.detectedMaskUrl === null;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {noFurniture && (
        <ErrorBanner
          variant="neutral"
          message="Aucun meuble détecté. Peignez vous-même les zones à faire disparaître."
        />
      )}
      <div
        ref={viewportRef}
        className="relative w-full max-w-3xl touch-none overflow-hidden rounded-lg border border-bordure"
        style={{ aspectRatio }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={() => {
          if (cursorRef.current) cursorRef.current.style.opacity = "0";
        }}
        onPointerEnter={() => {
          if (cursorRef.current) cursorRef.current.style.opacity = "1";
        }}
        onWheel={onWheel}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Votre photo"
              className="absolute inset-0 block h-full w-full select-none"
              draggable={false}
            />
          )}
          <canvas
            ref={overlayRef}
            aria-label="Masque"
            className="absolute inset-0 h-full w-full opacity-45 [filter:drop-shadow(0_0_1.5px_var(--color-masque-contour))]"
          />
        </div>
        {/* Brush cursor: a circle at the tool size (UX-DR7). Positioned via ref
            to avoid a re-render on every mouse move. */}
        <div
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 opacity-0 mix-blend-difference"
        />
      </div>

      <MaskToolbar
        tool={tool}
        size={brushSize}
        canUndo={h !== null && canUndoH(h)}
        canRedo={h !== null && canRedoH(h)}
        onToolChange={setTool}
        onSizeChange={setBrushSize}
        onUndo={doUndo}
        onRedo={doRedo}
      />

      <div className="flex flex-col items-center gap-2">
        <GenerationButton
          disabled={!canValidate || validating}
          tooltip={canValidate ? undefined : "Peignez au moins une zone"}
          onClick={handleValidate}
        >
          {validating ? "Envoi du Masque…" : "Valider le Masque"}
        </GenerationButton>
        {validateError !== null && (
          <p role="alert" aria-live="assertive" className="text-sm text-erreur">
            {validateError}
          </p>
        )}
      </div>
    </div>
  );
}

/** True when the event target is a control that should keep its own key handling
 * (so editor shortcuts don't hijack the Slider thumb or a button). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" || // a focused toolbar button keeps Space/Enter for itself
    target.isContentEditable ||
    target.getAttribute("role") === "slider"
  );
}

