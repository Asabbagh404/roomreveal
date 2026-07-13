---
baseline_commit: c4d2dfd
---

# Story 5.6: Sélection d'objet au clic (SAM point-prompt)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur en mode édition,
I want cliquer sur un objet pour le sélectionner entièrement au lieu de le peindre au pinceau,
so that je masque un objet aux contours complexes en un clic, sans travail manuel fastidieux.

## Acceptance Criteria

1. **Given** l'étape `editor` avec une image de travail, **When** l'utilisateur active l'outil « Sélection » et clique sur un objet, **Then** le point cliqué (converti en coordonnées buffer canoniques via `screenToBuffer`) est envoyé à SAM en mode point-prompt (`MODELS.pointSegment`, backend piloté par `DETECT_BACKEND` : `fal-ai/sam2/image` par défaut, serveur Grounded-SAM local en option) et le masque de l'objet est renvoyé (blanc = objet, AD-7). L'appel suit le pattern adaptateur (`src/pipeline/point-segment.ts`, miroir de `detect.ts` : AbortController chaîné, timeout→`StepError("pointSegment")` AD-8, header 24 h AD-9) orchestré par `effects.ts` (`runPointSegment`, gardes `dead()` AD-12).
2. **Given** un masque déjà présent sur le canvas (clics précédents ou pinceau), **When** un nouveau clic renvoie un masque d'objet, **Then** le masque renvoyé est décodé côté client et **unionné pixel-à-pixel** (`max`) dans `maskDraft.buffer` (via `SET_MASK_BUFFER`, immuable, AD-13) — les objets s'accumulent — puis reste ajustable au pinceau/gomme et applicable via « Enlever ».
3. **Given** un appel de segmentation en cours, **When** l'utilisateur clique à nouveau, **Then** le second clic est ignoré jusqu'à la résolution ; un **loader signature** s'affiche : un point doré qui pulse au point cliqué pendant l'appel, puis un pulse unique qui englobe l'objet à la réponse (retombe sur l'overlay rose standard). En cas d'échec : bannière d'erreur standard (`step-error` « pointSegment ») et aucun changement de masque.
4. **Given** le mode reveal (parcours vidéo), **When** l'éditeur de masque `MaskSurface` est monté, **Then** l'outil « Sélection » n'est pas exposé (feature edit-only) — pinceau/gomme/undo/zoom/pan inchangés dans les deux modes.

## Tasks / Subtasks

- [ ] **Task 1 — Pipeline : adaptateur point-segment (AC: 1)**
  - [ ] `config.ts` : `MODELS.pointSegment = "fal-ai/sam2/image"` ; `TIMEOUTS_MS.pointSegment = 60_000` ; `FAL_ALLOWED_ENDPOINTS += pointSegment/** + exact`. Mettre à jour le commentaire d'en-tête (liste des modèles).
  - [ ] `pipeline/types.ts` : `PointSegmentResult { mask: string }`.
  - [ ] `pipeline/point-segment.ts` (nouveau) : `pointSegment(imageUrl, { x, y }, { signal, onPhase })` — squelette **identique à `detect.ts`** (controller chaîné au signal, `timeoutPromise` → `makeStepError("pointSegment", true)`, `Promise.race`, `run.catch(()=>{})`, header 24 h, `onQueueUpdate → onPhase`). Input fal (ASSOMPTION à calibrer live, comme `detect.ts` pour sam-3) : `{ image_url, prompts: [{ x, y, label: 1 }] }` (label 1 = point positif). Sortie : un masque binaire — mapping dans **une seule fonction** (`composePointResult`), throw-on-empty → `makeStepError("pointSegment", true)`.
  - [ ] `pipeline/point-segment-local.ts` (nouveau, optionnel backend) : `pointSegmentLocal(blob, { x, y }, opts)` — POST au serveur Grounded-SAM avec le point (miroir `detect-local.ts`). N'est appelé que si `DETECT_BACKEND === "local"`.
  - [ ] `pipeline/index.ts` : export `pointSegment`, `pointSegmentLocal`, `PointSegmentResult`.
