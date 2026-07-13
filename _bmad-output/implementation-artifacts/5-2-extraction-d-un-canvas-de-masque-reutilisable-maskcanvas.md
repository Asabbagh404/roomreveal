---
baseline_commit: a53d335
---

# Story 5.2: Extraction d'un canvas de masque réutilisable (MaskCanvas)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a développeur de RoomReveal,
I want extraire le cœur de l'éditeur de masque en un composant à source de fond paramétrable,
so that le mode reveal et le mode édition partagent la même mécanique de masque sans duplication.

## Acceptance Criteria

1. **Given** le composant `mask-surface.tsx` actuel, **When** on refactore, **Then** un composant `MaskCanvas` encapsule le cœur (pinceau/gomme, taille réglable, zoom molette, pan espace+drag, undo/redo, raccourcis B/E/[/]/Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y, curseur-pinceau, overlay rose `masque-overlay`) avec une **source d'image de fond paramétrable** (AD-7, AD-13). `MaskCanvas` est **contrôlé** : il reçoit `backgroundUrl`, `width`, `height`, `buffer`, `epoch`, `onCommit(next)` et n'accède PAS au reducer/contexte (AR-LAYERS, testable, réutilisable).
2. **Given** le mode `reveal`, **When** l'étape Masque s'affiche après refactor, **Then** le comportement est **identique** à l'existant (fond = photo originale) : détection à l'entrée, seeding du buffer (masque détecté ou blanc), overlay rose 45 %, peinture/gomme, zoom centré curseur, pan, undo/redo, raccourcis, curseur-pinceau, « Vider automatiquement » (or) + « Valider le Masque à la main » (secondaire) + bannière FR-16 — tout inchangé. `MaskSurface` conserve la logique reveal (détection, seeding, validation) et **délègue seulement le canvas** à `MaskCanvas`.
3. **Given** une source de fond arbitraire et des dimensions fournies à `MaskCanvas`, **When** le composant est monté et l'utilisateur peint, **Then** le buffer est dimensionné à l'espace pixel canonique de cette image de fond (AR-PIXELS), la sémantique blanc = zone active reste inchangée (AD-7), et chaque trait/undo/redo appelle `onCommit(next)` avec un nouveau `MaskBuffer` (immutabilité, jamais de mutation en place — AD-13).
4. **Given** l'absence de tests unitaires du canvas de masque aujourd'hui, **When** l'extraction est faite, **Then** des tests `MaskCanvas` couvrent le câblage non-visuel : rendu de l'image de fond (`backgroundUrl`), présence de la toolbar, changement d'outil au clavier (B/E), bornes de brosse ([/]), `onCommit` appelé après un trait synthétique (ou, si le canvas 2D n'est pas disponible en jsdom, la logique de commit testée au niveau approprié), `buffer` undefined = pas de peinture (pas de crash).

## Tasks / Subtasks

- [x] **Task 1 — Créer `MaskCanvas` contrôlé (AC: 1, 3)**
  - [x] `src/components/mask-canvas.tsx` : composant `"use client"` avec props `{ backgroundUrl: string | null; width: number; height: number; buffer: MaskBuffer | undefined; epoch: number; onCommit: (next: MaskBuffer) => void; backgroundAlt?: string }`.
  - [x] Déplacer depuis `mask-surface.tsx`, **verbatim** (mêmes constantes/refs/handlers) : `OVERLAY_RGB`, `DEFAULT_BRUSH`, `ZOOM_STEP` ; l'état UI-local (`tool`, `brushSize`, `zoom`, `pan`, `history`) ; tous les refs (`viewportRef`, `overlayRef`, `cursorRef`, `toolRef`/`brushRef`/`zoomRef`/`panRef`/`historyRef`/`bufferRef` + leurs `useEffect` de sync) ; `drawOverlay` + l'effet de redraw ; `commitBuffer`/`doUndo`/`doRedo` ; l'init d'historique par epoch (`historyEpochRef`) ; `toBufferPoint`/`strokeFeedback`/`updateCursor` ; `onPointerDown/Move`/`endStroke`/`onWheel` ; l'effet clavier + `isEditableTarget` ; le JSX viewport (img fond + canvas overlay + curseur) + `<MaskToolbar>`.
  - [x] Remplacer les accès au reducer : `commitBuffer`, `doUndo`, `doRedo` appellent `onCommit(next)` **au lieu de** `dispatch({ type: "SET_MASK_BUFFER" })`. `epoch`/`buffer`/`width`/`height` viennent des props (plus de `state.*`). L'`<img src>` = `backgroundUrl`, `alt` = `backgroundAlt ?? "Votre photo"`.
  - [x] `MaskCanvas` ne rend rien de reveal-spécifique (pas de détection, seeding, validation, bannière FR-16) et n'importe ni `@/state/effects` ni `useGeneration`.
