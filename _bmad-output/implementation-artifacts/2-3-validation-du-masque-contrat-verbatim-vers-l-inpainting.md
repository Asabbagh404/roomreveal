---
baseline_commit: 2729b3e
---

# Story 2.3: Validation du Masque — contrat verbatim vers l'Inpainting

Status: done

## Story

As a utilisateur,
I want valider mon Masque et être certain qu'il sera respecté tel quel,
so that les zones que j'ai choisies — et seulement celles-là — disparaîtront.

## Acceptance Criteria

1. **Given** un Masque brouillon comportant au moins une zone peinte **When** l'utilisateur clique « Valider le Masque » **Then** le brouillon est encodé en PNG binaire (blanc = zone à effacer, dimensions strictement canoniques, sans anti-aliasing), uploadé via `uploadArtifact`, et son URL stockée dans `generation.mask` (FR-7, AR-MASK-DUAL, AR-MASK-VERBATIM) **And** le Parcours avance vers l'étape Pièce vide.
2. **Given** un Masque validé **When** il est transmis à l'aval **Then** il part sans aucune altération — ni dilation, ni blur, ni morphologie, ni re-détection (FR-7, AR-MASK-VERBATIM) **And** une zone retirée à la gomme n'est jamais effacée par l'aval, une zone ajoutée au pinceau l'est toujours (FR-7, SM-2).
3. **Given** un Masque entièrement vide **When** l'utilisateur regarde le bouton de validation **Then** « Valider le Masque » est désactivé avec le tooltip « Peignez au moins une zone » (UX-DR13).

## Tasks / Subtasks

- [x] Task 1 : Reducer — action `MASK_VALIDATED` (AC: 1)
  - [x] `src/state/reducer.ts` : action `MASK_VALIDATED { maskUrl: string }` — pose `generation.mask = maskUrl`, avance `step = "emptyRoom"`, `epoch + 1`, `...invalidateDownstream("mask")` (efface emptyRoom + reveal, **préserve** `maskDraft` pour un retour arrière lossless FR-15/AD-13), `waitPhase`/`error` remis à `undefined`. Reducer PUR. Tests reducer.
- [x] Task 2 : `src/lib/mask-encode.ts` — encodage PNG binaire (AC: 1, 2)
  - [x] `encodeMaskPng(buffer: MaskBuffer): Promise<Blob>` : canvas aux **dimensions strictement canoniques** du buffer ; chaque pixel `255 → blanc opaque (255,255,255,255)` (= zone à effacer, AD-7), `0 → noir opaque (0,0,0,255)` ; `canvas.toBlob("image/png")`. Écriture directe des pixels (via `ImageData`), **aucun anti-aliasing**, aucune dilation/blur/morphologie (AR-MASK-VERBATIM). Browser-only (canvas) → `[LIVE-VERIFY]`, non testable jsdom.
- [x] Task 3 : `src/state/effects.ts` — `runValidateMask` (AC: 1)
  - [x] `runValidateMask(state, dispatch, { signal, isStale }): Promise<void>` (AD-12) : si `maskDraft?.buffer` absent ou `isBufferEmpty(buffer)` → return (garde-fou, ne devrait pas arriver car bouton désactivé). Sinon : `encodeMaskPng(buffer)` → `uploadArtifact(png)` → garde `dead() = signal.aborted || isStale()` avant dispatch → `dispatch(MASK_VALIDATED { maskUrl })`. **Lève** l'erreur au lieu de `SET_ERROR` (pas dans la taxonomie detect/inpaint/video ; erreur gérée en local par le composant — voir Task 4). SEULE couche appelant `pipeline/` (AR-LAYERS). Tests effects (frontière `encodeMaskPng`/`uploadArtifact` mockée).
  - [x] `src/pipeline/index.ts` : le composant ne doit PAS importer `uploadArtifact` directement (AR-LAYERS) — l'orchestration reste dans `effects.ts`.
- [x] Task 4 : `src/components/mask-surface.tsx` — bouton « Valider le Masque » (AC: 1, 3)
  - [x] Sous la barre d'outils, rendre `<GenerationButton>` (composant Epic 1, UX-DR13) « Valider le Masque ». **Désactivé** quand pas de buffer OU `isBufferEmpty(buffer)`, avec `tooltip="Peignez au moins une zone"` (AC3, UX-DR13).
  - [x] `onClick` : état local `busy`/`error` (motif `upload-zone.tsx`). `busy` → label « Envoi du Masque… », bouton désactivé. Appelle `runValidateMask(state, dispatch, { signal, isStale })` avec un `AbortController` local + `epochRef` ; `catch` → message inline « L'envoi du Masque a échoué. Réessayez. » ; `finally` busy=false. Le succès (MASK_VALIDATED) démonte la surface Masque (le Parcours passe à Pièce vide).
  - [x] Ne PAS afficher le Panneau d'attente global pour cet upload (rapide) — busy au niveau du bouton (l'upload d'un petit PNG binaire est bref ; réserver le WaitPanel aux jobs fal longs).
