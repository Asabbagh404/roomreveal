# Local detection service (Grounded-SAM)

A self-hosted alternative to fal's SAM 3 for the Masque step. It runs
**Grounding DINO** (open-vocabulary text → boxes) then **SAM** (boxes → masks),
detects the whole `FURNITURE_CATEGORIES` list in **one pass**, unions the masks,
and returns a single binary PNG. No per-concept cost, unlike fal.

## Why

fal's `sam-3/image` takes one concept per call, so covering a full kitchen means
either a weak single prompt or paying for many calls. Grounding DINO accepts all
concepts in one prompt (`"cabinet. countertop. oven. ..."`), so the whole list
is free to detect locally.

## Setup

```bash
cd local-detect
python -m venv .venv && source .venv/bin/activate

# GPU (recommended) — install a CUDA torch build first:
pip install torch --index-url https://download.pytorch.org/whl/cu121
# then the rest:
pip install -r requirements.txt
```

First run downloads the model weights (~1–2 GB) from the HuggingFace Hub.

## Run

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

Check it: `curl http://localhost:8000/health` → `{"status":"ok","device":"cuda"}`.

## Point the app at it

In the repo root `.env` (or `.env.local`):

```
NEXT_PUBLIC_DETECT_BACKEND=local
NEXT_PUBLIC_LOCAL_DETECT_URL=http://localhost:8000/detect
```

**Restart `npm run dev`** afterwards — `NEXT_PUBLIC_*` vars are inlined when the
dev server starts, so a hot reload is not enough. Set it back to `fal` to return
to the hosted backend.

## API

`POST /detect` (multipart):
- `image`: the detection-resolution JPEG (the app sends the ≤1536 px copy)
- `prompts`: JSON array of concepts (the app sends `FURNITURE_CATEGORIES`)

Returns `200` with an `image/png` binary mask (white = furniture), or `204 No
Content` when nothing is detected (the app treats 204 as the FR-16 "no furniture"
case).

## Tuning

In `server.py`: `BOX_THRESHOLD` / `TEXT_THRESHOLD` (lower = more, looser
detections). Swap `SAM_ID` to `facebook/sam-vit-large`/`-huge` or Grounding DINO
to `-tiny` to trade quality for speed.
