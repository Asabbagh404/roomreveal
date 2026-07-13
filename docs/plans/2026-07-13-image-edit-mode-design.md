# Design — Mode « Éditer une image » (édition libre itérative)

**Date :** 2026-07-13 · **Statut :** validé (brainstorming) · **Prochaine étape :** Epic 5 + sprint-planning → boucle BMAD par story.

## Contexte & objectif

À l'arrivée sur RoomReveal, l'utilisateur choisit entre deux modes :

1. **Créer la vidéo révélation** — le parcours existant (`upload → mask → emptyRoom → video`), inchangé.
2. **Éditer une image** — un éditeur **itératif** : sur une photo uploadée, dessiner une zone puis **enlever** un objet OU **ajouter** un objet décrit au texte (« pot de fleur » → généré dans la zone). Sortie = image éditée téléchargeable, **pas de vidéo**.

Décisions issues du brainstorming :
- **Éditeur itératif** : chaque retouche produit une nouvelle image qui devient la base de la suivante.
- **Choix d'abord, puis upload** : modes strictement séparés ; `mode` est un état au-dessus du parcours.
- **Modèle « add » = `flux-pro/v1/fill`** (masqué + prompt : régénère l'intérieur de la zone, laisse le reste pixel-identique), swappable et bench-gated (flux-fill vs `bria/genfill`) avant verrouillage.
- **Modèle « remove » = `bria/eraser`** (déjà câblé pour l'Inpainting).

Contraintes du spine respectées : single reducer (AD-3), fal confiné à `src/pipeline/` (AD-5), orchestration dans `effects.ts` (AD-12), masque verbatim binaire blanc=régénéré (AD-7/AD-13), espace pixel canonique ≤1024 (AR-PIXELS), taxonomie `StepError` (AD-8), `WaitPhase` (AD-14), invalidation/epoch (AD-11), rétention 24h (AD-9).

## Approche retenue (A)

Le mode « édition » est un mini-parcours parallèle qui **réutilise au maximum l'existant** : éditeur de masque canvas, upload/normalisation, `download-file`, pattern adaptateur pipeline, `StepError`, overlays attente/erreur.

### 1. Machine à états & flux

Nouvel axe `mode` dans le reducer unique :

- `mode: "reveal" | "edit" | undefined`.
  - `undefined` → **écran d'accueil** (`HomeScene`) — nouvel état initial.
  - `SELECT_MODE(mode)` → fixe `mode`, `step: "upload"`.
- Mode `reveal` : parcours actuel intact (zéro régression).
- Mode `edit` : `upload → editor`, l'étape `editor` **boucle**.

Champ d'édition itérative :
- `editBase: { url?: string; blob?: Blob; width?: number; height?: number }` — image de travail courante. Départ = photo uploadée (blob) ; après chaque retouche = URL fal du résultat (déjà hébergée → pas de ré-upload).
- Le masque **réutilise `maskDraft`** (buffer binaire canonique existant).

Boucle d'une retouche : dessiner zone → **Enlever** / **Ajouter** (+texte) → « Appliquer » → le résultat **remplace** `editBase`, `maskDraft` se vide, `epoch++` → recommencer. Téléchargement à tout moment.

Différence-clé avec `reveal` : en édition le pipeline se déclenche sur **action utilisateur** (« Appliquer »), pas sur l'entrée d'étape. Retry = re-clic « Appliquer » (`CLEAR_ERROR` ne fait que masquer la bannière).

### 2. Pipeline & modèles

`src/pipeline/edit.ts` (calqué sur `inpaint.ts`), type partagé `EditResult { image: string }` :
- `editRemove(imageUrl, maskUrl, {signal, onPhase})` → `bria/eraser` (`{image_url, mask_url, mask_type:"manual"}`, sortie `data.image.url`) → `{image}`.
- `editAdd(imageUrl, maskUrl, prompt, {signal, onPhase})` → `flux-pro/v1/fill` (`{image_url, mask_url, prompt}`, sortie `data.images[0].url`) → `{image}`.

Motif adaptateur canonique : `AbortController` chaîné, `timeoutPromise → makeStepError`, `Promise.race`, `onQueueUpdate → onPhase`, header rétention 24h, throw-on-empty.

`config.ts` : `MODELS.editAdd = "fal-ai/flux-pro/v1/fill"` (swappable, bench-gated) ; `editRemove` réutilise `MODELS.inpaint`. `TIMEOUTS_MS.editAdd` (~90s). `FAL_ALLOWED_ENDPOINTS` : réajout flux-fill (`/**` + exact). `index.ts` exporte `editRemove`/`editAdd`/`EditResult`. `@fal-ai/client` reste confiné à `src/pipeline/` (AD-5).

### 3. Composants & UI

- **`HomeScene`** (`mode === undefined`) : deux cartes (surface-carte, ring bordure→or au survol) « Créer la vidéo révélation » → `SELECT_MODE("reveal")` / « Éditer une image » → `SELECT_MODE("edit")`. Le titre display actuel migre dans la carte reveal.
- **`MaskCanvas`** : extraction du cœur de `mask-surface.tsx` (pinceau/gomme, zoom, pan, undo/redo, buffer binaire) avec **source de fond paramétrable** — consommé par `MaskSurface` (reveal, fond = photo) et `EditorSurface` (edit, fond = `editBase`). Non-régression reveal couverte par les tests existants.
- **`EditorSurface`** (étape `editor`, boucle) : `MaskCanvas` sur `editBase` ; bascule **Enlever / Ajouter** (champ texte si Ajouter) ; bouton d'or unique **« Appliquer »** (désactivé si masque vide ou add sans texte) ; secondaires **« Télécharger l'image »** (`download-file`) et **« Nouvelle image »** (ghost, confirm si non téléchargé, `RESET_EDIT` → upload en gardant `mode:"edit"`) ; indicateur « Retouche n° X ».
- **Routeur (`parcours-scene.tsx`)** : `undefined` → `HomeScene` ; `edit` → `UploadZone` puis `EditorSurface` ; `reveal` → 4 surfaces actuelles. `beforeunload` dès qu'on a quitté accueil/upload. `Stepper` adaptatif (4 étapes reveal / indicateur simple edit).

### 4. Flux de données d'une retouche & erreurs

`runEdit(state, dispatch, { operation, prompt?, signal, isStale })` dans `effects.ts` (AD-12), gardes `dead()` avant chaque dispatch :
1. **Upload paresseux** — si `editBase.url` absent, `uploadArtifact(blob)` → `EDIT_BASE_UPLOADED { url }`. Sinon pas de ré-upload.
2. **Masque** — `encodeMaskPng(maskDraft)` → `uploadArtifact` → `maskUrl`.
3. **Appel** — `add ? editAdd(url, maskUrl, prompt) : editRemove(url, maskUrl)`, `onPhase → SET_WAIT_PHASE`.
4. **Succès** — `EDIT_APPLIED { image: newUrl }` : `editBase = { url: newUrl }`, vide `maskDraft`, `epoch++`.
5. **Mesure dims** — `EditorSurface` charge la nouvelle URL dans `<img>` ; à `onLoad`, `naturalWidth/Height` → `EDIT_BASE_MEASURED { width, height }` qui fixe l'espace canonique et initialise un `maskDraft` vierge.

**Erreurs (AD-8)** : nouveau step `edit` (add et remove partagent l'étape UX), message FR, `PIPELINE_STEP_TO_PARCOURS.edit = "editor"`. `SET_ERROR` coupe le wait ; `CLEAR_ERROR` masque ; l'utilisateur re-clique « Appliquer ». `editBase`/`maskDraft` intacts derrière la bannière.

**Invalidation** : `SELECT_MODE` et `RESET_EDIT` repartent proprement (`epoch++`, `editBase`/`maskDraft` remis à zéro).

### 5. Tests

- `reducer.test.ts` : `SELECT_MODE`, `EDIT_BASE_UPLOADED`, `EDIT_APPLIED`, `EDIT_BASE_MEASURED`, `RESET_EDIT` (reducer pur).
- `edit.test.ts` (nouveau) : `editAdd`/`editRemove` — succès, timeout→StepError, abort, throw-on-empty.
- `effects.test.ts` : suite `runEdit` — upload paresseux (1ʳᵉ vs Nᵉ), remove vs add(+prompt), gardes stale/abort, SET_ERROR step `edit`.
- `config.test.ts` : `editAdd` dans MODELS/TIMEOUTS/allowlist.
- `mask-canvas` : non-régression reveal + source de fond paramétrable.
- Live (Playwright + FAL_KEY) : accueil→édition→upload→enlever→ajouter « pot de fleur »→télécharger, 0 erreur. Bench flux-fill vs `bria/genfill` avant verrouillage.

## Découpage BMAD — Epic 5 « Édition d'image libre »

- **5.1** Écran d'accueil + axe `mode` (SELECT_MODE, HomeScene, routeur, stepper adaptatif) — aucune IA.
- **5.2** Refactor `MaskCanvas` (extraction fond-paramétrable, non-régression reveal).
- **5.3** Étape `editor` + **Enlever** (bria eraser, boucle itérative, EDIT_APPLIED/MEASURED, runEdit).
- **5.4** **Ajouter** (bascule + texte → flux-fill `editAdd`) + bench-gate du modèle.
- **5.5** Téléchargement image + « Nouvelle image » (RESET_EDIT) + garde beforeunload.

Chaque story : create-story → dev TDD → revue adverse 3 couches → triage → done → commit → live-verify.

## Ce qu'on ne fait pas (YAGNI)
- Pas d'historique non-destructif / calques (Photoshop-lite).
- Pas de passerelle édition→vidéo en v1 (modes séparés).
- Pas de modèle maskless pour l'ajout ciblé (perd le contrôle spatial).
