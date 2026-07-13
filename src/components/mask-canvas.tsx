"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  paintStroke,
  type MaskBuffer,
  type MaskTool,
  type Point,
} from "@/lib/mask-buffer";
import { SelectPulse, type SelectPhase } from "@/components/select-pulse";
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

// Concrete RGB of --color-masque-overlay (#ff2e9e). Canvas pixels can't read a
// CSS variable, so the token value is mirrored here (kept in sync with globals).
const OVERLAY_RGB = { r: 255, g: 46, b: 158 } as const;
const DEFAULT_BRUSH = 32;
/** Wheel zoom multiplier per notch. */
const ZOOM_STEP = 1.15;

interface MaskCanvasProps {
  /** Background image URL drawn under the mask overlay (photo in reveal mode,
   * work image in edit mode). Null while it is still loading. */
  backgroundUrl: string | null;
  /** Canonical buffer dimensions (1:1 with the mask buffer, AD-2/AD-7). */
  width: number;
  height: number;
  /** The authoritative mask buffer (owned by the host reducer, AD-13). Undefined
   * until seeded — painting is disabled and the overlay stays empty. */
  buffer: MaskBuffer | undefined;
  /** Bumped per attempt by the host; re-initializes the local undo history. */
  epoch: number;
  /** Called with a NEW buffer on every stroke / undo / redo. The host commits it
   * (e.g. dispatch SET_MASK_BUFFER). MaskCanvas never mutates in place (AD-13). */
  onCommit: (next: MaskBuffer) => void;
  /** Alt text for the background image (a11y). */
  backgroundAlt?: string;
  /** Enables the click-to-select tool (Story 5.6, edit mode only). Reveal mode
   * leaves this false so the tool never appears. */
  selectable?: boolean;
  /** Called with the clicked buffer point when the select tool is active. The
   * host segments the object under it (SAM point-prompt) and unions the mask. */
  onPointSelect?: (point: Point) => void;
  /** True while the host's segmentation is in flight — drives the pulse loader. */
  selecting?: boolean;
}

/**
 * The reusable mask editing canvas (Story 5.2, extracted from MaskSurface). A
 * controlled VIEW of the binary mask buffer: brush/eraser, adjustable size,
 * cursor-centered wheel zoom, space+drag pan, undo/redo, keyboard shortcuts, and
 * the pink overlay. It owns NO pipeline/domain state (AR-LAYERS) — the host
 * passes the buffer + dimensions + background and reacts to onCommit. Zoom/pan/
 * devicePixelRatio are display transforms only; the buffer is never resampled
 * (AD-7). The undo stack is UI-local, lost on unmount (AD-13).
 */
