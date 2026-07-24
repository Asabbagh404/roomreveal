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

Returns `200` with a JSON body, or `204 No Content` when nothing is detected
(the app treats 204 as the FR-16 "no furniture" case):

```json
{
  "mask": "<base64-encoded binary PNG, white = furniture>",
  "instances": [
    { "label": "cabinet", "box": [0.1, 0.2, 0.45, 0.9], "area": 0.245 }
  ]
}
```

- `mask`: the unioned binary mask of every detected object, base64 PNG (the app
  turns it into a `data:image/png;base64,…` URL).
- `instances`: one entry per Grounding DINO detection, in detection order.
  `label` is the matched concept text as-is (English, lowercase, sometimes a
  merged phrase like `"kitchen island cabinet"`); `box` is `[x0, y0, x1, y1]`
  **normalized to [0,1]** relative to the posted image (never pixels); `area`
  is the normalized box area (`(x1-x0)·(y1-y0)`). The app uses instances to
  build the per-object motion prompt of the Révélation (Story 4.6).

Quick check (venv + GPU required):

```bash
curl -F image=@photo.jpg -F 'prompts=["cabinet","refrigerator"]' \
  localhost:8000/detect
# → {"mask":"iVBOR...","instances":[{"label":"cabinet",...}]}
```

`POST /point` and `POST /box` are unchanged: they still return a raw
`image/png` binary mask (the edit-mode selection tools depend on that).

### Motion Brush backend routes (Story 4.8)

These power the alternative `NEXT_PUBLIC_VIDEO_BACKEND=motion-brush` reveal path.
`/detect`, `/point`, `/box` and the model lazy loading are all untouched.

`POST /instance-masks` (multipart): same inputs as `/detect` (`image` +
`prompts`). Runs the **same** detection, but returns each object's SAM mask
separately (the Kling dynamic brushes) plus the room shell (the static brush):

```json
{
  "instances": [
    { "label": "cabinet", "box": [0.1, 0.2, 0.45, 0.9], "area": 0.245,
      "mask": "<base64 binary PNG, white = this object>" }
  ],
  "static_mask": "<base64 binary PNG, white = the room shell (inverse of the union)>"
}
```

Returns `204 No Content` when nothing is detected (same FR-16 contract as
`/detect`). `box` is `[x0,y0,x1,y1]` normalized to `[0,1]` and clamped.

```bash
curl -F image=@photo.jpg -F 'prompts=["cabinet","refrigerator"]' \
  localhost:8000/instance-masks
# → {"instances":[{"label":"cabinet","mask":"iVBOR..."}],"static_mask":"iVBOR..."}
```

`POST /reverse` (multipart, field `video`): accepts an MP4 and returns the
time-reversed MP4 (`video/mp4`), same fps. Uses the static ffmpeg binary shipped
by `imageio[ffmpeg]` (no system dependency). It is a transient local transform
(like detection) — the caller re-uploads the result to fal, this service stores
nothing.

```bash
curl -F video=@exit.mp4 localhost:8000/reverse --output reveal.mp4
```

## Tuning

In `server.py`: `BOX_THRESHOLD` / `TEXT_THRESHOLD` (lower = more, looser
detections). Calibrated live on a kitchen (AMD RX 9060 / gfx1200, ROCm 6.4):
`0.30` → ~23 % coverage (misses upper cabinets), `0.20` → ~60 % (bleeds onto
ceiling/walls), `0.25` = balanced default. Swap `SAM_ID` to
`facebook/sam-vit-large`/`-huge` or Grounding DINO to `-tiny` to trade quality
for speed.

## Verified working

AMD RX 9060 (`gfx1200`, ROCm 6.4 wheels, kernel 6.17, inbox driver) — end-to-end
in the app: upload → local `/detect` → unioned binary mask in the editor. No host
ROCm install or DKMS needed; the `torch==*+rocm6.4` wheel + `render` group access
to `/dev/kfd` is sufficient.