- [ ] **Task 2 — Taxonomie d'erreur (AC: 1, 3)**
  - [ ] `state/types.ts` : `PipelineStep` += `"pointSegment"` ; `PIPELINE_STEP_TO_PARCOURS.pointSegment = "editor"`.
  - [ ] `state/step-error.ts` : message FR `pointSegment` + `isStepError` reconnaît `"pointSegment"`.
- [ ] **Task 3 — Décodage + union du masque (AC: 2)**
  - [ ] `lib/mask-decode.ts` (nouveau, feuille) : `decodeMaskToBuffer(url|blob, width, height): Promise<MaskBuffer>` — charge l'image sur un offscreen canvas aux dims canoniques, lit `getImageData`, seuille (alpha ou luma > 127 → 255, sinon 0). Pur DOM (browser), pas d'import state/pipeline.
  - [ ] `lib/mask-buffer.ts` : `unionBuffers(a, b): MaskBuffer` — nouveau buffer, `data[i] = max(a[i], b[i])` (immuable, dims identiques requises). Test unitaire (jsdom-safe, pas de canvas).
- [ ] **Task 4 — Effet runPointSegment (AC: 1, 2, 3)**
  - [ ] `state/effects.ts` : `runPointSegment(state, dispatch, { x, y, signal, isStale })` — miroir `runEdit` : lazy-upload `editBase` (EDIT_BASE_UPLOADED), appel `pointSegment`/`pointSegmentLocal` selon `DETECT_BACKEND`, `decodeMaskToBuffer` aux dims de `editBase`, `unionBuffers` avec `maskDraft.buffer` courant, `dispatch SET_MASK_BUFFER`. Erreur → `SET_ERROR(step "pointSegment")`. Gardes `dead()` autour de chaque await. **Pas de nouvelle action reducer** (réutilise `SET_MASK_BUFFER`).
- [ ] **Task 5 — Outil « Sélection » dans MaskCanvas (AC: 1, 3, 4)**
  - [ ] `mask-buffer.ts` (ou `mask-tools.ts`) : `type MaskTool = StrokeMode | "select"`.
  - [ ] `mask-canvas.tsx` : props `selectable?: boolean` (défaut false) + `onPointSelect?: (p: Point) => void` + `pending?: { screenX; screenY } | null` (pour le loader). État outil élargi à `MaskTool`. En mode `select` : `onPointerDown` convertit le clic (`toBufferPoint`) et appelle `onPointSelect`, **sans** entrer dans la logique de peinture (pas de `paintingRef`, pas de `strokeFeedback`). Raccourci `s`. Curseur pinceau masqué en mode select.
  - [ ] `mask-toolbar.tsx` : bouton « Sélection » (icône `MousePointerClick`/`SquareDashedMousePointer`) rendu **seulement si `selectable`** ; `tool`/`onToolChange` typés `MaskTool`. `MaskSurface` (reveal) ne passe pas `selectable` → outil absent (AC4). Slider taille masqué/désactivé en mode select (sans effet).
- [ ] **Task 6 — Loader signature + wiring editor-surface (AC: 1, 2, 3)**
  - [ ] `editor-surface.tsx` : passe `selectable` + `onPointSelect` à MaskCanvas. `onPointSelect` : si un appel est déjà en cours (`selectingRef`), ignorer ; sinon AbortController + `epochRef` → `runPointSegment`. État `selecting` + coord écran du clic pour le loader.
  - [ ] Loader (nouveau petit composant `select-pulse.tsx` ou inline) : pendant `selecting`, disque doré pulsant au point cliqué (CSS `@keyframes` `scale`+`opacity`, `--color-or`, `pointer-events-none`, positionné en absolu). À la réponse : pulse unique d'englobement (flash opacité 1→0.45 + drop-shadow doré décroissant ~450 ms) puis retour overlay rose standard. Erreur → point vire rouge bref puis disparaît. Keyframes dans `globals.css`.
- [ ] **Task 7 — Backend local (AC: 1, optionnel)**
  - [ ] `local-detect/server.py` : route/branche point-prompt (point → SAM sans Grounding DINO) renvoyant un masque. Documenté ; testé seulement si le serveur local tourne (sinon `fal` par défaut couvre la vérif live).
