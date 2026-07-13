# Design — Sélection d'objet au clic (mode Édition)

**Date :** 2026-07-13
**Statut :** approuvé → Story 5.6 (Epic 5 rouvre)

## Problème

Dans l'éditeur libre (Epic 5), sélectionner un objet à retirer se fait aujourd'hui
uniquement au pinceau — fastidieux pour un objet aux contours complexes. On veut
**un clic = l'objet entier sélectionné au pixel près**.

## Décision technique : SAM en mode point-prompt

Ce n'est **pas** un nouveau type de modèle. SAM (déjà dans la pile, `MODELS.detect`)
a deux modes : *text-prompt* (« détecte tous les meubles », usage actuel) et
**point-prompt** (un point `{x, y}` → le masque de l'objet sous ce point). Le
clic-pour-sélectionner est la seconde. Pas de modèle panoptique séparé (plus lourd,
moins précis pour ce cas d'usage).

Décisions produit (brainstorming 2026-07-13) :
- **Backend :** piloté par le `DETECT_BACKEND` existant (même infra SAM) — `fal` par
  défaut (`fal-ai/sam2/image`), `local` optionnel (route point-prompt ajoutée au
  serveur Grounded-SAM). Une seule config, pas de sprawl.
- **Interaction :** **additif / union**. Chaque clic ajoute l'objet au masque courant ;
  on enchaîne les clics (plusieurs objets), on corrige au pinceau/gomme, puis « Enlever ».
- **Portée :** enrichit surtout « Enlever » (on clique un objet existant). « Ajouter »
  n'a rien à cliquer (l'objet n'existe pas) — on continue d'y dessiner la zone au pinceau.
- **Pas de refinement +/- en v1** (YAGNI — la gomme corrige les débordements).

## Architecture

Respecte la colonne vertébrale : AR-LAYERS (composants → état → pipeline, lib feuille),
AD-3 (réducteur pur), AD-5/AR-PIPELINE (fal seulement dans `src/pipeline/`),
AD-7 (masque binaire blanc = actif, autorité), AD-8 (taxonomie StepError),
AD-9 (rétention 24 h), AD-12 (`effects.ts` seul orchestrateur, gardes `dead()`),
AD-13 (masque à double vie), AR-PIXELS (canonique ≤ 1024 px).

### Pipeline (nouveau, miroir de `detect.ts`)

- `MODELS.pointSegment = "fal-ai/sam2/image"` (rôle nouveau).
- `TIMEOUTS_MS.pointSegment` (~60 s) ; allowlist proxy += sam2 (`/**` + exact).
- `src/pipeline/point-segment.ts` : adaptateur `pointSegment(imageUrl, {x, y}, {signal, onPhase})`
  → un masque (blanc = objet). Squelette identique à `detect.ts` : AbortController
  chaîné, `timeoutPromise` → `makeStepError("pointSegment", true)`, `Promise.race`,
  `onQueueUpdate → onPhase`, header 24 h, throw-on-empty. `fal` : coords en pixels image ;
  `local` : POST au serveur Grounded-SAM avec le point. `PointSegmentResult { mask: string }`
  (pipeline/types.ts) ; export index.ts.
- `PipelineStep` += `"pointSegment"` ; `PIPELINE_STEP_TO_PARCOURS.pointSegment = "editor"` ;
  message FR dans `step-error.ts`.

### État & effets

- Action `POINT_SEGMENT_APPLIED { mask: string }` — mais l'union pixel se fait AVANT le
  dispatch : `effects.ts` décode le masque renvoyé (offscreen canvas, `getImageData`,
  redimensionné aux dims canoniques), l'OR pixel-à-pixel (`max(a, b)`) dans une copie de
  `maskDraft.buffer`, puis dispatch `SET_MASK_BUFFER` avec le nouveau buffer (réutilise
  l'action existante — le réducteur reste pur, le décodage canvas est un effet). Immuable.
- `runPointSegment(state, dispatch, {x, y, signal, isStale})` dans `effects.ts` :
  lazy-upload de l'editBase (comme `runEdit`), appel `pointSegment`, décodage + union,
  `SET_MASK_BUFFER` / `SET_ERROR("pointSegment")`. Gardes `dead() = aborted || isStale`.

### UI

- **`MaskCanvas`** gagne un mode outil « Sélection » (`StrokeMode` étendu, ou prop
  `tools` limitant les outils selon le contexte). En mode Sélection, `onPointerDown`
  n'entre pas dans la logique de peinture : il convertit le clic en point buffer
  (`screenToBuffer`, déjà utilisé) et appelle une nouvelle prop `onPointSelect(bufferPoint)`.
  Le pinceau/gomme/undo/zoom/pan restent inchangés.
- **`editor-surface`** : le toggle outil expose Pinceau / Gomme / Sélection ; en mode
  reveal, `MaskSurface` ne passe pas l'outil Sélection (feature edit-only).
  `onPointSelect` → AbortController + epochRef → `runPointSegment`. Un clic pendant un
  appel en cours est ignoré (flag `selecting`).

### Loader signature (remplace le spinner générique)

Idée validée : **un point qui pulse pendant l'appel, puis un pulse qui englobe l'objet
à la réponse.**

- **Pendant l'appel SAM (~1-2 s) :** au point cliqué (coord. écran), un **disque doré
  qui pulse** — anneaux concentriques radiant vers l'extérieur (CSS `@keyframes` :
  `scale` + `opacity` en boucle, couleur `--color-or`). Overlay `pointer-events-none`
  positionné en absolu, pas de re-render (via ref, comme le curseur pinceau).
- **À la réponse :** un **pulse unique qui « révèle » l'objet** — la région nouvellement
  ajoutée fait un flash d'opacité/glow qui se propage depuis le point cliqué vers les
  bords de l'objet, puis retombe sur l'overlay rose standard (opacité 45 %). Version
  réalisable : dessiner la nouvelle région sur un canvas temporaire, animer une opacité
  1 → 0.45 + un `drop-shadow` doré qui décroît (~450 ms), puis laisser l'effet overlay
  redessiner le buffer canonique. *(Tracé de contour animé = stretch, non bloquant.)*
- En cas d'erreur : le point pulsant vire brièvement au rouge puis disparaît ; bannière
  d'erreur standard (`step-error` « pointSegment »).

## Ce qu'on ne fait pas

- Pas de modèle panoptique / « reconnaissance de blocs » séparé (SAM point-prompt suffit).
- Pas de points positifs/négatifs (+/-) en v1.
- Le clic n'est pas branché sur « Ajouter » (rien à segmenter).
- Pas de nouvelle action réducteur pour l'union (réutilise `SET_MASK_BUFFER` ; union en effet).

## Fichiers concernés

- `src/pipeline/config.ts` — `MODELS.pointSegment`, `TIMEOUTS_MS`, allowlist.
- `src/pipeline/point-segment.ts` (nouveau) + `types.ts` + `index.ts`.
- `src/state/step-error.ts`, `src/state/types.ts` — `PipelineStep` += pointSegment.
- `src/state/effects.ts` — `runPointSegment` + décodage/union masque.
- `src/components/mask-canvas.tsx` — outil Sélection + `onPointSelect`.
- `src/components/editor-surface.tsx` — toggle outil, wiring, loader signature.
- `local-detect/server.py` — route point-prompt (backend local).
- Tests : `point-segment.test.ts`, `effects.test.ts` (runPointSegment), `mask-canvas.test.tsx`
  (outil Sélection émet onPointSelect), `config.test.ts`, `editor-surface.test.tsx`.

## Réutilisation (déjà en place)

- Adaptateur : `src/pipeline/detect.ts` (squelette à copier).
- Conversion clic → buffer : `screenToBuffer` (`src/lib/mask-tools.ts`).
- Union / décodage masque : pattern overlay de `mask-canvas.tsx` (`createImageData`, boucle pixels).
- Swap backend : `DETECT_BACKEND` (`config.ts`).
- Loader positionné par ref sans re-render : curseur pinceau de `mask-canvas.tsx`.

## Vérification (bout en bout)

1. `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
2. Run live (vraie `FAL_KEY`) sur une photo : mode Édition → outil Sélection → clic sur
   un objet → masque de l'objet apparaît (loader pulsant puis pulse d'englobement) →
   second clic sur un autre objet → les deux s'unionnent → « Enlever » → objets retirés.
3. 0 erreur console ; appel sam2 visible dans l'onglet réseau ; coût/latence constatés.
4. Discipline BMAD : Story 5.6, revue adverse avant `done`, commit + live-verify.
