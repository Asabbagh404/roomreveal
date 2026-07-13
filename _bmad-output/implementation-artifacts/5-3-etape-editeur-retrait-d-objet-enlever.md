---
baseline_commit: f2ef354
---

# Story 5.3: Étape Éditeur & retrait d'objet (Enlever)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur en mode édition,
I want dessiner une zone sur ma photo et en effacer le contenu,
so that je retire un objet indésirable et j'itère sur le résultat.

## Acceptance Criteria

1. **Given** le mode `edit` et une photo uploadée (step `editor`), **When** l'étape s'affiche, **Then** l'image de travail (`editBase`, au départ la photo normalisée) est présentée avec `MaskCanvas` par-dessus (fond = image de travail, `backgroundAlt="Image de travail"`), et une action d'or unique « Appliquer » **désactivée tant que le masque est vide** (`isBufferEmpty`).
2. **Given** une zone dessinée et l'opération « Enlever », **When** l'utilisateur clique « Appliquer », **Then** `runEdit` (dans `effects.ts`, AD-12) upload paresseusement l'image de travail si nécessaire (`EDIT_BASE_UPLOADED`), encode le masque verbatim (`encodeMaskPng`, blanc=effacé — AD-7), appelle `editRemove` (bria eraser) et le Panneau d'attente affiche les phases nommées (queued→generating→finalizing, AD-14).
3. **Given** un retrait réussi, **When** le résultat revient, **Then** `EDIT_APPLIED` remplace `editBase` par la nouvelle image (URL fal), vide le masque et incrémente l'epoch ; l'`EditorSurface` mesure les dimensions réelles de la nouvelle image (`EDIT_BASE_MEASURED`) et un masque vierge canonique est ré-établi (via `SET_MASK_BUFFER`), prêt pour la retouche suivante (boucle itérative, AD-11). L'image affichée est bien le résultat effacé.
4. **Given** une erreur pendant le retrait, **When** l'appel échoue ou expire, **Then** un `StepError` de step `edit` est levé (AD-8), le Bandeau d'erreur s'affiche avec message FR, `CLEAR_ERROR` le masque, et `editBase`/le masque restent intacts (retry = re-clic « Appliquer », **pas** de re-tir automatique à l'entrée d'étape).
5. **Given** plusieurs retouches enchaînées, **When** chaque « Appliquer » réussit, **Then** chaque résultat devient la base de la suivante **sans ré-upload** (l'URL fal du résultat est réutilisée comme `image_url` de l'itération d'après), et un indicateur léger « Retouche n° X » reflète le nombre d'éditions appliquées.

## Tasks / Subtasks

- [x] **Task 1 — État `editBase` + actions reducer (AC: 1, 3, 5)**
  - [x] `types.ts` : `EditBase = { url?: string; blob?: Blob; width?: number; height?: number }` ; champ optionnel `editBase?: EditBase` sur `Generation`.
  - [x] Reducer actions :
    - `{ type: "EDIT_START" }` — sur entrée éditeur : si `step==="editor" && editBase===undefined && originalPhoto!==undefined`, pose `editBase = { blob: photo.blob, url: photo.falUrl, width: photo.width, height: photo.height }` **et** un shell `maskDraft = { detectedMaskUrl: null, buffer: undefined }`. No-op sinon.
    - `{ type: "EDIT_BASE_UPLOADED"; url }` — memoize `editBase.url` (parité `PHOTO_UPLOADED`). No-op si `editBase===undefined`.
    - `{ type: "EDIT_APPLIED"; image }` — `editBase = { url: image }` (dims effacées, à re-mesurer), `maskDraft = { detectedMaskUrl: null, buffer: undefined }`, `epoch+1`, `waitPhase/error = undefined`. Garde : no-op si `step!=="editor"`.
    - `{ type: "EDIT_BASE_MEASURED"; width; height }` — `editBase = { ...editBase, width, height }`. No-op si `editBase===undefined`.
  - [x] `RESET`/`SELECT_MODE` doivent laisser `editBase` à `undefined` (déjà le cas : `{...initialGeneration, mode}` n'a pas d'editBase). Vérifier qu'aucune autre branche ne le porte par mégarde.
  - [x] Tests reducer (RED→GREEN) : EDIT_START (seed depuis photo + shell mask ; no-op hors editor/sans photo) ; EDIT_BASE_UPLOADED ; EDIT_APPLIED (remplace base, vide mask, epoch+1, no-op hors editor) ; EDIT_BASE_MEASURED ; `SET_MASK_BUFFER` fonctionne sur le shell edit.
- [x] **Task 2 — Adaptateur `editRemove` + taxonomie `edit` (AC: 2, 4)**
  - [x] `pipeline/types.ts` : `EditResult { image: string }`.
  - [x] `pipeline/edit.ts` (nouveau) : `editRemove(imageUrl, maskUrl, { signal, onPhase }): Promise<EditResult>` — **calqué verbatim sur `inpaint.ts`** (controller chaîné, timeout→`makeStepError("edit")`, `Promise.race`, header 24h, `onQueueUpdate→onPhase`, throw-on-empty). Input `{ image_url, mask_url, mask_type: "manual" }` sur `MODELS.inpaint` (bria eraser, déjà autorisé). Sortie `data.image.url` → `{ image }`.
  - [x] `pipeline/config.ts` : `TIMEOUTS_MS.edit = 60_000` (bria est rapide, comme inpaint). Pas de nouveau `MODELS` (réutilise `inpaint`) ni d'allowlist (bria déjà listé). *(Le rôle `editAdd`/flux-fill arrive en 5.4.)*
  - [x] `pipeline/index.ts` : exporter `editRemove` + `EditResult`.
  - [x] `state/types.ts` : ajouter `"edit"` à `PipelineStep` et `PIPELINE_STEP_TO_PARCOURS.edit = "editor"`.
  - [x] `state/step-error.ts` : ajouter le message FR `edit` (ex. « La retouche n'a pas abouti. Votre image est conservée — réessayez. ») dans `STEP_MESSAGES` ; ajouter `"edit"` à la garde `isStepError` (actuellement hardcodée detect/inpaint/video).
  - [x] Tests `edit.test.ts` (calqués sur `inpaint.test.ts`) : succès (image url), timeout→StepError("edit"), abort, throw-on-empty.
- [x] **Task 3 — Effet `runEdit` (AC: 2, 3, 4, 5)**
  - [x] `effects.ts` : `runEdit(state, dispatch, { operation, prompt?, signal, isStale })` où `operation: "remove"` (5.3 ; `"add"` en 5.4). Motif `runInpaint` :
    - `editBase = state.editBase`, `buffer = state.maskDraft?.buffer` ; return si `editBase===undefined || buffer===undefined || isBufferEmpty(buffer)`.
    - `dead = signal.aborted || isStale()` ; `onPhase → SET_WAIT_PHASE` gardé.
    - upload paresseux : si `editBase.url===undefined` → `SET_WAIT_PHASE uploading` → `uploadArtifact(editBase.blob)` → (dead?) → `EDIT_BASE_UPLOADED { url }`.
    - `png = encodeMaskPng(buffer)` (dead?) → `maskUrl = uploadArtifact(png)` (dead?).
    - `result = await editRemove(imageUrl, maskUrl, { signal, onPhase })` (dead? drop).
    - `EDIT_APPLIED { image: result.image }`.
    - catch → (dead? return) `SET_ERROR` `isStepError(err) ? err : makeStepError("edit", true)`.
  - [x] Tests `effects.test.ts` (suite `runEdit`) : mock `editRemove`/`uploadArtifact`/`encodeMaskPng` ; upload paresseux (1ʳᵉ retouche avec blob vs Nᵉ avec url déjà présente = pas de ré-upload) ; succès → EDIT_APPLIED ; échec → SET_ERROR step `edit` ; gardes stale + abort (drop sans dispatch).
- [x] **Task 4 — `EditorSurface` réel (AC: 1, 3, 5)**
  - [x] Remplacer le placeholder `editor-surface.tsx` par l'éditeur itératif :
    - Effet d'entrée : si `state.editBase===undefined` → `dispatch(EDIT_START)`.
    - Effet de seeding masque (miroir de `MaskSurface`) : si `maskDraft?.buffer===undefined && editBase?.width` connus → `dispatch(SET_MASK_BUFFER, createBlankBuffer(w,h))`.
    - Fond : `editBase.url ?? usePhotoObjectUrl(editBase.blob)` (URL fal directe pour un résultat, objectURL pour le blob uploadé).
    - `<MaskCanvas backgroundUrl={bg} width={editBase.width??0} height={editBase.height??0} buffer={buffer} epoch={state.epoch} onCommit={(b)=>dispatch(SET_MASK_BUFFER,b)} backgroundAlt="Image de travail" />` (placeholder cadre si dims/fond pas prêts).
    - Mesure des dimensions du résultat : quand `editBase.url` défini et `editBase.width===undefined`, charger l'image (`new Image()` dans un effet, guardé alive) → `dispatch(EDIT_BASE_MEASURED, {width:naturalWidth, height:naturalHeight})`.
    - Action d'or **« Appliquer »** (`GenerationButton`, subtext « 30 s à 1 min » ou équivalent) → `runEdit(state, dispatch, { operation: "remove", signal, isStale })` via un `useRef(AbortController)` + `epochRef` (motif runInpaint) ; désactivée si `buffer` vide (`isBufferEmpty`) ou pendant l'application (`applying` state + ref anti-réentrée).
    - Indicateur léger « Retouche n° X » (compteur local incrémenté sur EDIT_APPLIED, ou dérivé). PAS de « Télécharger » / « Nouvelle image » (Story 5.5).
  - [x] `parcours-scene.tsx` : route `mode==="edit" && step==="editor"` → `<EditorSurface />` (déjà en place depuis 5.1 ; retirer le placeholder).
- [x] **Task 5 — Vérification & non-régression (AC: tous)**
  - [x] `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
  - [x] Live-verify (Playwright, :3000, FAL_KEY) : accueil → « Éditer une image » → upload cuisine → dessiner une zone sur un objet → « Appliquer » → attente → **objet effacé** dans l'image de travail → dessiner une 2ᵉ zone → « Appliquer » → 2ᵉ retrait sur le résultat précédent (pas de ré-upload, réseau le confirme) → « Retouche n° 2 ». 0 erreur console.

## Dev Notes

### Portée & décision de découpe
5.3 = **le retrait masqué itératif** en mode édition. L'**ajout** (bascule Enlever/Ajouter + champ texte → flux-fill) est **5.4** ; le **téléchargement + « Nouvelle image »** est **5.5**. Donc en 5.3 : bouton unique « Appliquer » = Enlever ; sortie de l'éditeur = « Photo » du stepper edit (retour upload, déjà câblé en 5.1) ou refresh. `runEdit` prend déjà un paramètre `operation` pour que 5.4 n'ajoute qu'une branche `"add"`.

### Boucle d'état (le point délicat — le suivre exactement)
1. (5.1) `SELECT_MODE("edit")` → upload ; `PHOTO_NORMALIZED` (mode edit) → `originalPhoto` + `step:"editor"`, `maskDraft:undefined`.
2. `EditorSurface` monte → `EDIT_START` : `editBase` seedé depuis `originalPhoto` (dims déjà connues à l'upload) + shell `maskDraft{detectedMaskUrl:null, buffer:undefined}`.
3. Effet seeding : `maskDraft.buffer===undefined && editBase.width` connu → `SET_MASK_BUFFER(createBlankBuffer(w,h))` (le shell rend le guard `maskDraft!==undefined` de SET_MASK_BUFFER satisfait — cf. reducer).
4. L'utilisateur peint (MaskCanvas → onCommit → SET_MASK_BUFFER) puis « Appliquer » → `runEdit` (upload paresseux editBase si pas d'url, encode+upload mask, editRemove) → `EDIT_APPLIED{image}`.
5. `EDIT_APPLIED` : `editBase={url:image}` (dims effacées), `maskDraft` shell remis (buffer undefined), `epoch+1`.
6. `<img>` de mesure : `editBase.url` défini + `width` undefined → mesure `naturalWidth/Height` → `EDIT_BASE_MEASURED{w,h}`.
7. Effet seeding (re) : buffer undefined + dims connues → `SET_MASK_BUFFER(blank)`. Retour à l'étape 4.

**Pourquoi un shell maskDraft** : `SET_MASK_BUFFER` no-op si `maskDraft===undefined` (reducer, AD-13). En reveal, `DETECT_SUCCEEDED` crée le shell ; en edit, `EDIT_START`/`EDIT_APPLIED` le créent — le composant seed ensuite le buffer vierge, exactement comme le seeding reveal.

### État actuel des fichiers touchés (UPDATE)
- **`src/state/reducer.ts`** — `PHOTO_NORMALIZED` (mode-aware depuis 5.1) pose déjà `step:"editor"` en edit ; `SET_MASK_BUFFER` exige `maskDraft!==undefined` ; `RESET`/`SELECT_MODE` = `{...initialGeneration, mode}`. **Changement** : + 4 actions edit ; **à préserver** : toutes les branches reveal + les gardes existantes.
- **`src/state/types.ts`** — `Generation` (+ `editBase?`), `PipelineStep` (+ `"edit"`), `PIPELINE_STEP_TO_PARCOURS` (+ `edit:"editor"`). `"editor"` est déjà dans `Step` (5.1). **À préserver** : `STEP_ORDER` inchangé (editor hors ordre).
- **`src/state/step-error.ts`** — `STEP_MESSAGES` (+ `edit`), `isStepError` garde hardcodée detect/inpaint/video → **ajouter `edit`** (sinon un `StepError("edit")` renvoyé par l'adaptateur ne serait pas reconnu et deviendrait un `makeStepError` générique — fonctionnel mais imprécis ; l'ajouter est correct).
- **`src/state/effects.ts`** — motif `runInpaint`/`runAutoEmptyRoom` à copier pour `runEdit`. `uploadArtifact`, `encodeMaskPng`, `isBufferEmpty` déjà importés/dispo.
- **`src/pipeline/inpaint.ts`** — modèle **exact** de l'adaptateur `editRemove` (bria eraser, mêmes input/output/erreurs). Ne PAS réécrire la logique, copier.
- **`src/components/editor-surface.tsx`** — placeholder (5.1) à REMPLACER. **`src/components/parcours-scene.tsx`** route déjà `editor`→`EditorSurface`.
- **`src/components/mask-surface.tsx`** — patron du seeding + du wiring MaskCanvas + du bouton d'action (à imiter, PAS à modifier). **`use-photo-object-url.ts`** réutilisé pour le fond blob.

### Contraintes d'architecture (spine)
- **AD-12 / AR-LAYERS** : tout appel pipeline dans `runEdit` (effects), jamais dans le composant. Gardes `dead()` avant chaque dispatch.
- **AD-7** : masque verbatim binaire (`encodeMaskPng`), blanc = zone effacée par bria. Dims du masque = dims de `editBase` (canonique).
- **AD-11 / epoch** : `EDIT_APPLIED` bumpe l'epoch (une itération est une nouvelle « attempt » — invalide un run en vol) ; l'`AbortController`/`epochRef` du composant abandonne un run superseded.
- **AD-8** : erreurs via `StepError("edit")` → SET_ERROR → ErrorBanner (overlay ParcoursScene, mode-agnostique) ; retry = re-clic (pas d'effet d'entrée auto).
- **AD-9** : header rétention 24h dans l'adaptateur ; résultat fal jamais re-hébergé (réutilisé tel quel comme base suivante).
- **AD-2** : le résultat bria préserve les dims (canonique) ; on **mesure** quand même (`EDIT_BASE_MEASURED`) au lieu de supposer.
- UI FR / code EN. Dark-only. `GenerationButton` pour l'action d'or (UX-DR13).

### Réutilisation (ne PAS réinventer)
- `MaskCanvas` (5.2) pour tout le dessin. `encodeMaskPng`, `createBlankBuffer`, `isBufferEmpty`, `uploadArtifact`, `usePhotoObjectUrl`, `GenerationButton`, `WaitPanel`/`ErrorBanner` (overlays déjà branchés). Adaptateur bria via `MODELS.inpaint`.

### Risque
Boucle d'état + mesure des dims = la partie fragile → couvrir par tests reducer/effects et **valider en live** l'enchaînement de 2 retouches (surtout : pas de ré-upload à la 2ᵉ, dims re-mesurées, masque re-vierge).

### Project Structure Notes
- Nouveaux : `pipeline/edit.ts` (+ `edit.test.ts`). `editor-surface.tsx` réécrit. Modifs : reducer(+test), types (state+pipeline), step-error, effects(+test), config, index.
- Pas de nouvelle dépendance ni de nouveau modèle fal.

### References
- [Source: docs/plans/2026-07-13-image-edit-mode-design.md#4-flux-de-données-dune-retouche--erreurs]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3]
- [Source: src/state/effects.ts (runInpaint/runAutoEmptyRoom — motif runEdit)]
- [Source: src/pipeline/inpaint.ts (adaptateur bria — modèle editRemove)]
- [Source: src/components/mask-surface.tsx (seeding + wiring MaskCanvas — patron EditorSurface)]
- [Source: src/state/reducer.ts (PHOTO_NORMALIZED mode-aware, SET_MASK_BUFFER guard, INPAINT_SUCCEEDED)]
- [Source: 5.1 (mode/editor step, stepper « Photo » = escape), 5.2 (MaskCanvas contrôlé)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- RED : 4 tests reducer (EDIT_* ) échouent avant impl → GREEN après types+reducer (45 reducer tests).
- Adaptateur+effet : editRemove 6 tests, runEdit 6 tests, tous verts au 1ᵉʳ jet.
- `tsc`/`build` : ajout de `"edit"` à `PipelineStep` a cassé 2 `Record<PipelineStep,string>` — `error-banner.RETRY_LABEL` (+ « Réessayer la retouche ») et `step-error.STEP_MESSAGES` (déjà fait) → corrigés.
- `lint` : (1) `operation` non lu dans runEdit (5.4 le lira) → sorti du destructuring, gardé dans le type ; (2) `react-hooks/refs` sur `entryEpochRef.current` lu en render → remplacé par `useState(state.epoch)`.
- Test `home-scene` du placeholder editor mis à jour (le placeholder n'existe plus → assert « Appliquer » désactivé sans photo).

### Completion Notes List

- **types.ts** : `EditBase` + `editBase?` sur `Generation` ; `"edit"` dans `PipelineStep` + `PIPELINE_STEP_TO_PARCOURS.edit="editor"`.
- **reducer.ts** : `EDIT_START` (seed editBase depuis originalPhoto + shell maskDraft), `EDIT_BASE_UPLOADED`, `EDIT_APPLIED` (result→editBase, mask reset, epoch+1, no-op hors editor), `EDIT_BASE_MEASURED`. Gardes idempotence/step.
- **pipeline/edit.ts** (nouveau) : `editRemove` (bria via `MODELS.inpaint`, motif inpaint verbatim, `EditResult{image}`, StepError `edit`). `TIMEOUTS_MS.edit=90s`. Export index.
- **step-error.ts** : message FR `edit` + `isStepError` reconnaît `edit`.
- **effects.ts** : `runEdit({operation:"remove"})` — upload paresseux editBase (1ʳᵉ fois), encode+upload mask, editRemove → EDIT_APPLIED ; SET_ERROR `edit` ; gardes dead(). `operation` réservé pour 5.4.
- **editor-surface.tsx** : éditeur itératif réel (remplace placeholder) — EDIT_START à l'entrée, seeding blank mask, mesure dims via `new Image()`, MaskCanvas sur editBase, « Appliquer » (AbortController+epochRef, anti-réentrée), « Retouche n° X ».
- **error-banner.tsx** : label retry `edit`.
- **199 tests** (vs 179 ; +reducer 9, +edit 7, +runEdit 6, home-scene ajusté), tsc/lint/build verts.
- **Live-verify (FAL_KEY)** : Éditer une image → upload → peindre → « Appliquer » → **objet effacé** (résultat fal, mask re-vierge 0px, dims re-mesurées 1024×768, « Retouche n° 1 ») → 2ᵉ zone sur le résultat → « Appliquer » → nouveau résultat (URL ≠ précédente, « Retouche n° 2 »). 0 erreur console. Boucle itérative prouvée.

### File List

- `src/state/types.ts`, `src/state/reducer.ts` (+ `reducer.test.ts`) — modifiés
- `src/state/step-error.ts`, `src/state/effects.ts` (+ `effects.test.ts`) — modifiés
- `src/pipeline/edit.ts` (+ `edit.test.ts`) — **nouveaux**
- `src/pipeline/types.ts`, `src/pipeline/config.ts`, `src/pipeline/index.ts` — modifiés
- `src/components/editor-surface.tsx` (réécrit), `src/components/error-banner.tsx`, `src/components/home-scene.test.tsx` — modifiés

### Change Log

- 2026-07-13 : Story 5.3 créée (create-story). Éditeur itératif « Enlever » : état `editBase` + 4 actions (EDIT_START/EDIT_BASE_UPLOADED/EDIT_APPLIED/EDIT_BASE_MEASURED), adaptateur `editRemove` (bria via MODELS.inpaint) + step `edit`, effet `runEdit(operation:"remove")`, `EditorSurface` réel (MaskCanvas sur editBase, seeding blank, mesure dims, boucle). Ajout/download = 5.4/5.5. Statut → ready-for-dev.
- 2026-07-13 : Story 5.3 implémentée en TDD (5 tasks) + live-verify + revue adverse 3 couches. 199 → **201 tests**, tsc/lint/build verts. 4 correctifs. Statut → review → **done**.

## Senior Developer Review (AI)

**Date :** 2026-07-13 · **Reviewers :** 3 sous-agents adverses (State/Effects correctness, Edge cases, Acceptance & Scope) · **Résultat :** Approuvé après 4 correctifs.

**Verdict :** Acceptance = **APPROVE** — AC1-AC5 tous PASS. Invariants vérifiés sûrs par le reviewer state/effects : boucle itérative sans deadlock/boucle infinie, epoch/staleness correct (dernier `dead()` avant EDIT_APPLIED passe avant le bump), **AC5 no-re-upload** confirmé (URL fal réutilisée, blob absent aux itérations 2+), abort back-nav OK, parité `edit.ts`/`inpaint.ts` ligne à ligne. Scope propre (rien de 5.4/5.5), AR-LAYERS respecté, UI FR/code EN, aucune dép/allowlist nouvelle.

### Correctifs appliqués
- [x] **[Haut — 2 reviewers]** `img.onerror` manquant sur la mesure des dims → une URL résultat injoignable laissait l'éditeur bloqué (dims jamais mesurées → masque jamais seedé → « Appliquer » désactivé à vie). Ajout `onerror → SET_ERROR("edit")` + `img.src=""` en cleanup.
- [x] **[Haut — state reviewer]** `PHOTO_NORMALIZED` ne vidait pas `editBase` → après « Photo » (retour upload) + ré-upload en mode edit, `EDIT_START` no-opait sur l'ancien editBase (ancienne image de travail affichée). Ajout `editBase: undefined` + test de séquence.
- [x] **[Moyen — acceptance]** Test timeout absent de `edit.test.ts` (listé au checklist Task 2) → ajouté (fake timers, 90_001 ms → StepError("edit")).
- [x] **[Bas — acceptance]** `prompt?: string` (concept 5.4) fuitait dans la signature `runEdit` 5.3 → retiré (5.4 élargira l'union `operation`).

### Écartés / Différés (documentés)
- `edit.ts` bare-`catch` re-wrappe le StepError du garde throw-on-empty : **parité intentionnelle avec `inpaint.ts`**, tests verts, aucune régression. Laissé.
- Label bannière « Réessayer la retouche » qui ne fait que `CLEAR_ERROR` : le masque peint est **préservé** (SET_ERROR ne touche pas maskDraft) → re-clic « Appliquer » fonctionne ; cohérent avec l'infra reveal. Laissé.
- `retouchCount` potentiellement négatif : inatteignable (RESET démonte l'EditorSurface). Laissé.
- Divergence doc `TIMEOUTS_MS.edit` (checklist disait 60s, implémenté 90s) : 90s retenu (plus sûr pour bria), noté ici.