- [ ] **Task 8 — Tests (AC: 1, 2, 3, 4)**
  - [ ] `point-segment.test.ts` : mock `./client` fal — succès mappe le masque ; timeout → StepError retryable ; sortie vide → throw.
  - [ ] `mask-buffer.test.ts` : `unionBuffers` (max pixel, immuable, no-op si vide).
  - [ ] `effects.test.ts` : `runPointSegment` — union dans le buffer + SET_MASK_BUFFER ; lazy upload ; `dead()` (aborted/stale) ne dispatch pas ; erreur → SET_ERROR pointSegment. (Mock `mask-decode`.)
  - [ ] `mask-canvas.test.tsx` : en mode select un clic émet `onPointSelect` (pas de commit de peinture) ; `selectable=false` → pas d'outil Sélection.
  - [ ] `config.test.ts` : allowlist contient sam2 (`/**` + exact) ; `step-error` : message pointSegment + `isStepError` OK.
  - [ ] Ne pas casser les 216 tests existants.
- [ ] **Task 9 — Vérification & non-régression (AC: tous)**
  - [ ] `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
  - [ ] Live-verify (Playwright, :3000, `FAL_KEY`) : Édition → upload → outil Sélection → **clic sur un objet → son masque apparaît** (loader pulsant → pulse d'englobement) → **second clic sur un autre objet → union** → pinceau/gomme ajuste → « Enlever » → objets retirés. Vérifier l'appel sam2 dans l'onglet réseau, 0 erreur console, coût/latence. **Calibrer le mapping du schéma sam2** ici (ASSOMPTION Task 1). Vérifier mode reveal : outil Sélection absent.

## Dev Notes

### Portée & décision
5.6 = **accélérateur de sélection** pour le « Enlever » (Epic 5). SAM en **mode point-prompt** (un clic → masque de l'objet), pas un nouveau type de modèle : c'est la seconde interface de SAM (le text-prompt sert déjà à `detect`). Additif (les clics s'unionnent). N'ajoute rien à « Ajouter » (rien à segmenter). Réutilise massivement l'existant (adaptateur, MaskCanvas, effects, DETECT_BACKEND). Voir `docs/plans/2026-07-13-click-to-select-design.md`.

### Réutilisations décisives (ne PAS réinventer)
- **`detect.ts`** : squelette exact de l'adaptateur (controller chaîné, timeout→StepError, `Promise.race`, `run.catch`, header 24 h, `onQueueUpdate`). Copier, changer modèle + input + mapping sortie. Comme sam-3, le schéma exact de sam2 est une **ASSOMPTION calibrée live** — isoler le mapping dans une fonction unique.
- **`runEdit` / `effects.ts`** : motif lazy-upload `editBase` (EDIT_BASE_UPLOADED, réutilisé si déjà en cours), `dead()` autour de chaque await, SET_ERROR sur `isStepError`.
- **`DETECT_BACKEND`** (`config.ts`) : même knob que la détection — `runPointSegment` branche `fal` vs `local` comme `runDetect`.
- **`screenToBuffer`** (`mask-tools.ts`) : conversion clic écran → buffer canonique, déjà utilisée par `toBufferPoint` dans MaskCanvas.
- **Overlay pixel** de `mask-canvas.tsx` (`createImageData` + boucle) : pattern pour `decodeMaskToBuffer`.
- **`SET_MASK_BUFFER`** : action existante — le masque unionné y passe (pas de nouvelle action ; l'union/décodage sont des **effets**, le reducer reste pur, AD-3).
- **Curseur pinceau positionné par ref sans re-render** (`cursorRef`) : même technique pour le point de loader.

### État actuel des fichiers touchés (UPDATE)
- **`src/components/mask-canvas.tsx`** — aujourd'hui : brush/eraser (`StrokeMode`), zoom/pan/undo/redo, overlay rose, `onCommit(next)`. **Changement** : outil `select` optionnel (`selectable` + `onPointSelect` + `pending`), branche `onPointerDown` en mode select (pas de peinture). **À préserver** : toute la peinture/zoom/pan/undo, `onCommit`, l'API existante (props ajoutées **optionnelles** — MaskSurface reveal inchangé).
- **`src/components/mask-toolbar.tsx`** — aujourd'hui : brush/eraser + slider + undo/redo. **Changement** : bouton Sélection conditionnel (`selectable`), type `MaskTool`. **À préserver** : layout, raccourcis, a11y.
- **`src/components/editor-surface.tsx`** — aujourd'hui : boucle 5.3/5.4/5.5 (toggle, prompt, apply, download, nouvelle image). **Changement** : `selectable`/`onPointSelect` + état `selecting` + loader. **À préserver** : toute la boucle existante, effets (EDIT_START, seed, mesure dims), download/reset.
- **`src/state/effects.ts`** — ajouter `runPointSegment` (ne pas toucher les autres run*).
- **`src/state/types.ts` + `step-error.ts`** — étendre `PipelineStep` (couvrir `STEP_MESSAGES: Record<PipelineStep,…>` sinon tsc casse, comme l'ajout de `edit`).
- **`src/components/mask-surface.tsx`** (reveal) — vérifier qu'il ne passe PAS `selectable` (AC4). Aucun changement fonctionnel attendu.

### Contraintes d'architecture (spine)
- **AD-5/AR-PIPELINE** : `@fal-ai/client` seulement via `client.ts` ; l'adaptateur vit dans `src/pipeline/`. `import-boundary.test` doit rester vert.
- **AD-7** : masque binaire (0/255), blanc = actif ; le décodage seuille strictement, pas d'anti-aliasing conservé. `screenToBuffer` = transform d'affichage, buffer jamais rééchantillonné.
- **AD-8** : échec/timeout/abort → `StepError("pointSegment", retryable)`. **AD-9** : header rétention 24 h sur l'appel fal. **AD-12** : `effects.ts` seul appelant pipeline, gardes `dead() = aborted || isStale`. **AD-13** : masque à double vie, buffer immuable (union = nouveau buffer). **AR-PIXELS** : dims canoniques ≤ 1024.
- **AR-LAYERS** : composant → dispatch/lit l'état ; décodage canvas = util lib feuille ; pipeline seulement dans effects. UI FR / code EN.

### Testing standards
- Vitest + Testing Library. Mocker `./client` (fal) dans `point-segment.test.ts` ; mocker `@/lib/mask-decode` dans `effects.test.ts` (canvas non fiable en jsdom). `unionBuffers` testé purement (Uint8Array). MaskCanvas : simuler pointerdown en mode select, asserter `onPointSelect` appelé et **aucun** `onCommit`. Le vrai masque sam2 + le loader = live-verify.

### Project Structure Notes
- Nouveaux : `pipeline/point-segment.ts`, `pipeline/point-segment-local.ts`, `lib/mask-decode.ts`, (option) `components/select-pulse.tsx`. Étendus : config, types (pipeline+state), step-error, effects, index, mask-buffer, mask-canvas, mask-toolbar, editor-surface, globals.css. Aucune nouvelle dépendance npm (SAM2 via fal ; décodage via canvas natif).

### References
- [Source: docs/plans/2026-07-13-click-to-select-design.md]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6]
- [Source: src/pipeline/detect.ts (squelette adaptateur, ASSOMPTION schéma calibrée live)]
- [Source: src/state/effects.ts (runEdit — lazy upload + dead())]
- [Source: src/pipeline/config.ts (DETECT_BACKEND, MODELS, allowlist)]
- [Source: src/lib/mask-tools.ts (screenToBuffer) + mask-buffer.ts (MaskBuffer, isBufferEmpty)]
- [Source: src/components/mask-canvas.tsx + mask-toolbar.tsx (outil, overlay)]
- [Source: 5.3/5.4/5.5 done (EditorSurface, editBase, boucle)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-07-13 : Story 5.6 créée (create-story). Sélection d'objet au clic (SAM point-prompt, additif, backend DETECT_BACKEND). Réutilise l'adaptateur detect, MaskCanvas, effects, screenToBuffer. Loader signature (point pulsant → pulse d'englobement). Statut → ready-for-dev.
