"""
RoomReveal local detection service — a self-hosted alternative to fal's SAM 3.

Pipeline: Grounding DINO (open-vocabulary text -> boxes) then SAM (boxes ->
masks). Unlike fal's SAM 3 (one concept per call), Grounding DINO takes ALL
concepts in a single prompt ("cabinet. countertop. oven. ..."), so the whole
FURNITURE_CATEGORIES list is detected in one pass — free, no per-concept cost.
All masks are unioned into one binary PNG (white = furniture) at the input
resolution; the Next app reduces it to canonical dimensions (AD-2 amendment).
/detect returns the PNG base64-encoded in a JSON envelope together with the
per-object instances (label + normalized box) that drive the motion prompt
(Story 4.6); /point and /box still return the raw PNG.

Run:  uvicorn server:app --host 0.0.0.0 --port 8000
The app calls this when NEXT_PUBLIC_DETECT_BACKEND=local (see ../README notes).
"""

from __future__ import annotations

import base64
import io
import json
import tempfile

import imageio.v3 as iio
import numpy as np
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image
from transformers import (
    AutoModelForZeroShotObjectDetection,
    AutoProcessor,
    SamModel,
    SamProcessor,
)

# --- Config ---------------------------------------------------------------
GDINO_ID = "IDEA-Research/grounding-dino-base"
SAM_ID = "facebook/sam-vit-base"
# Grounding DINO confidence. Calibrated live on a kitchen (RX 9060 / gfx1200):
# 0.30 -> ~23% coverage (misses upper cabinets); 0.20 -> ~60% (bleeds onto
# ceiling/walls); 0.25 is a balanced start. Lower = catch more. The mask is
# user-editable afterwards, so err slightly generous.
# Lowered 0.25 → 0.22 (2026-07-12) to widen coverage — small counter items /
# wall-mounted objects were being missed. Over-detection is erasable (the user's
# gomme) and the mask is user-editable, so err generous. 0.20 bled onto the
# ceiling/walls in earlier calibration; 0.22 is the balanced point.
BOX_THRESHOLD = 0.22
TEXT_THRESHOLD = 0.22
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# --- Lazy model loading ---------------------------------------------------
# Loaded on the FIRST /detect (not at import) so uvicorn binds the port
# immediately — otherwise the first-run weight download (~1–2 GB) would keep the
# port closed and the browser would see ERR_CONNECTION_REFUSED. /health works
# right away; the first detection is slow once, then cached.
_models: dict = {}


def _ensure_models() -> dict:
    if not _models:
        print(f"[local-detect] loading models on {DEVICE} (first request) ...")
        _models["gdino_processor"] = AutoProcessor.from_pretrained(GDINO_ID)
        _models["gdino_model"] = AutoModelForZeroShotObjectDetection.from_pretrained(
            GDINO_ID
        ).to(DEVICE)
        _models["sam_processor"] = SamProcessor.from_pretrained(SAM_ID)
        _models["sam_model"] = SamModel.from_pretrained(SAM_ID).to(DEVICE)
        print("[local-detect] models ready.")
    return _models


app = FastAPI(title="RoomReveal local detection")
# Dev CORS: the Next app (localhost:3000) fetches this directly from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "device": DEVICE, "models_loaded": bool(_models)}


