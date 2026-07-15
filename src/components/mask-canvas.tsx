"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  paintStroke,
  type MaskBuffer,
  type MaskTool,
  type Point,
  type SelectRegion,
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
/** Below this drag distance (viewport px) a select gesture counts as a click
 * (point prompt) rather than a box drag (Story 5.7). */
const SELECT_DRAG_THRESHOLD_PX = 6;

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
  /** Called with the select gesture (buffer coords) when the select tool is
   * active: a `point` click (SAM point-prompt → salient object) or a `box` drag
   * (→ the whole enclosed object). The host segments it and unions the mask. */
  onSelect?: (region: SelectRegion) => void;
  /** Called when the « détection auto » button (or the `A` key) fires: the host
   * runs the whole-scene SAM furniture detection and unions the result. Shown in
   * the toolbar only when provided (edit mode). */
  onSelectAll?: () => void;
  /** True while the host's segmentation is in flight — drives the pulse loader.
   * Also disables/animates the « détection auto » button so it can't re-fire. */
  selecting?: boolean;
  /** True while a retouch is being applied — the pink mask zones pulse in place
   * of a full-screen loader (edit mode, Story 5.4 polish). */
  pulsing?: boolean;
  /** Optional control rendered to the RIGHT of the mask toolbar, stretched to its
   * height (edit mode's « Appliquer », a tall gold check button). */
  toolbarAction?: React.ReactNode;
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
  onSelect,
  onSelectAll,
  selecting = false,
  pulsing = false,
  toolbarAction,
}: MaskCanvasProps) {
  // ---- UI-local editor state (lost on unmount per AD-13) ----
  const [tool, setTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<History<MaskBuffer> | null>(null);

  // ---- Retouch wave (Story 5.4): a snapshot of the mask silhouette (PNG data
  // URL) clips the wave to the exact zone shape while applying, and the zone's
  // bounding-box centroid/radius anchor the ring so it radiates from the center
  // of the selection out to its farthest edge. cx/cy are % of the container;
  // d is the ring diameter as % of the container width. ----
  const [sweep, setSweep] = useState<{
    mask: string;
    cx: number;
    cy: number;
    d: number;
  } | null>(null);

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
  const onSelectRef = useRef(onSelect);
  const onSelectAllRef = useRef(onSelectAll);
  const selectableRef = useRef(selectable);
  const selectingRef = useRef(selecting);
  // Box-drag (Story 5.7): drag start/current in both buffer + viewport-local
  // coords; `selectDraggingRef` marks a drag in progress. The live rectangle is
  // drawn via `selectBoxRef` (positioned imperatively, no re-render).
  const selectDraggingRef = useRef(false);
  const selectStartRef = useRef<{ buf: Point; sx: number; sy: number } | null>(null);
  const selectCurRef = useRef<{ buf: Point; sx: number; sy: number } | null>(null);
  const selectBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => void (toolRef.current = tool), [tool]);
  useEffect(() => void (brushRef.current = brushSize), [brushSize]);
  useEffect(() => void (zoomRef.current = zoom), [zoom]);
  useEffect(() => void (panRef.current = pan), [pan]);
  useEffect(() => void (historyRef.current = history), [history]);
  useEffect(() => void (bufferRef.current = buffer), [buffer]);
  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (onSelectAllRef.current = onSelectAll), [onSelectAll]);
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

  // ---- Capture the mask silhouette + geometry for the retouch wave ----
  // While applying, snapshot the just-drawn overlay (a PNG whose alpha traces the
  // zone) so the wave can be clipped to the exact shape, and scan the buffer for
  // the zone's bounding box so the ring starts at its center and reaches its
  // farthest edge. Re-captured if the zone changes mid-apply; cleared when the
  // apply ends. toDataURL is guarded — a 2D-context-less canvas (jsdom) or a
  // rare failure simply skips the effect.
  useEffect(() => {
    if (!pulsing || buffer === undefined) {
      setSweep(null);
      return;
    }
    const canvas = overlayRef.current;
    if (canvas === null) return;
    let mask: string;
    try {
      mask = canvas.toDataURL();
    } catch {
      setSweep(null);
      return;
    }
    // Bounding box of the selected pixels (one O(n) pass, once per apply).
    const { width: w, height: h, data } = buffer;
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (data[row + x] === 255) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX === -1) {
      setSweep(null); // empty mask — nothing to animate
      return;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Radius to the farthest bbox corner (display scale is uniform since the
    // container preserves the buffer aspect, so a buffer-space circle stays
    // circular on screen). +8% margin so the ring fully exits the zone.
    const r =
      Math.hypot(Math.max(cx - minX, maxX - cx), Math.max(cy - minY, maxY - cy)) *
      1.08;
    setSweep({
      mask,
      cx: (cx / w) * 100,
      cy: (cy / h) * 100,
      d: ((2 * r) / w) * 100,
    });
  }, [pulsing, buffer]);

  // ---- Resolve the select pulse when the host's segmentation settles ----
  useEffect(() => {
    const was = prevSelectingRef.current;
    prevSelectingRef.current = selecting;
    if (selecting) {
      // Keep the success baseline current with any in-flight buffer change (an
      // undo/redo during the roundtrip) so the reveal-vs-error test reflects
      // ONLY the segmentation's own contribution, not an unrelated edit.
      bufferAtSelectRef.current = buffer;
      return;
    }
    if (!was) return; // was already idle — nothing settled
    // The result arrived → drop the kept drag rectangle (Story 5.7 polish); the
    // reveal silhouette pulse takes over from here.
    if (selectBoxRef.current) selectBoxRef.current.style.opacity = "0";
    // A changed buffer reference = the object landed (reveal); otherwise the
    // call failed or was cancelled (a brief error blip).
    const landed = bufferAtSelectRef.current !== buffer;
    // A landed click-selection is an undoable step: push it onto the local undo
    // stack so Ctrl+Z / the ↶ button removes it (it arrived via the reducer's
    // UNION_MASK_BUFFER, not commitBuffer, so it isn't recorded otherwise).
    if (landed && buffer !== undefined) {
      const h = historyRef.current;
      if (h !== null) setHistory(pushH(h, buffer));
    }
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

  // ---- Tool switch (event handler, not effect): changing tool clears any
  // pending select-pulse visuals so a stale "pulsing" dot can't linger while the
  // user paints. The brush cursor is restored by updateCursor on the next move.
  const changeTool = useCallback((next: MaskTool) => {
    setTool(next);
    if (next !== "select") {
      setSelectPhase("idle");
      setSelectAnchor(null);
      if (selectBoxRef.current) selectBoxRef.current.style.opacity = "0";
    }
  }, []);

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
      // Restore visibility when returning from select mode (hidden there) so the
      // brush circle reappears on the first move without needing a re-enter.
      cursor.style.opacity = "1";
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
      // ---- Select tool (Story 5.6/5.7): start a select gesture (no paint). A
      // release without drag → point prompt; a drag → box prompt. Resolved in
      // endStroke; here we only record the start + arm the live rectangle.
      if (selectableRef.current && toolRef.current === "select") {
        if (selectingRef.current) return; // a segmentation is already in flight
        const p = toBufferPoint(e.clientX, e.clientY);
        const el = viewportRef.current;
        if (p === null || el === null) return;
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        // Keep receiving moves if the pointer leaves the element mid-drag.
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture unavailable — drag still works */
        }
        selectDraggingRef.current = true;
        selectStartRef.current = { buf: p, sx, sy };
        selectCurRef.current = { buf: p, sx, sy };
        const box = selectBoxRef.current;
        if (box) {
          box.style.opacity = "0"; // shown once the drag actually moves
          box.style.left = `${sx}px`;
          box.style.top = `${sy}px`;
          box.style.width = "0px";
          box.style.height = "0px";
        }
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
      // Select box drag (Story 5.7): grow the live rectangle from the start point.
      if (selectDraggingRef.current && selectStartRef.current !== null) {
        const el = viewportRef.current;
        const p = toBufferPoint(e.clientX, e.clientY);
        if (el === null || p === null) return;
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        selectCurRef.current = { buf: p, sx, sy };
        const s = selectStartRef.current;
        const box = selectBoxRef.current;
        if (box) {
          box.style.opacity = "1";
          box.style.left = `${Math.min(s.sx, sx)}px`;
          box.style.top = `${Math.min(s.sy, sy)}px`;
          box.style.width = `${Math.abs(sx - s.sx)}px`;
          box.style.height = `${Math.abs(sy - s.sy)}px`;
        }
        return;
      }
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
    // Finalize a select gesture (Story 5.7): a small drag → point prompt, a real
    // drag → box prompt (whole object). Emits ONE region to the host.
    if (selectDraggingRef.current) {
      selectDraggingRef.current = false;
      const start = selectStartRef.current;
      const cur = selectCurRef.current;
      selectStartRef.current = null;
      selectCurRef.current = null;
      if (start === null || cur === null) {
        if (selectBoxRef.current) selectBoxRef.current.style.opacity = "0";
        return;
      }
      const dragPx = Math.hypot(cur.sx - start.sx, cur.sy - start.sy);
      const isBox = dragPx >= SELECT_DRAG_THRESHOLD_PX;
      if (isBox) {
        // Keep the drawn rectangle visible until the result arrives, and pulse
        // from the CENTER of the box (not the release point) (Story 5.7 polish).
        setSelectAnchor({
          x: (start.sx + cur.sx) / 2,
          y: (start.sy + cur.sy) / 2,
        });
      } else {
        // A click: no box to keep — hide it, pulse at the click point.
        if (selectBoxRef.current) selectBoxRef.current.style.opacity = "0";
        setSelectAnchor({ x: start.sx, y: start.sy });
      }
      setSelectPhase("pulsing");
      bufferAtSelectRef.current = bufferRef.current;
      const region: SelectRegion = isBox
        ? {
            kind: "box",
            x0: start.buf.x,
            y0: start.buf.y,
            x1: cur.buf.x,
            y1: cur.buf.y,
          }
        : { kind: "point", x: start.buf.x, y: start.buf.y };
      onSelectRef.current?.(region);
      return;
    }
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
          changeTool("brush");
          break;
        case "e":
        case "E":
          changeTool("eraser");
          break;
        case "s":
        case "S":
          if (selectableRef.current) changeTool("select");
          break;
        case "a":
        case "A":
          // « détection auto » — ignored while a segmentation is already running.
          if (selectableRef.current && !selectingRef.current) onSelectAllRef.current?.();
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
  }, [doUndo, doRedo, changeTool]);

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
          // The brush circle is meaningless in select mode — keep it hidden.
          if (cursorRef.current && toolRef.current !== "select") {
            cursorRef.current.style.opacity = "1";
          }
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
            className={
              "absolute inset-0 h-full w-full opacity-45 [filter:drop-shadow(0_0_1.5px_var(--color-masque-contour))]" +
              // On reveal, the whole mask silhouette pulses gold once — the
              // "engulfing" pulse over the just-selected object (Story 5.6 AC3).
              (selectPhase === "reveal"
                ? " [animation:select-overlay-reveal_0.55s_ease-out]"
                : "")
            }
          />
          {/* Retouch-in-progress feedback (Story 5.4): a Gemini-style light wave
              radiates from the CENTER of the selected zone out to its edges while
              the edit runs — replaces the full-screen WaitPanel. A ring (radial
              gradient) anchored at the zone's centroid scales up on a loop
              (transform = GPU, reliable), clipped to the exact mask shape
              (captured from the overlay canvas as an alpha mask). Two rings, one
              half-period apart, keep the wave continuous. Purely decorative;
              hidden when motion is reduced. */}
          {pulsing && sweep !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
              style={{
                WebkitMaskImage: `url(${sweep.mask})`,
                maskImage: `url(${sweep.mask})`,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }}
            >
              {[0, 1].map((i) => (
                <div
                  key={i}
                  // `backwards` fill: during the 2nd ring's delay it must hold the
                  // 0% frame (tiny, centered) — otherwise it renders as a static
                  // full-size blob for the first 0.9s.
                  className="absolute rounded-full [animation:mask-wave_1.2s_ease-out_infinite_backwards]"
                  style={{
                    left: `${sweep.cx}%`,
                    top: `${sweep.cy}%`,
                    width: `${sweep.d}%`,
                    aspectRatio: "1",
                    animationDelay: i === 1 ? "0.6s" : undefined,
                    backgroundImage:
                      "radial-gradient(circle, transparent 52%, var(--color-masque-contour) 62%, #ffffff 68%, var(--color-masque-contour) 74%, transparent 84%)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {/* Brush cursor: a circle at the tool size (UX-DR7). Positioned via ref
            to avoid a re-render on every mouse move. */}
        <div
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 opacity-0 mix-blend-difference"
        />
        {/* Live selection rectangle drawn during a box drag (Story 5.7),
            positioned imperatively via selectBoxRef (no re-render). */}
        <div
          ref={selectBoxRef}
          aria-hidden
          className="pointer-events-none absolute z-10 rounded-sm border-2 border-dashed border-or-lumineux bg-or-lumineux/10 opacity-0"
        />
        <SelectPulse anchor={selectAnchor} phase={selectPhase} />
      </div>

      <MaskToolbar
        tool={tool}
        size={brushSize}
        selectable={selectable}
        onSelectAll={selectable ? onSelectAll : undefined}
        selectAllBusy={selecting}
        canUndo={h !== null && canUndoH(h)}
        canRedo={h !== null && canRedoH(h)}
        onToolChange={setTool}
        onSizeChange={setBrushSize}
        onUndo={doUndo}
        onRedo={doRedo}
        action={toolbarAction}
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