- [x] **Task 2 — Recâbler `MaskSurface` sur `MaskCanvas` (AC: 2)**
  - [x] `mask-surface.tsx` **garde** : l'effet de détection d'entrée (`runDetect`), l'effet de seeding (`rasterizeMaskUrl`/`createBlankBuffer` → `SET_MASK_BUFFER`), l'`epochRef`, la validation (`handleValidate`/`runValidateMask`), `usePhotoObjectUrl`, la bannière `noFurniture`, les deux boutons (« Vider automatiquement » / « Valider le Masque à la main ») + hints + `validateError`.
  - [x] `MaskSurface` rend `<MaskCanvas backgroundUrl={photoUrl} width={photoWidth} height={photoHeight} buffer={buffer} epoch={state.epoch} onCommit={(b) => dispatch({ type: "SET_MASK_BUFFER", buffer: b })} />` à la place du bloc viewport+toolbar, avec les boutons d'action rendus dessous (inchangés).
  - [x] Supprimer de `mask-surface.tsx` tout le code déplacé (painting/zoom/pan/history/keyboard/overlay/toBufferPoint/etc.) + les imports devenus inutiles (`paintStroke`, `createHistory`/`push`/`undo`/`redo`/…, `clampZoom`/`screenToBuffer`/`stepBrush`, `MaskToolbar`, `Point`, `StrokeMode`). Garder `createBlankBuffer`, `isBufferEmpty`, `rasterizeMaskUrl`, `MaskBuffer`.
  - [x] Comportement reveal **identique** : mêmes classes CSS, `aspectRatio`, `aria-label="Masque"`, opacité 45 %, ordre du DOM.
- [x] **Task 3 — Tests `MaskCanvas` (AC: 4)**
  - [x] `src/components/mask-canvas.test.tsx` : rendu de l'`<img>` de fond quand `backgroundUrl` fourni ; toolbar présente ; raccourci `B`/`E` change l'outil (assertion observable, ex. état actif dans la toolbar) ; `[`/`]` ajuste la taille ; `buffer` undefined → aucun `onCommit`, aucun crash.
  - [x] Si `getContext("2d")` est indisponible en jsdom, garder les assertions sur ce qui ne dépend pas du raster (rendu, clavier, toolbar) et documenter que la peinture pixel est couverte par la vérif live — NE PAS mocker le canvas de façon fragile.
  - [x] Ne pas casser les tests existants (`upload-zone`, `stepper`, `home-scene`, `page`, libs `mask-*`).