export function MaskCanvas({
  backgroundUrl,
  width,
  height,
  buffer,
  epoch,
  onCommit,
  backgroundAlt = "Votre photo",
  selectable = false,
  onPointSelect,
  selecting = false,
}: MaskCanvasProps) {
  // ---- UI-local editor state (lost on unmount per AD-13) ----
  const [tool, setTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<History<MaskBuffer> | null>(null);

  // ---- Click-to-select pulse (Story 5.6) ----
  const [selectAnchor, setSelectAnchor] = useState<Point | null>(null);
  const [selectPhase, setSelectPhase] = useState<SelectPhase>("idle");
  // Buffer reference captured when a select click fires; on resolve, a changed
  // reference means the object landed (reveal pulse), unchanged means it failed
  // or was cancelled (brief error blip).
  const bufferAtSelectRef = useRef<MaskBuffer | undefined>(undefined);
  const prevSelectingRef = useRef(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Latest values read inside imperative event handlers without stale closures.
  const toolRef = useRef(tool);
  const brushRef = useRef(brushSize);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const historyRef = useRef(history);
  const bufferRef = useRef(buffer);
  const onPointSelectRef = useRef(onPointSelect);
  const selectableRef = useRef(selectable);
  const selectingRef = useRef(selecting);
  useEffect(() => void (toolRef.current = tool), [tool]);
  useEffect(() => void (brushRef.current = brushSize), [brushSize]);
  useEffect(() => void (zoomRef.current = zoom), [zoom]);
  useEffect(() => void (panRef.current = pan), [pan]);
  useEffect(() => void (historyRef.current = history), [history]);
  useEffect(() => void (bufferRef.current = buffer), [buffer]);
  useEffect(() => void (onPointSelectRef.current = onPointSelect), [onPointSelect]);
  useEffect(() => void (selectableRef.current = selectable), [selectable]);
  useEffect(() => void (selectingRef.current = selecting), [selecting]);

  // ---- (Re)initialize the local undo stack from the surviving buffer, once
  // per attempt — history is UI-local and rebuilt on remount (AD-13). ----
  const historyEpochRef = useRef<number | null>(null);
  useEffect(() => {
    if (buffer === undefined) return;
    if (historyEpochRef.current === epoch) return;
    historyEpochRef.current = epoch;
    setHistory(createHistory(buffer));
  }, [buffer, epoch]);

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

  // ---- Resolve the select pulse when the host's segmentation settles ----
  useEffect(() => {
    const was = prevSelectingRef.current;
    prevSelectingRef.current = selecting;
    if (!was || selecting) return; // only act on the true → false transition
    // A changed buffer reference = the object was added (reveal); otherwise the
    // call failed or was cancelled (a brief error blip).
    const landed = bufferAtSelectRef.current !== buffer;
    setSelectPhase(landed ? "reveal" : "error");
    const t = setTimeout(
      () => {
        setSelectPhase("idle");
        setSelectAnchor(null);
      },
      landed ? 550 : 350,
    );
    return () => clearTimeout(t);
  }, [selecting, buffer]);

  // ---- Commit / undo / redo (mirror the host via onCommit + local history) ----
  const commitBuffer = useCallback(
    (next: MaskBuffer) => {
      onCommit(next);
      const h = historyRef.current;
      if (h !== null) setHistory(pushH(h, next));
    },
    [onCommit],
  );

  const doUndo = useCallback(() => {
    const h = historyRef.current;
    if (h === null || !canUndoH(h)) return;
    const n = undoH(h);
    setHistory(n);
    onCommit(currentH(n));
  }, [onCommit]);

  const doRedo = useCallback(() => {
    const h = historyRef.current;
    if (h === null || !canRedoH(h)) return;
    const n = redoH(h);
    setHistory(n);
    onCommit(currentH(n));
  }, [onCommit]);

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
      if (el === null || width === 0 || height === 0) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const p = screenToBuffer({
        clientX,
        clientY,
        rect,
        zoom: zoomRef.current,
        pan: panRef.current,
        bufferWidth: width,
        bufferHeight: height,
      });
      // A non-finite coord (degenerate transform) must never enter the buffer.
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return p;
    },
    [width, height],
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

  const updateCursor = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      const cursor = cursorRef.current;
      if (el === null || cursor === null || width === 0) return;
      // The brush-size circle is meaningless for click-to-select — hide it.
      if (toolRef.current === "select") {
        cursor.style.opacity = "0";
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const scale = (rect.width / width) * zoomRef.current;
      const diameter = brushRef.current * scale;
      cursor.style.width = `${diameter}px`;
      cursor.style.height = `${diameter}px`;
      cursor.style.left = `${clientX - rect.left}px`;
      cursor.style.top = `${clientY - rect.top}px`;
    },
    [width],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // ---- Click-to-select (Story 5.6): a click segments the object, no paint.
      if (selectableRef.current && toolRef.current === "select") {
        if (selectingRef.current) return; // a segmentation is already in flight
        const p = toBufferPoint(e.clientX, e.clientY);
        if (p === null) return;
        const el = viewportRef.current;
        if (el !== null) {
          const rect = el.getBoundingClientRect();
          setSelectAnchor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          setSelectPhase("pulsing");
        }
        bufferAtSelectRef.current = bufferRef.current;
        onPointSelectRef.current?.(p);
        return;
      }
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
    // Painting only starts in brush/eraser mode (select returns early on down),
    // so narrow the tool to a StrokeMode for paintStroke.
    const mode = toolRef.current === "eraser" ? "eraser" : "brush";
    const next = paintStroke(base, points, brushRef.current, mode);
    commitBuffer(next); // authoritative; the overlay effect redraws (snaps binary)
  }, [commitBuffer]);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = viewportRef.current;
      if (el === null || width === 0 || height === 0) return;
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
        bufferWidth: width,
        bufferHeight: height,
      });
      const scaleX = rect.width / width;
      const scaleY = rect.height / height;
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
    [width, height],
  );

  // ---- Keyboard shortcuts (mounted only while the canvas is; removed on unmount) ----
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
        case "s":
        case "S":
          if (selectableRef.current) setTool("select");
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

  const aspectRatio =
    width > 0 && height > 0 ? `${width} / ${height}` : undefined;
  const h = history;

  return (
    <>
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
          {backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backgroundUrl}
              alt={backgroundAlt}
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
        <SelectPulse anchor={selectAnchor} phase={selectPhase} />
      </div>

      <MaskToolbar
        tool={tool}
        size={brushSize}
        selectable={selectable}
        canUndo={h !== null && canUndoH(h)}
        canRedo={h !== null && canRedoH(h)}
        onToolChange={setTool}
        onSizeChange={setBrushSize}
        onUndo={doUndo}
        onRedo={doRedo}
      />
    </>
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