- [x] Task 5 : Vérification (AC: 1, 2, 3)
  - [x] `npm test` + `tsc` + `lint` + `build` verts.
  - [x] Live (FAL_KEY) : peindre → « Valider le Masque » actif → clic → PNG uploadé, `generation.mask` posé, Parcours → Pièce vide (placeholder Epic 3) ; masque vide → bouton désactivé + tooltip ; **round-trip verbatim** : le PNG décodé == le buffer (mêmes dims canoniques, binaire, aucune altération) — vérifier via `getImageData` que blanc↔255 et noir↔0 exactement.

## Dev Notes

### État en place (NE PAS recréer)

- **Domaine** : `state/types.ts` (`Generation.mask?: string`, `MaskDraft.buffer?: MaskBuffer`, `MaskBuffer` défini dans `lib/mask-buffer.ts`). `reducer.ts` (`SET_MASK_BUFFER`, `CONFIRM_ADVANCE_FROM {step}` = avance VERS `step` + `invalidateDownstream`, `GO_TO_STEP` back-only, `PHOTO_NORMALIZED`…). `generation-context.tsx`.
- **lib** : `mask-buffer.ts` expose **déjà `isBufferEmpty(buffer)`** (à réutiliser pour AC3) + `MaskBuffer`. `mask-raster.ts` (browser canvas, motif à suivre pour `mask-encode`). `resize.ts` (dims canoniques dans `OriginalPhoto.width/height`).
- **pipeline** : `uploadArtifact(blob) → URL fal` (client.ts) ; `detect`/`detectLocal` (backend enfichable). `uploadArtifact` fonctionne quel que soit `DETECT_BACKEND` (le masque validé part toujours vers fal storage pour l'inpaint Epic 3, AD-5).
- **effects** : `runDetect`/`runValidateMask` cohabitent ; motif AD-12 (AbortController + `isStale` + `dead()`), reducer pur.
- **UI** : `GenerationButton` (disabled + tooltip, UX-DR13) **existe déjà** — c'est le bouton à utiliser. `mask-surface.tsx` (éditeur canvas Story 2.2) — y ajouter le bouton. `parcours-scene.tsx` rend la surface + overlays.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-7 / AR-MASK-VERBATIM** : le Masque validé part **sans aucune altération**. PNG binaire, **blanc = zone à effacer**, dimensions **strictement** égales à l'image canonique, aucun anti-aliasing, jamais de binarisation différée. « Ce que l'utilisateur voit est exactement ce qui part. » [Source: ARCHITECTURE-SPINE.md#AD-7]
- **AD-13 / AR-MASK-DUAL** : deux formes. (1) brouillon = buffer dans le reducer (survit au démontage). (2) **artefact validé = PNG uploadé (`uploadArtifact`), URL dans `generation.mask`**. « Valider le Masque » = **encoder le brouillon → uploader → stocker l'URL**. Le retour arrière ré-affiche le brouillon depuis le reducer (donc **préserver `maskDraft`** à la validation), jamais depuis l'URL fal. [Source: ARCHITECTURE-SPINE.md#AD-13]
- **AD-11** : `MASK_VALIDATED` avance et invalide le downstream (emptyRoom/reveal) + bump epoch, comme `CONFIRM_ADVANCE_FROM`. [Source: ARCHITECTURE-SPINE.md#AD-11]
- **AR-LAYERS** : `components/ → state/ → pipeline/`. Le composant **dispatche une intention** ; `effects.ts` appelle `uploadArtifact`. Le composant n'importe jamais `pipeline/` pour les appels. `lib/` feuille. [Source: 2-1/2-2 Dev Notes]
- **AD-12** : orchestration async (encode+upload) dans `effects.ts`, garde d'époque/abort ; reducer pur. [Source: ARCHITECTURE-SPINE.md#AD-12]

### Contraintes UX (font foi)

- **Bouton de Génération (UX-DR13)** : action primaire or unique de la surface, désactivée jusqu'à la précondition remplie, tooltip explicatif. Masque vide → « Valider le Masque » désactivé, tooltip **« Peignez au moins une zone »**. [Source: EXPERIENCE.md, DESIGN.md ; epics.md#Story 2.3 AC3]
- Pas de jargon. L'avance vers Pièce vide est silencieuse (le Stepper passe à 3/4).

### Pièges connus

- **Verbatim** : encoder le buffer tel quel. NE PAS lisser, dilater, flouter, re-seuiller. `255→blanc`, `0→noir`, opaques. Le round-trip PNG doit être exact (AC2, SM-2).
- **Dimensions** : le PNG doit être **exactement** aux dims du buffer (= dims canoniques `OriginalPhoto.width/height`). Ne pas rééchantillonner.
- **Préserver `maskDraft`** à la validation (retour arrière lossless, AD-13/FR-15). `invalidateDownstream("mask")` le fait (efface emptyRoom/reveal, garde maskDraft+mask).
- **AR-LAYERS** : ne pas importer `uploadArtifact` dans le composant. Passer par `effects.runValidateMask`.
- **Erreur d'upload** : hors taxonomie StepError (detect/inpaint/video). Gérer en **inline local** dans le composant (pas l'ErrorBanner global, dont la relance detect effacerait les edits). Upload rapide → busy sur le bouton, pas le WaitPanel.
- **Bouton désactivé = pas d'appel** : `isBufferEmpty` garde l'UI ET `runValidateMask` garde le domaine (double garde).
- **Backend local** : `uploadArtifact` (fal storage) reste utilisé pour le masque validé même en `DETECT_BACKEND=local` — l'inpaint (Epic 3) est fal et consomme `generation.mask`. OK, FAL_KEY/proxy toujours présents.

### Testing Requirements

- **Pur (Vitest)** : reducer `MASK_VALIDATED` (mask posé, step=emptyRoom, epoch+1, downstream invalidé, maskDraft préservé) ; effects `runValidateMask` (encode+upload mockés → dispatch ; buffer vide/absent → no-op ; dead → pas de dispatch ; erreur → throw). `isBufferEmpty` déjà couvert.
- **Non testable jsdom → live** : `mask-encode` (canvas), rendu du bouton, round-trip verbatim. Vérif live FAL_KEY.
- Régression : suite 2.1/2.2 verte ; `tsc`/`lint`/`build`.

### Project Structure Notes

- Nouveau `lib/mask-encode.ts` (browser). Modifs : `state/reducer.ts` (+ test), `state/effects.ts` (+ test), `components/mask-surface.tsx`. Pas de nouveau composant (réutilise `GenerationButton`).

### References

- [Source: epics.md#Story 2.3]
- [Source: ARCHITECTURE-SPINE.md#AD-7, AD-11, AD-12, AD-13, AR-LAYERS]
- [Source: prd.md#FR-7, FR-15, SM-2 ; EXPERIENCE.md/DESIGN.md#Bouton de Génération, UX-DR13]
- [Source: 2-2-...#Dev Notes (buffer binaire, isBufferEmpty), mask-raster (motif canvas)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- ESLint scannait `local-detect/.venv/` (JS vendored par torch) → 1 erreur `no-this-alias`. Ajout de `local-detect/**` aux `globalIgnores` d'`eslint.config.mjs`.
- Mock `encodeMaskPng` dans effects.test : `vi.fn()` non typé (comme detect/uploadArtifact) pour accepter le spread `(...a)` sans erreur TS ni param inutilisé.

### Completion Notes List

- **Reducer `MASK_VALIDATED`** (pur) : pose `generation.mask`, avance `step="emptyRoom"`, `epoch+1`, `invalidateDownstream("mask")` (efface emptyRoom/reveal, **préserve `maskDraft`** → retour arrière lossless AD-13/FR-15).
- **`lib/mask-encode.ts`** : `encodeMaskPng` — PNG binaire **verbatim** via `ImageData` direct (255→blanc opaque = à effacer, 0→noir), dims canoniques exactes, aucun anti-aliasing/traitement (AD-7). Browser-only → vérif live.
- **`effects.runValidateMask`** (AD-12) : encode → `uploadArtifact` → garde `dead()` → `MASK_VALIDATED`. **Lève** en cas d'échec (hors taxonomie StepError) — le composant gère en inline. Double garde buffer vide/absent. Orchestration pipeline en `effects` (AR-LAYERS ; le composant n'appelle jamais `uploadArtifact`).
- **`mask-surface.tsx`** : `GenerationButton` « Valider le Masque » (composant Epic 1, UX-DR13), désactivé si `isBufferEmpty` avec tooltip « Peignez au moins une zone » ; état local `busy`/`error` (motif upload-zone), label « Envoi du Masque… », erreur inline « L'envoi du Masque a échoué. Réessayez. ».
- `uploadArtifact` (fal storage) reste utilisé même en `DETECT_BACKEND=local` (le masque validé alimente l'inpaint fal, Epic 3).
- **107 tests verts** (+10), `tsc`/`lint`/`build` OK. Vérif live (FAL_KEY) en attente.

### File List

- `src/lib/mask-encode.ts` (nouveau)
- `src/state/reducer.ts` `.test.ts` (modifié — `MASK_VALIDATED`)
- `src/state/effects.ts` `.test.ts` (modifié — `runValidateMask`, imports encode/isBufferEmpty)
- `src/components/mask-surface.tsx` (modifié — bouton Valider)
- `eslint.config.mjs` (modifié — ignore `local-detect/**`)

## Change Log

- 2026-07-11 : Story 2.3 implémentée — `MASK_VALIDATED` reducer, `mask-encode` (PNG verbatim AD-7), `runValidateMask` effect, bouton « Valider le Masque » (UX-DR13). 107 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-11 : Revue adversariale (Blind + Edge/Acceptance). 0 CRITICAL, ACs tous PASS. 6 correctifs. 109 tests verts.
- 2026-07-11 : **Vérification live (FAL_KEY, Playwright, backend détection local GPU)**. Peinture → « Valider le Masque » actif (masque 1024×768 binaire, `nonBinary=0`) → clic → upload fal (proxy 200 + PUT PNG 200) → **avance à « Étape 3 sur 4 : Pièce vide »**, surface Masque démontée, 0 erreur console. **Round-trip verbatim prouvé** (encode→PNG→décode sur buffer connu de 60 000 px : `mismatch=0`, `nonBinary=0`) → AD-7 tenu. Statut → **done**. 109 tests, tsc/lint/build verts.

## Senior Developer Review (AI)

**Date :** 2026-07-11 · **Résultat :** Approuvé après corrections (vérif live en attente) · **Verdict ACs :** AC1/AC2/AC3 PASS statiquement ; round-trip verbatim + rendu bouton vérifiables en navigateur.

### Action Items corrigés

- [x] **[Moyen]** Retour arrière (`GO_TO_STEP`, ne bumpe pas l'epoch) pendant l'upload de validation pouvait quand même déclencher `MASK_VALIDATED` et forcer l'avance → `MASK_VALIDATED` **no-op si `step !== "mask"`** (Edge B6).
- [x] **[Haut]** `handleValidate` passait le `state` de closure (buffer potentiellement en retard d'une frame) → lit le buffer **live via `bufferRef`** + snapshot ; garde de ré-entrée **synchrone via `validatingRef`** (double-fire programmatique) (Blind H1/H2).
- [x] **[Moyen]** `dead()` vérifié seulement après l'upload → ajout d'un `dead()` **avant `uploadArtifact`** (évite un aller-retour fal inutile sur nav-away ; cohérent avec `runDetect`) (Blind).
- [x] **[Moyen/Bas]** `encodeMaskPng` : docstring corrigée (pass-through binaire, pas de traitement), mapping `>= 128` (robuste à toute valeur parasite → strictement 0/255), **assertion `data.length === width*height`** (contrat verbatim) (Blind + Edge B3).
- [x] **[Moyen]** Commentaire explicite sur la borne **stricte `<`** de `invalidateDownstream` (ne pas relâcher en `<=` sous peine de perdre `maskDraft`) (Blind).
- [x] **[Bas]** Tests ajoutés : `MASK_VALIDATED` no-op hors étape mask ; re-validation (écrase `mask`, ré-invalide le downstream).

### Écartés / Différés (documentés)

- **`signal` transmis à `encodeMaskPng`** : `toBlob` est < 10 ms et le `dead()` avant upload couvre déjà le gaspillage ; sur-ingénierie écartée.
- **strokeFeedback anti-aliasé** (Story 2.2, non modifié ici) : feedback d'affichage uniquement ; l'encode lit le **buffer binaire**, pas le canvas → AD-7 tenu. À confirmer visuellement en live.
- URL `mask` fal orpheline à la re-validation (non supprimée) : hors périmètre (rétention 24 h AD-9).
