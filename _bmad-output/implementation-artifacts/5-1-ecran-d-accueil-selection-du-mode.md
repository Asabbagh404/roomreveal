---
baseline_commit: 9d79a06
---

# Story 5.1: Écran d'accueil & sélection du mode

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur arrivant sur RoomReveal,
I want choisir entre créer une vidéo révélation ou éditer une image,
so that j'accède directement au flux correspondant à mon intention.

## Acceptance Criteria

1. **Given** l'application ouverte sur desktop et aucun mode encore choisi (`mode === undefined`), **When** la page est rendue, **Then** un écran d'accueil présente deux cartes — « Créer la vidéo révélation » et « Éditer une image » — dans le langage visuel du DESIGN.md (surface-carte, anneau `bordure`→`or-lumineux` au survol), l'action de chaque carte étant claire (UX-DR1, UX-DR4). Aucun stepper de Parcours à 4 étapes n'est affiché sur l'accueil.
2. **Given** l'écran d'accueil, **When** l'utilisateur choisit une carte, **Then** le reducer fixe `mode` (`"reveal"` ou `"edit"`) via `SELECT_MODE` et positionne l'étape sur `upload`, à partir d'un état propre (fresh Generation, epoch 0, aucun artefact — AD-3/AD-11).
3. **Given** le mode `reveal` sélectionné, **When** le Parcours se déroule, **Then** le comportement des étapes `upload → mask → emptyRoom → video` est **strictement inchangé** (zéro régression, tous les tests existants passent sans modification de comportement), le titre display « Une photo. Une pièce qui se meuble toute seule. » restant associé à ce mode.
4. **Given** un mode sélectionné, **When** l'utilisateur regarde l'indicateur de progression, **Then** le `Stepper` s'adapte au mode : les 4 étapes existantes en `reveal` (inchangé) ; un indicateur simplifié en `edit` ; rien de trompeur (pas de stepper 4/4) sur l'accueil (`mode === undefined`).
5. **Given** une Génération terminée en mode `reveal` (Story 4.4), **When** l'utilisateur clique « Nouvelle Génération » (`RESET`), **Then** il repart d'une **Zone d'upload vierge dans le même mode** (et non de l'accueil) — le comportement de la Story 4.4 est préservé.

## Tasks / Subtasks

- [x] **Task 1 — Axe `mode` dans le domaine & reducer (AC: 2, 3, 5)**
  - [x] Ajouter `Mode = "reveal" | "edit"` à `src/state/types.ts` et le champ optionnel `mode?: Mode` à l'interface `Generation` (absent = accueil).
  - [x] Ajouter la valeur `"editor"` à l'union `Step` (mode édition) **sans** l'ajouter à `STEP_ORDER` (qui reste les 4 étapes du mode reveal, socle de `invalidateDownstream`/`stepIndex`/`Stepper`).
  - [x] Reducer : nouvelle action `{ type: "SELECT_MODE"; mode: Mode }` → `return { ...initialGeneration, mode: action.mode }` (état propre, step `"upload"`, epoch 0).
  - [x] Reducer : rendre `PHOTO_NORMALIZED` **mode-aware** — `step: state.mode === "edit" ? "editor" : "mask"` (le reste inchangé : `invalidateDownstream("upload")`, `originalPhoto`, epoch+1, reset error/waitPhase). Ne PAS toucher au `mode` (il persiste).
  - [x] Reducer : `RESET` préserve le mode — `return { ...initialGeneration, mode: state.mode }` (AC5 : « Nouvelle Génération » reste sur la Zone d'upload du mode courant, pas l'accueil).
  - [x] Tests reducer (RED→GREEN) : `SELECT_MODE` (reveal & edit) part d'un état propre au bon step ; `PHOTO_NORMALIZED` route `mask` en reveal et `editor` en edit ; `RESET` conserve `mode`.