- [x] **Task 4 — Vérification & non-régression (AC: 2, 4)**
  - [x] `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
  - [x] Live-verify (Playwright, serveur :3000) : mode reveal → étape Masque → peindre, gommer, undo/redo, zoom molette, pan (espace+drag), raccourcis B/E/[/], « Valider le Masque » ou « Vider automatiquement » — **comportement identique à avant**, 0 erreur console.

## Dev Notes

### Portée & décision
Refactor **sans changement de comportement** (pure extraction). Le seul livrable fonctionnel : `MaskCanvas` réutilisable et contrôlé. Aucune nouvelle feature. Le mode édition (5.3) consommera `MaskCanvas` mais N'EST PAS construit ici.

**Interface `MaskCanvas` (contrôlé, AR-LAYERS)** : le composant est une VUE pure du buffer. Il ne connaît ni le reducer ni le mode. L'hôte (`MaskSurface` maintenant, `EditorSurface` en 5.3) possède l'état (`maskDraft.buffer`), passe `buffer`+`epoch`+dims+`backgroundUrl` et réagit à `onCommit(next)` en dispatchant `SET_MASK_BUFFER`. L'historique undo/redo reste **UI-local à `MaskCanvas`** (perdu à l'unmount, AD-13) et se ré-initialise quand `epoch` change (comme aujourd'hui via `historyEpochRef`).

### État actuel du fichier touché (UPDATE)
- **`src/components/mask-surface.tsx`** (585 lignes) — mélange aujourd'hui 5 responsabilités : (1) détection d'entrée `runDetect` [reveal — RESTE], (2) seeding buffer depuis `maskDraft.detectedMaskUrl`/blank [reveal — RESTE], (3) init historique [→ DÉPLACE dans MaskCanvas], (4) **canvas + peinture/zoom/pan/undo/redo/clavier/curseur/overlay/toolbar** [→ DÉPLACE dans MaskCanvas, c'est le cœur], (5) validation `handleValidate`/`runValidateMask` + boutons + bannière FR-16 [reveal — RESTE]. **À préserver** : chaque comportement de (1),(2),(5) inchangé ; le buffer reste `state.maskDraft.buffer` (AD-13) ; `SET_MASK_BUFFER` reste le seul canal d'écriture ; overlay verbatim binaire blanc=actif (AD-7).
- **Détail critique de l'historique** : aujourd'hui `commitBuffer` fait `dispatch(SET_MASK_BUFFER)` PUIS `setHistory(push(...))`. Après extraction, `MaskCanvas.commitBuffer` fait `onCommit(next)` PUIS `push` dans son historique local. `doUndo`/`doRedo` appellent `onCommit(current(history))`. Sémantique identique.
- **Détail seeding vs historique** : le seeding (reveal) dispatch `SET_MASK_BUFFER` → le `buffer` prop de MaskCanvas change → l'effet `historyEpochRef` (déplacé dans MaskCanvas) initialise l'historique à ce buffer une fois par epoch. Il ne faut PAS que `onCommit` du seeding rentre en boucle : le seeding vient de l'hôte (pas de `onCommit`), MaskCanvas observe juste le nouveau `buffer` prop → init historique. OK, identique à l'actuel.

### Fichiers réutilisés tels quels (ne PAS modifier)
- `src/components/mask-toolbar.tsx` (props inchangées), `src/components/use-photo-object-url.ts`.
- `src/lib/mask-buffer.ts` (`createBlankBuffer`, `isBufferEmpty`, `paintStroke`, `MaskBuffer`, `Point`, `StrokeMode`), `mask-history.ts`, `mask-tools.ts` (`clampZoom`, `screenToBuffer`, `stepBrush`, `MIN/MAX_BRUSH`), `mask-raster.ts` (`rasterizeMaskUrl`).

### Contraintes d'architecture (spine)
- **AR-LAYERS** : `MaskCanvas` = composant de présentation contrôlé, aucune importation `@/state/effects`/`useGeneration`/`@fal-ai/*`.
- **AD-7** : overlay/buffer binaire (0/255), blanc = zone active, dimensions canoniques 1:1, jamais rééchantillonné (zoom/pan/DPR = transforms d'affichage uniquement).
- **AD-13** : le buffer vit dans le reducer (dual-life) ; l'historique est UI-local et jeté à l'unmount.
- **NFR-3** : entièrement utilisable à la souris ; raccourcis = bonus (UX-DR8). UI FR / code EN.

### Risque & garde-fou
Pas de tests unitaires `mask-surface` aujourd'hui → risque de régression silencieuse. Mitigation : (a) extraction verbatim (copier, ne pas réécrire la logique) ; (b) Task 3 ajoute une couverture `MaskCanvas` de base ; (c) Task 4 live-verify le mode reveal complet. jsdom ne rend pas un vrai canvas 2D — ne PAS bâtir des assertions pixel fragiles ; la peinture pixel est validée en live (comme aux stories 2.2/2.3).

### Project Structure Notes
- Nouveau : `src/components/mask-canvas.tsx` (+ `mask-canvas.test.tsx`). `mask-surface.tsx` rétrécit fortement.
- Pas de nouvelle dépendance.

### References
- [Source: docs/plans/2026-07-13-image-edit-mode-design.md#3-composants--ui] — « MaskCanvas : extraction du cœur de mask-surface, fond paramétrable ».
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- [Source: src/components/mask-surface.tsx] — code à extraire (responsabilités 1-5 ci-dessus).
- [Source: src/components/mask-toolbar.tsx] — toolbar réutilisée.
- [Source: src/lib/mask-buffer.ts, mask-history.ts, mask-tools.ts, mask-raster.ts] — primitives pures.
- [Source: 5.1 done — mode/editor step ; EditorSurface placeholder consommera MaskCanvas en 5.3].

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `MaskCanvas.test` : radix `Slider` (via `MaskToolbar`) exige `ResizeObserver`, absent de jsdom → ajout d'un setup vitest global (`src/test-setup.ts` + `setupFiles`) avec un stub `ResizeObserver`. Les warnings `getContext("2d") not implemented` sont bénins (le code garde le ctx null).
- Peinture pixel non testable en jsdom (canvas 2D null + rects à 0) → couverte en live (getImageData).

### Completion Notes List

- **`mask-canvas.tsx`** (nouveau) : `MaskCanvas` contrôlé — props `{backgroundUrl, width, height, buffer, epoch, onCommit, backgroundAlt?}`. Extraction **verbatim** du cœur canvas (peinture/gomme, zoom molette centré curseur, pan espace+drag, undo/redo, raccourcis, curseur, overlay rose, toolbar). `dispatch(SET_MASK_BUFFER)` → `onCommit(next)` ; `state.*` → props. Historique undo/redo UI-local, ré-init par `epoch`. Aucune import `@/state/effects`/`useGeneration` (AR-LAYERS).
- **`mask-surface.tsx`** : réduit de 585 → ~180 lignes. Garde la logique reveal (détection d'entrée `runDetect`, seeding buffer, validation `runValidateMask`, bannière FR-16, boutons) et délègue le canvas à `<MaskCanvas … onCommit={(b)=>dispatch SET_MASK_BUFFER}>`. Comportement reveal inchangé.
- **`test-setup.ts`** (nouveau) + `vitest.config.ts` : `setupFiles` + stub `ResizeObserver`.
- **`mask-canvas.test.tsx`** (nouveau) : 6 tests (fond+alt, overlay+toolbar, B/E, [/], buffer undefined = pas de commit/crash).
- **179 tests** (vs 173), tsc/lint/build verts.
- **Live-verify** : reveal → upload cuisine → étape Masque via MaskCanvas (identique) → trait peint (canvas 1024×768 canonique, buffer rempli, « Annuler » activé) → undo (333035→328827 px, undo désactivé, redo activé). 0 erreur console. Round-trip `onCommit → SET_MASK_BUFFER → buffer → redraw + historique` prouvé.

### File List

- `src/components/mask-canvas.tsx` — **nouveau** + `mask-canvas.test.tsx` **nouveau**
- `src/components/mask-surface.tsx` — modifié (délègue à MaskCanvas)
- `src/test-setup.ts` — **nouveau**
- `vitest.config.ts` — modifié (setupFiles)

### Change Log

- 2026-07-13 : Story 5.2 créée (create-story). Extraction pure du cœur canvas de `mask-surface.tsx` vers un `MaskCanvas` contrôlé (props `backgroundUrl`/`width`/`height`/`buffer`/`epoch`/`onCommit`), `MaskSurface` garde détection/seeding/validation. + tests MaskCanvas (pas de tests mask-surface préexistants). Statut → ready-for-dev.
- 2026-07-13 : Story 5.2 implémentée (extraction verbatim) + live-verify + revue adverse 2 couches. 173 → **179 tests**, tsc/lint/build verts. 3 correctifs. Statut → review → **done**.

## Senior Developer Review (AI)

**Date :** 2026-07-13 · **Reviewers :** 2 sous-agents adverses (Extraction Fidelity, Acceptance & Scope) · **Résultat :** Approuvé après 3 correctifs.

**Verdict :** Acceptance = **APPROVE** (AC1-AC3 PASS, AC4 partiel corrigé). Extraction Fidelity = parité confirmée ligne à ligne sur tous les handlers (drawOverlay, strokeFeedback, onPointerDown/Move, endStroke, onWheel, updateCursor, toBufferPoint, doUndo/doRedo, historyEpochRef, isEditableTarget) ; ordering `onCommit → push history` préservé ; ResizeObserver stub sans risque (guardé). Scope propre (rien de 5.3-5.5), AR-LAYERS respecté (MaskCanvas n'importe que lib + MaskToolbar), aucune import morte, aucune dép nouvelle.

Triage : le « CRITICAL » signalé (handleValidate lit `state` au lieu de `bufferRef`) n'a en pratique pas de fenêtre de course atteignable (les clics sont des événements séparés, post-render) — recalibré Moyen — mais retirait une garde délibérée, donc restauré.

### Correctifs appliqués
- [x] **[Moyen]** `MaskSurface.handleValidate` relit `bufferRef.current` (ref resynchronisée sur `buffer`) au lieu du closure `state` — restaure la garde anti-lag pré-5.2.
- [x] **[Moyen]** `onCommit` passé à `MaskCanvas` mémoïsé (`useCallback([dispatch])`) au lieu d'une lambda inline — supprime l'invalidation en cascade des `useCallback` de MaskCanvas et le ré-enregistrement des listeners clavier à chaque render de MaskSurface.
- [x] **[Moyen]** Test taille de brosse renforcé : `]`→« 36 px » (assertion positive) + ajout du chemin `[`→« 28 px » (AC4 cite les deux touches).

### Écartés (parité confirmée / non-issues)
- `historyEpochRef` « risque de boucle » : garde `=== epoch` fonctionne (no-op par stroke, négligeable). Non-issue.
- Ordering `doUndo/doRedo` : parité confirmée. Non-issue.
