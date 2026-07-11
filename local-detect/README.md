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

Models load lazily on the **first** `/detect` (not at startup), so the server
binds the port immediately. Check it's up right away:

```bash
curl http://localhost:8000/health
# {"status":"ok","device":"cuda","models_loaded":false}   <- loads on first detect
```

## Troubleshooting

**`POST http://localhost:8000/detect net::ERR_CONNECTION_REFUSED`** — nothing is
listening on :8000. Either the server isn't started, crashed on startup, or is
on another port/host. Checklist:

1. Is `uvicorn` actually running? `curl http://localhost:8000/health` should
   answer. If it doesn't, read the uvicorn terminal for a traceback.
2. Common startup failures: `torch` not installed / wrong CUDA build, or a
   `transformers` API mismatch — `pip show torch transformers` and re-run.
3. Port taken? Run on another port and update `NEXT_PUBLIC_LOCAL_DETECT_URL`
   (then restart `npm run dev`).
4. Remember the app only uses this when `NEXT_PUBLIC_DETECT_BACKEND=local` AND
   `npm run dev` was **restarted** after setting it.

The app treats an unreachable service as a retryable detection error, so you'll
see the "Relancer la détection" banner — fix the server, then retry.

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