- [x] **Task 2 — Écran d'accueil `HomeScene` (AC: 1, 2)**
  - [x] `src/components/home-scene.tsx` : deux cartes (bouton `type="button"`) « Créer la vidéo révélation » / « Éditer une image », langage DESIGN.md (surface-carte, `ring-1 ring-bordure` → `hover:ring-or-lumineux`, `rounded-lg`), gap `scene-gap`. Chaque carte : titre + courte ligne d'intention.
  - [x] La carte reveal porte le titre display existant (« Une photo. Une pièce qui se meuble toute seule. ») ; l'accueil a un titre neutre au-dessus des cartes.
  - [x] `onClick` → `dispatch({ type: "SELECT_MODE", mode })`. Composant présentationnel, aucune logique pipeline (AR-LAYERS).
- [x] **Task 3 — Routage `ParcoursScene` par mode (AC: 1, 3)**
  - [x] `mode === undefined` → `HomeScene`. Sinon : `mode === "edit"` → `step === "upload"` rend `UploadZone` (réutilisé), `step === "editor"` rend un **placeholder minimal** `EditorSurface` (« L'éditeur arrive à l'étape suivante » — remplacé en Story 5.3) ; `mode === "reveal"` → branchement `StepSurface` actuel **inchangé**.
  - [x] `beforeunload` : rester actif uniquement une fois **passé l'accueil ET l'upload** — condition `mode !== undefined && state.step !== "upload"` (l'accueil ne doit rien garder à perdre).
- [x] **Task 4 — `Stepper` adaptatif (AC: 4)**
  - [x] `mode === undefined` → le Stepper ne rend PAS le nav 4-étapes (rendre un simple libellé de marque « RoomReveal », cohérent avec le fallback AppShell).
  - [x] `mode === "reveal"` → nav 4-étapes actuel, **strictement inchangé**.
  - [x] `mode === "edit"` → indicateur simplifié (ex. « Édition » ou « Photo → Édition ») ; jamais de « 4/4 ».
  - [x] Tests : le rendu reveal est inchangé ; l'accueil ne montre pas le nav 4-étapes ; edit montre l'indicateur simplifié.
- [x] **Task 5 — Vérification & non-régression (AC: 3, 5)**
  - [x] `npm test` (dont `reducer.test`, `page.test`, `stepper` si présent) + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
  - [x] Confirmer manuellement/tests que le parcours reveal complet est intact (aucune AC d'Epic 1-4 cassée).

## Dev Notes

### Portée & décision de découpe (IMPORTANT)
Cette story pose **l'ossature du mode** ; le flux d'édition réel (dessin de zone, enlever/ajouter) arrive en **5.3/5.4**. Pour que l'app reste **cohérente de bout en bout** après 5.1 (exigence create-story), le mode édition doit atteindre un état non cassé : on introduit donc dès maintenant la valeur de step `"editor"` et un **placeholder** `EditorSurface`. Le vrai éditeur (5.3) remplacera ce placeholder — c'est un composant jetable, à garder minimal.

Ne PAS, dans cette story : construire `MaskCanvas` (5.2), l'éditeur (5.3), l'ajout texte/flux-fill (5.4), le download/RESET_EDIT (5.5).

### État actuel des fichiers touchés (UPDATE)
- **`src/state/types.ts`** — `Step = "upload"|"mask"|"emptyRoom"|"video"` ; `STEP_ORDER` (4 étapes) ; `Generation` sans `mode`. **Changement** : + `Mode`, + `mode?` dans `Generation`, + `"editor"` dans `Step` (hors `STEP_ORDER`). **À préserver** : `STEP_ORDER` reste les 4 étapes reveal (base de `stepIndex`/`invalidateDownstream`/`Stepper`) — `"editor"` n'y entre pas.
- **`src/state/reducer.ts`** — `initialGeneration = { step:"upload", epoch:0 }`. `PHOTO_NORMALIZED` fixe `step:"mask"` en dur ; `RESET` retourne `{...initialGeneration}`. **Changement** : `SELECT_MODE`, `PHOTO_NORMALIZED` mode-aware, `RESET` préserve `mode`. **À préserver** : sémantique d'invalidation AD-11 (les helpers `invalidateDownstream`/`stepIndex` ne sont jamais appelés avec `"editor"` — `PHOTO_NORMALIZED` appelle `invalidateDownstream("upload")`, indépendant du step destination ; `SELECT_MODE`/`RESET` n'appellent aucun helper). Toutes les autres branches inchangées.
- **`src/components/parcours-scene.tsx`** — `StepSurface` branche les 4 surfaces sur `state.step` ; `beforeunload` actif dès `step !== "upload"`. **Changement** : router d'abord sur `mode` (undefined→Home, edit→upload/editor, reveal→existant) ; ajuster la garde `beforeunload` à `mode !== undefined && step !== "upload"`. **À préserver** : le rendu reveal (titre display + UploadZone/Mask/EmptyRoom/Video) et l'overlay attente/erreur.
- **`src/components/stepper.tsx`** — rend toujours le nav 4-étapes depuis `STEP_ORDER`. **Changement** : brancher sur `mode`. **À préserver** : tout le comportement reveal (gold current, check behind, `isReachableAhead`/`hasDownstreamArtifacts`, dialog de confirmation, `isDone` 4/4). Exporter/garder les helpers inchangés.
- **`src/app/page.tsx`** — monte `<AppShell stepper={<Stepper/>}><ParcoursScene/></AppShell>`. Aucun changement attendu (le Stepper et la Scene s'adaptent en interne). **`src/components/app-shell.tsx`** — inchangé (le `stepper ?? "RoomReveal"` fallback n'est pas déclenché puisqu'on passe toujours `<Stepper/>` ; c'est le Stepper qui rend le libellé de marque sur l'accueil).

### Contraintes d'architecture (spine)
- **AD-3 / single reducer** : `mode` vit dans l'objet Generation unique ; pas de store parallèle. Serveur sans état.
- **AR-LAYERS** : `HomeScene`/`EditorSurface`(placeholder) sont des composants de présentation ; ils ne font que `dispatch` et lire l'état. Aucune importation `@fal-ai/client` (elle reste confinée à `src/pipeline/`, AD-5 — non concernée ici).
- **AD-11 / invalidation** : `SELECT_MODE` et `RESET` repartent d'un état propre ; pas de fuite d'artefacts entre modes/sessions.
- **UX** : dark-only, `rounded.lg` 12px, `scene-gap` 48px, action claire par carte (UX-DR1/DR4). UI 100% français, code anglais.

### Réutilisation (ne PAS réinventer)
- Cartes : s'inspirer des `ComparisonCard` de `empty-room-surface.tsx` (surface-carte + ring bordure→or au survol) et du style shadcn/`Button` existant.
- `UploadZone` réutilisé tel quel pour l'upload en mode édition.
- Le titre display existe déjà dans `parcours-scene.tsx` (`text-display`) — le déplacer dans la carte reveal, ne pas en recréer un.

### Testing standards
- Vitest. Reducer pur testé sans mock (voir `reducer.test.ts`). Composants : tests légers de rendu/branche (voir `stepper.test.tsx`, `page.test.tsx`). Cible 80%.
- RED→GREEN par task. Aucune régression : la suite Epic 1-4 (156 tests) doit rester verte.

### Project Structure Notes
- Nouveau : `src/components/home-scene.tsx`, `src/components/editor-surface.tsx` (placeholder, remplacé en 5.3).
- Nommage : `mode`/`Mode` (glossaire domaine), fichiers kebab-case, composants PascalCase — cohérent avec l'existant.
- Pas de nouvelle dépendance.

### References
- [Source: docs/plans/2026-07-13-image-edit-mode-design.md#1-machine-à-états--flux]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1: Écran d'accueil & sélection du mode]
- [Source: src/state/reducer.ts (PHOTO_NORMALIZED, RESET, CONFIRM_ADVANCE_FROM)]
- [Source: src/state/types.ts (Step, STEP_ORDER, Generation)]
- [Source: src/components/parcours-scene.tsx (StepSurface, beforeunload)]
- [Source: src/components/stepper.tsx (STEP_ORDER nav, isReachableAhead, hasDownstreamArtifacts)]
- [Source: ARCHITECTURE-SPINE AD-3/AD-11/AR-LAYERS ; DESIGN.md UX-DR1/DR4]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- RED : 4 tests reducer échouent (`SELECT_MODE`/`PHOTO_NORMALIZED` edit/`RESET` mode) avant impl.
- GREEN : reducer 33/33.
- Régression rattrapée : ajouter `mode` a fait basculer `Stepper` sur l'accueil (brand) → tests `stepper.test`/`upload-zone.test` qui rendaient le stepper avec un provider vierge cassaient. Corrigés en **semant `mode:"reveal"`** dans les `initialState` de ces tests (leur vraie précondition), sans affaiblir les assertions.
- `tsc` : ajout de `"editor"` à `Step` a cassé `STEP_LABELS: Record<Step,string>` → ajout de l'entrée `editor: "Édition"` (jamais rendue par RevealStepper, qui ne mappe que `STEP_ORDER`).

### Completion Notes List

- **types.ts** : `Mode = "reveal"|"edit"` ; `mode?` sur `Generation` (absent = accueil) ; `"editor"` ajouté à `Step` **hors** `STEP_ORDER` (jamais indexé par `stepIndex`/`invalidateDownstream`).
- **reducer.ts** : `SELECT_MODE` → `{...initialGeneration, mode}` (état propre, upload, epoch 0) ; `PHOTO_NORMALIZED` mode-aware (`edit→"editor"`, sinon `"mask"`), mode préservé ; `RESET` préserve `mode` (AC5 — « Nouvelle Génération » reste sur l'upload du mode, pas l'accueil).
- **home-scene.tsx** (nouveau) : 2 cartes (surface-carte, ring bordure→or), dispatch `SELECT_MODE`. Présentation pure.
- **editor-surface.tsx** (nouveau, **placeholder** remplacé en 5.3) : « L'éditeur arrive à l'étape suivante ».
- **parcours-scene.tsx** : routage sur `mode` d'abord (undefined→Home, edit→upload/editor, reveal→existant inchangé) ; garde `beforeunload` = `mode!==undefined && step!=="upload"`.
- **stepper.tsx** : branche sur `mode` — accueil = brand « RoomReveal » ; edit = indicateur « Photo → Édition » ; reveal = `RevealStepper` (ancien corps, **inchangé**). Helpers `isReachableAhead`/`hasDownstreamArtifacts` intacts.
- **167 tests** (+ reducer mode, stepper mode, home-scene), tsc/lint/build verts. Aucune régression reveal (Epics 1-4 intacts).

### File List

- `src/state/types.ts` (Mode, mode?, Step+editor) — modifié
- `src/state/reducer.ts` (SELECT_MODE, PHOTO_NORMALIZED mode-aware, RESET) — modifié
- `src/state/reducer.test.ts` — modifié (tests mode)
- `src/components/home-scene.tsx` — **nouveau** + `home-scene.test.tsx` **nouveau**
- `src/components/editor-surface.tsx` — **nouveau** (placeholder)
- `src/components/parcours-scene.tsx` — modifié (routage mode, beforeunload)
- `src/components/stepper.tsx` — modifié (adaptation mode, extraction RevealStepper)
- `src/components/stepper.test.tsx` — modifié (seed reveal + tests mode)
- `src/components/upload-zone.test.tsx` — modifié (seed reveal)

### Change Log

- 2026-07-13 : Story 5.1 créée (create-story). Ossature du mode édition : axe `mode`, `SELECT_MODE`, `PHOTO_NORMALIZED` mode-aware (reveal→mask / edit→editor), `RESET` préserve le mode, `HomeScene`, routage `ParcoursScene`, `Stepper` adaptatif, placeholder `EditorSurface` (remplacé en 5.3). Statut → ready-for-dev.
- 2026-07-13 : Story 5.1 implémentée en TDD (5 tasks) + revue adverse 3 couches. 167 tests → **173** après correctifs. tsc/lint/build verts. 4 correctifs appliqués (voir revue). Statut → review → **done**. Commit a53d335.
- 2026-07-13 : **Live-verify (Playwright, serveur :3000)**. Accueil = header « RoomReveal » (pas de stepper 4/4) + titre « Que voulez-vous créer ? » + 2 cartes. Clic « Éditer une image » → mode edit : stepper bascule sur « Photo → Édition » (Photo en cours/or), zone d'upload partagée affichée. **0 erreur console.** Reveal inchangé (couvert par tests). (Note : l'onglet préexistant bloquait via beforeunload — la garde UX-DR15 en action ; vérif faite sur un onglet neuf.)

## Senior Developer Review (AI)

**Date :** 2026-07-13 · **Reviewers :** 3 sous-agents adverses (Blind Spot Hunter, Edge Case Hunter, Acceptance Auditor) · **Résultat :** Approuvé après 4 correctifs.

**Verdict ACs :** AC1-AC5 **PASS** (audit d'acceptation confirmé). Aucun code hors-périmètre (5.2-5.5) introduit ; placeholder `EditorSurface` honnête et minimal ; UI FR / code EN respectés.

Triage : les reviewers ont classé plusieurs items « CRITICAL/HIGH », mais **aucun n'avait de déclencheur UI** (les actions `GO_TO_STEP`/`CONFIRM_ADVANCE_FROM` ne sont émises que par `RevealStepper`, gaté sur `mode==="reveal"` et itérant `STEP_ORDER` ; le stepper edit était display-only). Recalibrés en fonction de la réalité d'exécution, puis corrigés car le fond était juste et le fix cheap.

### Correctifs appliqués
- [x] **[Moyen — convergence 3/3]** `stepIndex("editor") === -1` contaminait `GO_TO_STEP` et `CONFIRM_ADVANCE_FROM` (invalidation à -1 → efface tous les artefacts ; `{mode:reveal, step:editor}` tombait sur `VideoSurface`). Guards ajoutés : `GO_TO_STEP` traite `editor→upload` comme retour valide et interdit d'entrer dans `editor` depuis un step reveal ; `CONFIRM_ADVANCE_FROM("editor")` est un no-op. + 3 tests.
- [x] **[Moyen — Blind Hunter]** Dead-end en mode edit (placeholder sans issue). Le « Photo » du stepper edit est désormais un bouton → `GO_TO_STEP("upload")` (rendu possible par le fix ci-dessus). + test « no dead end ».
- [x] **[Bas — Auditor/Edge]** Test `RESET` false-green (`toEqual(initialGeneration)` passait à vide avec `mode:undefined`). Assertion explicitée (`mode` undefined) + test « RESET préserve reveal ».
- [x] **[Bas — Auditor]** Couverture : test de routage edit (placeholder rendu à l'étape editor) ; a11y : `→` des CTA passés en `aria-hidden`.

### Écartés / Différés (inertes aujourd'hui, documentés)
- `beforeunload` fire sur le placeholder editor : **deviendra correct en 5.3** (le vrai éditeur aura du travail à protéger) ; sens « prévenir » = côté sûr. Laissé.
- `PHOTO_NORMALIZED` avec `mode===undefined` → `"mask"` : inerte (`UploadZone` jamais monté à l'accueil). Laissé (ajouter un guard casserait un test reveal legacy sans bénéfice réel).
- `DETECT_SUCCEEDED`/`SET_MASK_BUFFER` sans guard de mode : inertes (surfaces reveal non montées en edit). Différé à 5.3 si l'éditeur partage la couche d'effets.
- Époch remis à 0 par `SELECT_MODE`/`RESET` : sans danger (les effets en vol sont abortés à l'unmount ET gardés par isStale) — noté comme contrainte pour les auteurs d'effets futurs.
- Signatures `isReachableAhead`/`hasDownstreamArtifacts` en `Exclude<Step,"editor">` : polish différé (jamais appelées avec editor).