def _detect_boxes(
    m: dict, image: Image.Image, prompts: list[str]
) -> tuple[torch.Tensor, list[str]]:
    """Grounding DINO over all concepts at once -> (xyxy boxes, text labels).

    Boxes may be empty (labels then too). Labels are the matched concept texts,
    passed through as-is (English, lowercase, sometimes merged phrases).
    """
    # GDINO convention: lowercase concepts, each ended by " . ".
    text = " . ".join(p.strip().lower() for p in prompts if p.strip()) + " ."
    inputs = m["gdino_processor"](images=image, text=text, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        outputs = m["gdino_model"](**inputs)
    results = m["gdino_processor"].post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        threshold=BOX_THRESHOLD,  # renamed from box_threshold in transformers 5.x
        text_threshold=TEXT_THRESHOLD,
        target_sizes=[image.size[::-1]],  # (h, w)
    )
    result = results[0]
    # transformers 5.x returns the text labels under "text_labels" (same rename
    # wave as threshold above); older builds used "labels" for the same strings.
    labels = result.get("text_labels", result.get("labels"))
    if labels is None or not all(isinstance(label, str) for label in labels):
        # Fail loudly rather than invent a mapping — on some transformers builds
        # "labels" holds class ids/tensors, not strings, which would leak
        # garbage like "tensor(0)" into the motion prompt. The adapter turns
        # the 500 into the usual retryable detect StepError.
        raise RuntimeError(
            "Grounding DINO post-processing returned no usable text labels"
        )
    return result["boxes"], list(labels)  # tensor [n, 4] xyxy


def _segment_union(m: dict, image: Image.Image, boxes: torch.Tensor) -> np.ndarray:
    """SAM over every box -> union of the masks as a bool array [H, W]."""
    # SamProcessor input_boxes shape: (batch, nb_boxes, 4) -> one image, N boxes.
    inputs = m["sam_processor"](
        image, input_boxes=[boxes.tolist()], return_tensors="pt"
    ).to(DEVICE)
    with torch.no_grad():
        outputs = m["sam_model"](**inputs)
    masks = m["sam_processor"].image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu(),
    )[0]  # tensor [n_boxes, n_multimask, H, W]
    scores = outputs.iou_scores.cpu()[0]  # [n_boxes, n_multimask]
    w, h = image.size
    union = np.zeros((h, w), dtype=bool)
    for i in range(masks.shape[0]):
        best = int(torch.argmax(scores[i]))  # highest-IoU mask per box
        union |= masks[i, best].numpy().astype(bool)
    return union


def _segment_instances(
    m: dict, image: Image.Image, boxes: torch.Tensor
) -> list[np.ndarray]:
    """SAM over every box -> the PER-OBJECT masks as a list of bool arrays [H, W].

    Same forward pass and best-mask-per-box selection as `_segment_union`, but
    keeps each object's mask separate instead of OR-ing them together. `/detect`
    and its union are untouched; this powers the Motion Brush backend
    (`/instance-masks`, Story 4.8), which needs one dynamic brush per object.
    """
    inputs = m["sam_processor"](
        image, input_boxes=[boxes.tolist()], return_tensors="pt"
    ).to(DEVICE)
    with torch.no_grad():
        outputs = m["sam_model"](**inputs)
    masks = m["sam_processor"].image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu(),
    )[0]  # tensor [n_boxes, n_multimask, H, W]
    scores = outputs.iou_scores.cpu()[0]  # [n_boxes, n_multimask]
    instances: list[np.ndarray] = []
    for i in range(masks.shape[0]):
        best = int(torch.argmax(scores[i]))  # highest-IoU mask per box (as union)
        instances.append(masks[i, best].numpy().astype(bool))
    return instances


def _segment_point(m: dict, image: Image.Image, x: int, y: int) -> np.ndarray:
    """SAM at a single positive point -> best mask as a bool array [H, W].

    The click-to-select counterpart of _segment_union (Story 5.6): no Grounding
    DINO, just SAM point-prompting. Picks the highest-IoU of SAM's multimask
    outputs for the point.
    """
    inputs = m["sam_processor"](
        image,
        input_points=[[[x, y]]],  # (batch, n_points, 2) -> one image, one point
        input_labels=[[1]],  # 1 = foreground/include
        return_tensors="pt",
    ).to(DEVICE)
    with torch.no_grad():
        outputs = m["sam_model"](**inputs)
    masks = m["sam_processor"].image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu(),
    )[0]  # tensor [n_points, n_multimask, H, W]
    scores = outputs.iou_scores.cpu()[0]  # [n_points, n_multimask]
    best = int(torch.argmax(scores[0]))
    return masks[0, best].numpy().astype(bool)


