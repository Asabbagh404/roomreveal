---
baseline_commit: 1756365
---

# Story 3.4: « Vider automatiquement » — Pièce vide maskless (Nano Banana) + Masque en retouche

Status: done

## Story

As a utilisateur,
I want vider ma pièce en un clic sans avoir à peindre le masque,
so that j'obtiens une Pièce vide beaucoup plus propre (aucun résidu), le pinceau restant disponible en secours.

## Contexte / Décision

Bench live (2026-07-12/13) sur 2 photos : un édit **maskless** `fal-ai/nano-banana-2/edit` (Gemini) vide la pièce **bien plus proprement** que détection→masque→`bria/eraser` (zéro résidu : ni TV, ni bandeau, ni objets), fiable 2/2, ratio préservé. Décisions utilisateur : **hybride**, avec **un bouton « Vider automatiquement » sur l'étape Masque** (Parcours inchangé). L'auto devient la voie recommandée (action d'or) ; la détection + pinceau + `bria` restent en **option manuelle / retouche**.

Astuce d'archi (réutilisation maximale) : produire la Pièce vide en mode auto = **avancer à l'étape emptyRoom sans masque**, et laisser la surface Pièce vide **brancher sur `mask === undefined` → Nano Banana, sinon → bria** (existant). Aucune nouvelle action reducer d'avance ni de succès : réutilise `CONFIRM_ADVANCE_FROM("emptyRoom")` (avance mask→emptyRoom, borne stricte → conserve mask[undefined]/maskDraft) et `INPAINT_SUCCEEDED { emptyRoomUrl }` (pose emptyRoom).

## Acceptance Criteria

1. **Given** l'étape Masque avec la Photo originale **When** l'utilisateur clique « Vider automatiquement » (bouton d'or) **Then** le Parcours avance à Pièce vide **sans masque**, la couche effectrice appelle `autoEmptyRoom(photoUrl)` via `fal-ai/nano-banana-2/edit` (maskless, prompt « pièce vide » dans `prompts.ts`, référencé par rôle dans `config.ts`, AbortSignal + époque), et l'URL du résultat est stockée dans `generation.emptyRoom` (FR-8, AR-PIPELINE, AR-QUEUE).
2. **Given** la Pièce vide auto générée **When** elle s'affiche **Then** la pièce est vidée de ses meubles (rendu bien plus propre que le masque+eraser), ratio conservé, affichée dans les cartes de comparaison (Story 3.2 inchangée) — *qualité = vérif live*.
3. **Given** l'étape Masque **When** l'utilisateur préfère le contrôle manuel **Then** la détection + pinceau/gomme + « Valider le Masque » (→ `bria/eraser`) restent disponibles (**bouton secondaire**) ; « Vider automatiquement » reste l'unique action d'or (UX-DR13).
4. **Given** une Pièce vide (auto) avec un résidu **When** l'utilisateur revient à l'étape Masque (stepper), peint le résidu et « Valider le Masque » **Then** une passe `bria/eraser` sur ce masque **remplace** la Pièce vide (retouche) — réutilise l'existant (MASK_VALIDATED → runInpaint), aucun code neuf.
5. **Given** un appel auto qui échoue/timeout **Then** `StepError { step: 'inpaint', retryable: true }` → Bandeau d'erreur, relance limitée à l'étape ; aucune erreur fal native (AD-8).

## Tasks / Subtasks

- [x] Task 1 : `src/pipeline/empty-room-auto.ts` (nouveau) — adaptateur maskless (AC: 1, 5)
  - [x] `autoEmptyRoom(photoUrl: string, { signal, onPhase }: AdapterOptions): Promise<InpaintResult>` — squelette `inpaint.ts` (AbortController chaîné, `timeoutPromise` sur `TIMEOUTS_MS.emptyRoomAuto`, race, `run.catch`, `finally`, `onQueueUpdate→onPhase`, header 24h). `fal.subscribe(MODELS.emptyRoomAuto, { input: { image_urls: [photoUrl], prompt: EMPTY_ROOM_AUTO_PROMPT, resolution: "1K" } })`. Sortie `data.images[0].url` → `{ emptyRoom }` ; vide/absent → `throw makeStepError("inpaint", true)` (réutilise la surface d'erreur inpaint) ; `catch` → StepError inpaint. Réutilise `InpaintResult`.
- [x] Task 2 : config + prompt + export (AC: 1)
  - [x] `config.ts` : `MODELS.emptyRoomAuto = "fal-ai/nano-banana-2/edit"` ; `TIMEOUTS_MS.emptyRoomAuto = 120_000` ; ajouter à `FAL_ALLOWED_ENDPOINTS` (`/**` + exact). (Mettre à jour `config.test.ts` si l'assertion allowlist énumère les modèles.)
  - [x] `prompts.ts` : `EMPTY_ROOM_AUTO_PROMPT` = le prompt validé au bench (« Remove ALL furniture, cabinets, appliances, wall-mounted TV, shelves, plants and every object. Show the completely EMPTY room: bare smooth painted walls and bare floor only. Keep the exact same room shape, walls, floor, windows, lighting, camera angle and perspective. »).
  - [x] `index.ts` : exporter `autoEmptyRoom`.
- [x] Task 3 : `src/state/effects.ts` — `runAutoEmptyRoom` (AC: 1, 5)
  - [x] `runAutoEmptyRoom(state, dispatch, { signal, isStale })` : garde `photo = state.originalPhoto` (return si absent). `dead()`, `onPhase`. Upload paresseux de la photo canonique si `falUrl` absent (motif `runInpaint` : SET_WAIT_PHASE "uploading" → uploadArtifact → PHOTO_UPLOADED). `result = await autoEmptyRoom(photoUrl, {signal,onPhase})` → `dead()` → `dispatch(INPAINT_SUCCEEDED { emptyRoomUrl: result.emptyRoom })`. `catch` → `SET_ERROR` (StepError inpaint). SEULE couche pipeline (AR-LAYERS).
- [x] Task 4 : `src/components/empty-room-surface.tsx` — brancher auto vs manuel (AC: 1, 2, 4)
  - [x] Dans l'effet d'entrée : au lieu de toujours `runInpaint`, brancher : **si `state.mask !== undefined` → `runInpaint`** (bria, retouche/manuel) **sinon → `runAutoEmptyRoom`** (Nano Banana, auto). Mêmes gardes (step==="emptyRoom", emptyRoom===undefined, error===undefined) + AbortController + epochRef. Ajouter `runAutoEmptyRoom` à l'import effects.
- [x] Task 5 : `src/components/mask-surface.tsx` — bouton « Vider automatiquement » (AC: 1, 3)
  - [x] Ajouter en **action d'or** un `GenerationButton` « Vider automatiquement » → `dispatch({ type: "CONFIRM_ADVANCE_FROM", step: "emptyRoom" })` (avance mask→emptyRoom **sans** masque ; `mask` reste `undefined` → la surface Pièce vide passera en mode auto). Toujours actif dès qu'une photo est là.
  - [x] Rétrograder « Valider le Masque » de `GenerationButton` (or) → **bouton secondaire** (`Button variant="outline"`), toujours désactivé si `isBufferEmpty` (tooltip inchangé), label busy inchangé. Le reste (canvas, toolbar, no-furniture banner, validation logic) **inchangé**.
- [x] Task 6 : Vérification (AC: 1–5)
  - [x] `npm test` + `tsc` + `lint` + `build` verts. Tests : adaptateur `empty-room-auto.test.ts` (schéma nano-banana : `image_urls`+`prompt`, sortie `images[0].url`, no-image→StepError, phases) ; effects `runAutoEmptyRoom` (upload paresseux, INPAINT_SUCCEEDED, dead, SET_ERROR) ; `config.test` maj.
  - [x] **Live (FAL_KEY)** : upload cuisine → étape Masque → « Vider automatiquement » → WaitPanel « Génération de la Pièce vide… » → Pièce vide **propre** (dims ~ratio canonique) ; requête proxy nano-banana reçoit `image_urls=[photo]` ; comparaison OK ; « Créer ma vidéo » enchaîne (la Pièce vide auto sert de 1re frame FLF — **vérifier que kling accepte** un start ~1195×896 + end 1024×768 même ratio ; sinon ajouter une normalisation aux dims canoniques). **Retouche** : revenir à Masque, peindre, « Valider le Masque » → bria remplace la Pièce vide. Erreur simulée → bandeau. 0 erreur console.

## Dev Notes

### État en place (réutilisé)
- **`empty-room-surface.tsx`** (3.1/3.2/3.3) : effet d'entrée `runInpaint` + cartes de comparaison + « Créer ma vidéo » + « Régénérer ». On ajoute juste la **branche** `mask===undefined ? runAutoEmptyRoom : runInpaint` dans l'effet ; le rendu (comparaison) est inchangé.
- **Reducer** : `CONFIRM_ADVANCE_FROM(step)` (avance + `invalidateDownstream` borne stricte — conserve mask/maskDraft ; sur mask→emptyRoom avec mask absent, on arrive en mode auto) ; `INPAINT_SUCCEEDED { emptyRoomUrl }` (pose emptyRoom, pas d'avance/bump) ; `MASK_VALIDATED` (retouche manuelle → mask + bria). **Aucune nouvelle action.**
- **`inpaint.ts`** = squelette adaptateur ; `runInpaint` = squelette effet ; `InpaintResult { emptyRoom }` réutilisé.
- **Contrat nano-banana** (vérifié fal 2026-07-12) : `image_urls: string[]` (requis), `prompt` (requis), `resolution` (déf "1K", optionnel) ; sortie `{ images: [{url}], description }`. **Ne préserve pas les dims exactes** (ratio oui) → voir « dims FLF ».
- **wait-copy.ts** : `emptyRoom` → « Génération de la Pièce vide… » (déjà OK ; c'est pourquoi l'auto se déclenche **sur l'étape emptyRoom**, pas sur Masque, pour le bon libellé).

### Contraintes d'architecture (spine)
- **AD-5/AR-PIPELINE** : nouvel adaptateur dans `pipeline/`, modèle par rôle, `@fal-ai/client` via `./client`. **AD-8** : échec → StepError (`inpaint` réutilisé — le résultat vit sur la surface Pièce vide, relance = re-génération). **AD-12/AR-LAYERS** : orchestration dans `effects.ts` (garde epoch/abort) ; composants dispatchent des intentions. **AD-9** : header rétention 24 h. [Source: ARCHITECTURE-SPINE.md]
- **AD-2 / dims FLF** : la Pièce vide alimente la 1re frame FLF (Story 4.1) ; l'invariant canonique dit « dims exactes ». Nano Banana renvoie le **même ratio** mais une taille ~1K (ex. 1195×896 pour une 4:3). **À vérifier live** que kling o1 accepte start(~1195×896)+end(1024×768) même ratio (il « préserve le ratio d'entrée » → devrait passer). **Si refus/crop** : ajouter une normalisation aux dims canoniques (fetch→canvas→re-upload, motif `mask-raster`). Déviation documentée à confirmer. [Source: ARCHITECTURE-SPINE.md#AD-2 ; [[inpaint-declutter-quality]]]

### Contraintes UX
- **Une action d'or** (UX-DR13) : « Vider automatiquement ». « Valider le Masque » (manuel) devient secondaire. [Source: EXPERIENCE.md, décision utilisateur 2026-07-13]
- Le pinceau/gomme + détection restent (retouche/contrôle, AC3/AC4). Détection sur entrée : conservée (gratuite en local, alimente le manuel) — [note] pourrait être différée à l'usage manuel plus tard (optimisation, hors périmètre).

### Pièges connus
- **Mode auto = `mask === undefined`** : l'inférence est le pivot. « Vider automatiquement » NE valide PAS de masque (mask reste undefined) → la surface choisit Nano Banana. « Valider le Masque » pose mask → bria. Ne pas casser cette inférence.
- **`CONFIRM_ADVANCE_FROM("emptyRoom")` depuis Masque** : avance sans toucher mask (undefined) ; clears reveal ; epoch+1. Vérifier qu'il n'efface pas `maskDraft` (borne stricte : non).
- **allowlist proxy** : ajouter nano-banana (cause d'échec n°1).
- **dims FLF** : voir ci-dessus — vérifier live avant de conclure.
- **Détection encore lancée** avant le clic auto : WaitPanel « Détection… » brièvement — acceptable (la détection alimente le manuel). Ne pas la supprimer ici.
- **Réutiliser `INPAINT_SUCCEEDED`** (pas de nouvelle action succès) et **`step:"inpaint"`** pour l'erreur (surface Pièce vide) — cohérent avec la taxonomie.

### Testing Requirements
- **Pur (Vitest)** : `empty-room-auto.test.ts` (frontière `./client` mockée) ; `effects.test.ts` +runAutoEmptyRoom (mock `autoEmptyRoom`+`uploadArtifact`) ; `config.test` allowlist. Reducer : aucun changement (réutilise CONFIRM_ADVANCE_FROM/INPAINT_SUCCEEDED déjà testés).
- **Live** : bouton auto, qualité du vidage, dims FLF (kling accepte), retouche manuelle, erreur. Vérif live Playwright + une génération réelle.
- Régression : suites 1.x–4.x vertes.

### Project Structure Notes
- **Nouveaux** : `src/pipeline/empty-room-auto.ts` (+ `.test.ts`).
- **Modifs** : `config.ts` (+ `.test.ts`), `prompts.ts`, `index.ts`, `state/effects.ts` (+ test), `components/empty-room-surface.tsx` (branche auto/manuel), `components/mask-surface.tsx` (bouton or « Vider automatiquement » + « Valider » secondaire).

### References
- [Source: décision utilisateur 2026-07-13 (hybride, bouton auto sur Masque) ; bench déclutter (nano-banana 2/2)]
- [Source: ARCHITECTURE-SPINE.md#AD-2, AD-5, AD-8, AD-9, AD-12, AR-LAYERS]
- [Source: src/pipeline/inpaint.ts, src/state/effects.ts#runInpaint, src/components/empty-room-surface.tsx, mask-surface.tsx ; fal nano-banana-2/edit (schéma vérifié) ; [[inpaint-declutter-quality]]]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

### Completion Notes List

- **`pipeline/empty-room-auto.ts`** (nouveau) : `autoEmptyRoom(photoUrl)` — nano-banana-2/edit maskless (`image_urls:[photo]`, `EMPTY_ROOM_AUTO_PROMPT`, `resolution:"1K"`), motif `inpaint` (abort chaîné, timeout `emptyRoomAuto`=120s, race, header 24h, onQueueUpdate→onPhase). Sortie `images[0].url` → `InpaintResult{emptyRoom}` (réutilisé) ; échec → `StepError("inpaint")`.
- **config** : `MODELS.emptyRoomAuto`, `TIMEOUTS_MS.emptyRoomAuto`, allowlist (+ config.test). **prompts** : `EMPTY_ROOM_AUTO_PROMPT`. **index** : export.
- **`effects.runAutoEmptyRoom`** : upload paresseux photo + `autoEmptyRoom` → `INPAINT_SUCCEEDED` (réutilisé), `SET_ERROR("inpaint")` ; gardes dead()/epoch.
- **`empty-room-surface`** : l'effet d'entrée branche **`mask !== undefined ? runInpaint : runAutoEmptyRoom`** (retiré l'ancien guard `mask===undefined return`).
- **`mask-surface`** : bouton d'or **« Vider automatiquement »** → `CONFIRM_ADVANCE_FROM("emptyRoom")` (avance sans masque → mode auto) ; « Valider le Masque à la main » rétrogradé en secondaire (`Button variant="outline"`). **Aucune nouvelle action reducer** (réutilise CONFIRM_ADVANCE_FROM + INPAINT_SUCCEEDED + MASK_VALIDATED).
- **154 tests verts** (+ adaptateur, runAutoEmptyRoom [dont stale/abort], config). tsc/lint/build OK.

### File List

- `src/pipeline/empty-room-auto.ts` (nouveau) + `.test.ts` (nouveau)
- `src/pipeline/config.ts` (+ `.test.ts`), `src/pipeline/prompts.ts`, `src/pipeline/index.ts`
- `src/state/effects.ts` (+ `.test.ts` — `runAutoEmptyRoom`)
- `src/components/empty-room-surface.tsx` (branche auto/manuel)
- `src/components/mask-surface.tsx` (bouton or « Vider automatiquement » + « Valider » secondaire)

## Change Log

- 2026-07-13 : Story 3.4 créée (create-story) — « Vider automatiquement » (Nano Banana maskless) sur l'étape Masque ; réutilise CONFIRM_ADVANCE_FROM + INPAINT_SUCCEEDED ; surface Pièce vide branche mask===undefined→auto / sinon→bria ; manuel en secours. Statut → in-progress.
- 2026-07-13 : Story 3.4 implémentée + revue adverse (passe unique). ACs 1-5 PASS, 0 CRITICAL/HIGH (les 4 modes — auto/manuel/retouche/régé — vérifiés). 2 correctifs (tests stale/abort runAutoEmptyRoom + commentaire régé). 154 tests, tsc/lint/build verts.
- 2026-07-13 : **Vérif live (FAL_KEY, Playwright)**. Upload cuisine → « Vider automatiquement » → « Génération de la Pièce vide… » → **Pièce vide vraiment vide** (Nano Banana, 1195×896, murs/sol nus, aucun résidu — vs bria qui laissait TV/bandeau/four) → comparaison OK → « Créer ma vidéo » → **kling ACCEPTE les dims non-canoniques** (start 1195×896 + end 1024×768, même ratio 4:3) → Révélation **1660×1244 (4:3, pas de crop), 0 erreur**. **Risque dims FLF levé → aucune normalisation nécessaire.** Statut → **done**.

## Senior Developer Review (AI)

**Date :** 2026-07-13 · **Résultat :** Approuvé après 2 correctifs · **Verdict ACs :** AC1-AC5 PASS. Les 4 modes (auto / manuel / retouche / régé) reposent correctement sur l'inférence `mask === undefined` ; `CONFIRM_ADVANCE_FROM("emptyRoom")` conserve `mask` undefined (borne stricte) ; `runAutoEmptyRoom` calque `runInpaint` (gardes dead(), INPAINT_SUCCEEDED, StepError inpaint) ; adaptateur conforme au contrat nano-banana ; allowlist OK ; UX-DR13 (une action d'or) respectée. Qualité du vidage + dims FLF = vérifiés live.

### Correctifs appliqués
- [x] **[Moyen]** Ajout des tests `runAutoEmptyRoom` **stale-mid-flight** + **signal aborté** (parité avec `runInpaint`) — sinon un retrait de garde `dead()` passerait inaperçu.
- [x] **[Bas]** Commentaire « Régénérer » corrigé : l'effet re-tire `runInpaint` **ou** `runAutoEmptyRoom` selon `state.mask` (n'était pas à jour).

### Écartés / Différés
- **Dims FLF non canoniques** (risque produit signalé) : **levé en live** — kling accepte start 1195×896 + end 1024×768 (même ratio) → 1660×1244 sans crop. Aucune normalisation ajoutée (inutile). Si un futur modèle vidéo était plus strict, ajouter un resize canonique (motif mask-raster).
- Assertion test « boom » faible (Bas) : cohérente avec `inpaint.test` ; laissée telle quelle.
- `PHOTO_UPLOADED` non dispatché si dead() juste après l'upload (Bas) : motif pré-existant `runInpaint`, mémoïsation optimiste, non-régression.
- Détection encore lancée avant le clic auto (Bas) : gratuite en local, alimente le manuel ; optimisation différée.
