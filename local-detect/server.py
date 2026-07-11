"""
RoomReveal local detection service — a self-hosted alternative to fal's SAM 3.

Pipeline: Grounding DINO (open-vocabulary text -> boxes) then SAM (boxes ->
masks). Unlike fal's SAM 3 (one concept per call), Grounding DINO takes ALL
concepts in a single prompt ("cabinet. countertop. oven. ..."), so the whole
FURNITURE_CATEGORIES list is detected in one pass — free, no per-concept cost.
All masks are unioned into one binary PNG (white = furniture) at the input
resolution; the Next app reduces it to canonical dimensions (AD-2 amendment).

Run:  uvicorn server:app --host 0.0.0.0 --port 8000
The app calls this when NEXT_PUBLIC_DETECT_BACKEND=local (see ../README notes).
"""

from __future__ import annotations

import io
import json

import numpy as np
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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
BOX_THRESHOLD = 0.3   # Grounding DINO detection confidence
TEXT_THRESHOLD = 0.25
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


def _detect_boxes(m: dict, image: Image.Image, prompts: list[str]) -> torch.Tensor:
    """Grounding DINO over all concepts at once -> xyxy boxes (may be empty)."""
    # GDINO convention: lowercase concepts, each ended by " . ".
    text = " . ".join(p.strip().lower() for p in prompts if p.strip()) + " ."
    inputs = m["gdino_processor"](images=image, text=text, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        outputs = m["gdino_model"](**inputs)
    results = m["gdino_processor"].post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        box_threshold=BOX_THRESHOLD,
        text_threshold=TEXT_THRESHOLD,
        target_sizes=[image.size[::-1]],  # (h, w)
    )
    return results[0]["boxes"]  # tensor [n, 4] xyxy


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


@app.post("/detect")
async def detect(image: UploadFile = File(...), prompts: str = Form(...)) -> Response:
    m = _ensure_models()
    concepts = json.loads(prompts)
    pil = Image.open(io.BytesIO(await image.read())).convert("RGB")

    boxes = _detect_boxes(m, pil, concepts)
    if boxes.numel() == 0:
        return Response(status_code=204)  # no furniture (FR-16)

    union = _segment_union(m, pil, boxes)
    if not union.any():
        return Response(status_code=204)

    mask_img = Image.fromarray((union * 255).astype(np.uint8), mode="L")
    buf = io.BytesIO()
    mask_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