def _segment_box(
    m: dict, image: Image.Image, x_min: int, y_min: int, x_max: int, y_max: int
) -> np.ndarray:
    """SAM with a single box prompt -> best mask as a bool array [H, W].

    The box counterpart of _segment_point (Story 5.7): a rectangle around a piece
    of furniture makes SAM return the WHOLE object, not a sub-part (the drawer).
    """
    inputs = m["sam_processor"](
        image,
        input_boxes=[[[x_min, y_min, x_max, y_max]]],  # (batch, n_boxes, 4)
        return_tensors="pt",
    ).to(DEVICE)
    with torch.no_grad():
        outputs = m["sam_model"](**inputs)
    masks = m["sam_processor"].image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu(),
    )[0]  # tensor [n_boxes, n_multimask, H, W]
    scores = outputs.iou_scores.cpu()[0]  # [n_boxes, n_multimask]
    best = int(torch.argmax(scores[0]))
    return masks[0, best].numpy().astype(bool)


def _mask_response(mask: np.ndarray) -> Response:
    """Encode a bool mask as a binary PNG, or 204 when empty (FR-16 style)."""
    if not mask.any():
        return Response(status_code=204)
    mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    buf = io.BytesIO()
    mask_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@app.post("/point")
async def point(image: UploadFile = File(...), point: str = Form(...)) -> Response:
    """Segment the object under a clicked point (SAM point-prompt, Story 5.6)."""
    m = _ensure_models()
    coord = json.loads(point)
    pil = Image.open(io.BytesIO(await image.read())).convert("RGB")
    return _mask_response(_segment_point(m, pil, int(coord["x"]), int(coord["y"])))


@app.post("/box")
async def box(image: UploadFile = File(...), box: str = Form(...)) -> Response:
    """Segment the whole object inside a drag box (SAM box-prompt, Story 5.7)."""
    m = _ensure_models()
    b = json.loads(box)
    pil = Image.open(io.BytesIO(await image.read())).convert("RGB")
    mask = _segment_box(
        m, pil, int(b["x_min"]), int(b["y_min"]), int(b["x_max"]), int(b["y_max"])
    )
    return _mask_response(mask)


@app.post("/detect")
async def detect(image: UploadFile = File(...), prompts: str = Form(...)) -> Response:
    m = _ensure_models()
    concepts = json.loads(prompts)
    pil = Image.open(io.BytesIO(await image.read())).convert("RGB")

    boxes, labels = _detect_boxes(m, pil, concepts)
    if boxes.numel() == 0:
        return Response(status_code=204)  # no furniture (FR-16)

    union = _segment_union(m, pil, boxes)
    if not union.any():
        return Response(status_code=204)

    mask_img = Image.fromarray((union * 255).astype(np.uint8), mode="L")
    buf = io.BytesIO()
    mask_img.save(buf, format="PNG")
    # Per-object instances (Story 4.6): label + box normalized to [0,1] relative
    # to THIS image (AD-2: never pixel coordinates), plus the normalized box
    # area so the app can rank objects by size. The unioned mask is unchanged
    # (AD-7) — instances are an informative side channel for the motion prompt.
    w, h = pil.size

    def _norm(value: float, size: int) -> float:
        # GDINO boxes can spill past the frame — clamp to honor the [0,1] contract.
        return min(max(value / size, 0.0), 1.0)

    instances = [
        {
            "label": label,
            "box": [_norm(x0, w), _norm(y0, h), _norm(x1, w), _norm(y1, h)],
            "area": (_norm(x1, w) - _norm(x0, w)) * (_norm(y1, h) - _norm(y0, h)),
        }
        for (x0, y0, x1, y1), label in zip(boxes.tolist(), labels, strict=True)
    ]
    return JSONResponse(
        {
            "mask": base64.b64encode(buf.getvalue()).decode("ascii"),
            "instances": instances,
        }
    )


def _mask_b64(mask: np.ndarray) -> str:
    """Encode a bool mask as a base64 binary PNG (white = mask)."""
    mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    buf = io.BytesIO()
    mask_img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@app.post("/instance-masks")
async def instance_masks(
    image: UploadFile = File(...), prompts: str = Form(...)
) -> Response:
    """Per-object SAM masks + the room shell, for the Motion Brush backend (4.8).

    Same detection as `/detect` (Grounding DINO -> SAM), but instead of one
    unioned mask it returns each object's mask separately (the Kling dynamic
    brushes) plus `static_mask` = the inverse of their union (the room shell =
    the Kling static brush). Boxes are normalized to [0,1] and clamped like
    `/detect`. 204 when no furniture (FR-16) — same contract as `/detect`.
    `/detect`, `/point`, `/box` are untouched.
    """
    m = _ensure_models()
    concepts = json.loads(prompts)
    pil = Image.open(io.BytesIO(await image.read())).convert("RGB")

    boxes, labels = _detect_boxes(m, pil, concepts)
    if boxes.numel() == 0:
        return Response(status_code=204)  # no furniture (FR-16)

    masks = _segment_instances(m, pil, boxes)
    w, h = pil.size
    union = np.zeros((h, w), dtype=bool)
    for mask in masks:
        union |= mask
    if not union.any():
        return Response(status_code=204)

    def _norm(value: float, size: int) -> float:
        # GDINO boxes can spill past the frame — clamp to honor the [0,1] contract.
        return min(max(value / size, 0.0), 1.0)

    instances = [
        {
            "label": label,
            "box": [_norm(x0, w), _norm(y0, h), _norm(x1, w), _norm(y1, h)],
            # Clamp each side to >=0: an inverted GDINO box (x1<x0) must not yield
            # a negative area that would invert the largest-first cap downstream.
            "area": max(0.0, _norm(x1, w) - _norm(x0, w))
            * max(0.0, _norm(y1, h) - _norm(y0, h)),
            "mask": _mask_b64(mask),
        }
        for (x0, y0, x1, y1), label, mask in zip(
            boxes.tolist(), labels, masks, strict=True
        )
    ]
    return JSONResponse(
        {
            "instances": instances,
            # The room shell = everything the furniture does NOT cover, the Kling
            # static brush (walls/floor/windows must not move).
            "static_mask": _mask_b64(~union),
        }
    )


@app.post("/reverse")
async def reverse(video: UploadFile = File(...)) -> Response:
    """Time-reverse an MP4 (Motion Brush backend, Story 4.8).

    The Motion Brush path generates the furnished->empty exit clip, then reverses
    it here so the furniture ENTERS and the last frame is the untouched photo.
    Self-contained: `imageio[ffmpeg]` ships a static ffmpeg binary (pip only, no
    system dependency), so this has no effect on the model lazy loading. Reads
    all frames, reverses their order, re-encodes at the SAME fps. A transient
    local transform (like detection), not storage — the caller re-uploads the
    result to fal (AD-9).
    """
    raw = await video.read()
    try:
        # imageio needs a real file for the ffmpeg reader/metadata (fps); use a temp.
        with tempfile.NamedTemporaryFile(suffix=".mp4") as src:
            src.write(raw)
            src.flush()
            frames = list(iio.imiter(src.name, plugin="FFMPEG"))
            meta = iio.immeta(src.name, plugin="FFMPEG")
        # A video that decodes to zero frames cannot be reversed/encoded — reject
        # it cleanly instead of letting imwrite raise a generic 500.
        if not frames:
            return Response(status_code=422)
        # Robust fps read: a missing/zero/non-numeric value falls back to 24.0.
        fps = meta.get("fps") or 24.0
        if not (isinstance(fps, (int, float)) and fps > 0):
            fps = 24.0
        reversed_frames = list(reversed(frames))
        out = iio.imwrite(
            "<bytes>", reversed_frames, extension=".mp4", plugin="FFMPEG", fps=float(fps)
        )
    except Exception:
        # Never leak an ffmpeg stack / generic 500 — a bad upload is a 422.
        return Response(status_code=422)
    return Response(content=out, media_type="video/mp4")
