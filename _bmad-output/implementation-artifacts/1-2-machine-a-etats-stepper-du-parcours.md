---
baseline_commit: c1468df1c4ed4775e834d665792399baf81a48f4
---

# Story 1.2: Machine à états & Stepper du Parcours

Status: review

## Story

As a utilisateur,
I want voir en permanence où j'en suis dans le Parcours et pouvoir revenir à une étape précédente sans rien perdre,
so that je me repère et corrige sans jamais recommencer depuis le début.

## Acceptance Criteria

1. **Given** le reducer de la Génération **When** il est testé unitairement (pur, sans mock) **Then** il expose la forme canonique `generation = { step, epoch, originalPhoto, maskDraft, mask?, emptyRoom?, reveal?, waitPhase?, error? }` (AD-3) **And** les types du domaine `WaitPhase` (`uploading | queued | generating | finalizing`) et `StepError { step, retryable, userMessage }` (`step ∈ 'detect'|'inpaint'|'video'`) sont définis dans `src/state/` (AR-WAITPHASE, AR-ERRORS)
2. **Given** une Génération avec des artefacts amont produits **When** l'utilisateur revient à une étape antérieure via le stepper **Then** tous les artefacts existants (Photo originale, Masque, Pièce vide) sont conservés (FR-15, AD-11) **And** aucune donnée n'est perdue
3. **Given** l'utilisateur revenu à une étape antérieure **When** il avance à nouveau depuis cette étape **Then** une confirmation (`Dialog` shadcn) est demandée, puis les artefacts en aval sont invalidés et le jeton d'époque (`epoch`) est incrémenté (AD-11, AD-12)
4. **Given** le Parcours à 4 étapes (Upload → Masque → Pièce vide → Vidéo) **When** le Stepper est affiché **Then** l'étape courante (fond or) et les étapes accomplies (coche + label, cliquables) sont identifiables d'un coup d'œil, les étapes futures sont inertes (FR-13, UX-DR5) **And** l'état n'est jamais signalé par la couleur seule (coche + position + label combinés) (UX-DR18)

## Tasks / Subtasks

- [x] Task 1 : Types du domaine dans `src/state/` (AC: 1)
  - [x] `src/state/types.ts` : `Step` (union `'upload' | 'mask' | 'emptyRoom' | 'video'` — nommage glossaire, l'ordre du Parcours), `WaitPhase` (`'uploading' | 'queued' | 'generating' | 'finalizing'`, AR-WAITPHASE/AD-14), `StepError { step: 'detect' | 'inpaint' | 'video'; retryable: boolean; userMessage: string }` (AR-ERRORS/AD-8). ⚠️ `Step` (position dans le Parcours) et le `step` de `StepError` (opération pipeline) sont deux vocabulaires distincts — ne pas les fusionner ; le reducer possède la table de correspondance `detect→mask`, `inpaint→emptyRoom`, `video→video` (AD-8).
  - [x] Type `Generation` : forme canonique exacte `{ step: Step; epoch: number; originalPhoto?: { blob: Blob; falUrl?: string }; maskDraft?: <buffer binaire, forme précisée en Epic 2>; mask?: string; emptyRoom?: string; reveal?: string; waitPhase?: WaitPhase; error?: StepError }` (AD-3). Les URLs fal sont des `string`. `maskDraft` : typer a minima (ex. `MaskDraft` opaque ou `ImageData`/`Uint8ClampedArray` — la forme définitive relève d'Epic 2/AD-13) ; ne PAS uploader ni encoder ici.
- [x] Task 2 : Reducer pur de la Génération (AC: 1, 2, 3)
  - [x] `src/state/reducer.ts` : `initialGeneration` (step `upload`, epoch 0, aucun artefact) + `generationReducer(state, action): Generation` PUR (aucun effet, aucun mock nécessaire pour le tester — AR-TESTS).
  - [x] Actions minimales pour cette story (nommage anglais) : `PHOTO_NORMALIZED` (pose `originalPhoto`, avance à `mask`), `GO_TO_STEP` (retour arrière : change `step` SANS toucher aux artefacts — AC2/AD-11), `CONFIRM_ADVANCE_FROM` (avancer depuis une étape antérieure : invalide l'aval + `epoch++` — AC3/AD-11/AD-12), `SET_WAIT_PHASE`, `SET_ERROR`, `CLEAR_ERROR`. (Les actions detect/inpaint/video arrivent avec leurs epics ; ne pas les implémenter ici.)
  - [x] **AD-11 (invalidation) — dans le reducer SEUL** : `GO_TO_STEP` vers une étape antérieure conserve TOUS les artefacts (FR-15). `CONFIRM_ADVANCE_FROM(step)` invalide les artefacts strictement en aval de `step` (ex. avancer depuis `mask` efface `emptyRoom` et `reveal`) et incrémente `epoch`. Un `SET_ERROR` ne détruit jamais l'amont (AD-8). Ordre aval canonique : `upload < mask < emptyRoom < video`.
  - [x] **AD-14 (monotonie waitPhase)** : le reducer refuse une transition de `waitPhase` régressive au sein d'une même tentative ; un `epoch++` (nouvelle tentative) réinitialise la phase. Ordre : `uploading < queued < generating < finalizing`.
- [x] Task 3 : Contexte React de la Génération (AC: 2, 3)
  - [x] `src/state/generation-context.tsx` : `GenerationProvider` (`useReducer(generationReducer, initialGeneration)`) + hook `useGeneration()` exposant `state` + `dispatch` (ou intentions typées). C'est le seul détenteur d'état pipeline (AD-3) — aucun composant ne tient d'état pipeline local. Monter le provider dans `layout.tsx` ou un client wrapper (le provider est un Client Component `"use client"`).
- [x] Task 4 : Composant Stepper (AC: 4)
  - [x] `src/components/stepper.tsx` : bandeau 4 étapes (Upload → Masque → Pièce vide → Vidéo, labels français `carton-titre`). Étape courante : fond `or-lumineux` + chiffre `or-lumineux-foreground`. Accomplies : coche (icône Lucide `Check`) + label `texte-principal`, **cliquables** → `dispatch(GO_TO_STEP)`. Futures : `texte-secondaire`, inertes (non focusables/non cliquables). Points ronds `rounded-full` reliés par connecteur `bordure` (UX-DR5).
  - [x] **UX-DR18 (jamais la couleur seule)** : combiner coche + position (numéro) + label — l'état ne dépend jamais de la seule couleur. Bandeau branché dans le slot `stepper` de `AppShell`.
  - [x] **A11y** : stepper traversable au clavier (étapes accomplies focusables, activables Entrée/Espace ; futures `aria-disabled`), `aria-current="step"` sur l'étape courante, changement d'étape annoncé `aria-live="polite"` (UX-DR18).
- [x] Task 5 : Dialog de confirmation d'avancée (AC: 3)
  - [x] Installer `dialog` shadcn (`npx shadcn@latest add dialog`). Quand l'utilisateur, revenu en arrière, tente d'avancer et que des artefacts aval existent : `Dialog` de confirmation (microcopie français, vouvoiement, glossaire — ex. « Avancer va recréer les étapes suivantes. Continuer ? »). Confirmer → `dispatch(CONFIRM_ADVANCE_FROM)`. Annuler → aucun changement. Pas de confirmation si aucun artefact aval n'existe.
- [x] Task 6 : Tests (AC: 1, 2, 3, 4)
  - [x] `src/state/reducer.test.ts` : reducer PUR sans mock — forme canonique, `GO_TO_STEP` conserve les artefacts, `CONFIRM_ADVANCE_FROM` invalide l'aval + `epoch++`, `SET_ERROR` préserve l'amont, monotonie waitPhase. Cible : couvrir toutes les transitions listées.
  - [x] `src/components/stepper.test.tsx` : rend 4 labels, marque l'étape courante (`aria-current`), étapes accomplies cliquables, futures inertes.
  - [x] Vérifier `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Dev Notes

### État de la story 1.1 (déjà en place — NE PAS recréer)

- Socle Next.js 16.2 / React 19.2 / Tailwind 4.3 / shadcn dark unique opérationnel. `src/state/` existe (vide, `.gitkeep`).
- `AppShell` (`src/components/app-shell.tsx`) expose déjà un **slot `stepper`** (bandeau fixe en haut) — y brancher le Stepper de cette story (retirer le placeholder « ROOMREVEAL »). Slots `children` (scène) et `primaryAction` (sous la scène, aligné à droite) disponibles.
- Tokens dispo : utilities `bg-or-lumineux`, `text-or-lumineux-foreground`, `text-texte-principal`, `text-texte-secondaire`, `border-bordure`, `text-carton-titre`. shadcn `Button`, `Tooltip` installés. Icônes : `lucide-react`.
- Provider React à monter côté client : `AppShell`/`layout` sont des Server Components — créer un wrapper `"use client"` pour `GenerationProvider`.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-3 (état unique)** : la Génération est UN objet tenu par un reducer React ; serveur sans état ; perte au rafraîchissement assumée. Forme canonique exacte imposée (voir Task 1). Aucun composant ne tient d'état pipeline local.
- **AD-11 (invalidation) — reducer SEUL** : retour arrière conserve l'amont ; avancer à nouveau invalide l'aval (après confirmation UX) + `epoch++` ; échec n'efface jamais l'amont. « Régénérer » (Epic 3) sera aussi une invalidation d'aval — la sémantique vit ici.
- **AD-12 (époque)** : chaque invalidation incrémente `epoch` ; ce jeton servira (Epic 2+) à jeter les résultats de jobs périmés dans `src/state/effects.ts`. Cette story pose le compteur ; `effects.ts` n'est PAS créé ici.
- **AD-8 (erreurs)** : `StepError { step, retryable, userMessage }`, `step` typé `'detect'|'inpaint'|'video'` ; le reducer possède la table `step pipeline → surface Parcours`. `userMessage` en français (glossaire). L'UI ne voit jamais d'erreur fal native.
- **AD-14 (waitPhase)** : enum unique dans les types domaine ; monotonie par tentative imposée par le reducer.
- **AR-LAYERS** : `state/` peut importer `lib/` mais JAMAIS `pipeline/` ni `@fal-ai/client`. `components/` importe `state/` (contexte/hook). Reducer pur = pas d'effet, pas de fetch, pas d'`AbortController` (ça viendra dans `effects.ts`).
- **Nommage** : code/commentaires anglais, glossaire fixe (`originalPhoto`, `mask`, `emptyRoom`, `reveal`, `generation`, `step`). UI 100 % français.

### Contraintes UX (EXPERIENCE.md / DESIGN.md — font foi)

- **Stepper (UX-DR5, Component Patterns)** : étape courante + accomplies identifiables d'un coup d'œil ; accomplies cliquables → retour SANS perte ; futures inertes ; retour limité à la Génération en cours. Points ronds `rounded-full` (seul usage de `full`), connecteur `bordure`, labels `carton-titre`.
- **Microcopie** : vouvoiement sobre, glossaire PRD (Upload/Masque/Pièce vide/Vidéo, Parcours, Génération), jamais de jargon (« state machine », « reducer », « epoch » n'apparaissent JAMAIS en UI), pas d'emojis.
- **A11y (UX-DR18)** : jamais la couleur seule ; focus visible (ring shadcn) ; traversable clavier ; `aria-live` polite pour changement d'étape ; `aria-current`.
- Le libellé des 4 étapes en UI : « Upload » (ou « Photo » ?) → **utiliser les libellés du glossaire** : Upload, Masque, Pièce vide, Vidéo (le stepper de la spine liste « Upload → Masque → Pièce vide → Vidéo »).

### Project Structure Notes

```text
src/state/types.ts               # Step, WaitPhase, StepError, Generation (NEW)
src/state/reducer.ts             # initialGeneration + generationReducer pur (NEW)
src/state/reducer.test.ts        # tests reducer purs (NEW)
src/state/generation-context.tsx # Provider + useGeneration (NEW, "use client")
src/components/stepper.tsx        # bandeau stepper (NEW)
src/components/ui/dialog.tsx      # shadcn add dialog (NEW)
```

### Pièges connus

- **Reducer pur** : ne pas y appeler `dispatch` en cascade ni d'effet ; les transitions sont des fonctions `(state, action) → newState`. Immutabilité stricte (spread, jamais de mutation — règle projet).
- **Provider client** : `useReducer` exige `"use client"`. Ne pas transformer tout le layout en client ; wrapper minimal autour de `{children}`.
- **Invalidation aval** : implémenter l'ordre comme un index (`STEP_ORDER: Step[]`) pour comparer amont/aval proprement, plutôt que des `if` en cascade.
- **Dialog** : ne pas déclencher la confirmation si aucun artefact aval n'existe (avancer depuis upload sans mask/emptyRoom/reveal ne demande rien).

### Testing Requirements

- Reducer testé PUR, sans aucun mock (AR-TESTS) — c'est le cœur de l'AC1. Couvrir : forme initiale, chaque action, préservation d'artefacts au retour, invalidation aval + epoch à l'avance, préservation amont sur erreur, monotonie waitPhase.
- Stepper : test de rendu (labels, état courant, cliquabilité accomplies/inertie futures).
- `npm test` + `tsc` + `lint` + `build` verts avant de terminer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] (ACs)
- [Source: ARCHITECTURE-SPINE.md#AD-3, AD-8, AD-11, AD-12, AD-14, Consistency Conventions]
- [Source: DESIGN.md#Components (Stepper du Parcours), Colors (or-lumineux), Typography (carton-titre)]
- [Source: EXPERIENCE.md#Component Patterns (Stepper), Accessibility Floor, Voice and Tone]
- [Source: prd.md#FR-13, FR-15]

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5)

### Debug Log References

- Le smoke test de la story 1.1 rendait `HomePage` sans provider → `useGeneration` levait. Corrigé en enveloppant le rendu de test dans `GenerationProvider`.
- Premier jet du Stepper : `pendingAdvance` sans déclencheur (code mort). Corrigé : cliquer une étape aval encore accomplie (artefact présent) déclenche le guard `Dialog` (flux AC3 réel).

### Completion Notes List

- Types domaine (`src/state/types.ts`) : `Step`, `STEP_ORDER`, `WaitPhase`+`WAIT_PHASE_ORDER`, `PipelineStep`, `StepError`, `PIPELINE_STEP_TO_PARCOURS` (table detect→mask / inpaint→emptyRoom / video→video, AD-8), `OriginalPhoto`, `MaskDraft` (opaque, forme définitive Epic 2), `Generation` (forme canonique exacte AD-3). `Step` et `PipelineStep` distincts.
- Reducer pur (`src/state/reducer.ts`) : `initialGeneration` + `generationReducer`. Actions Epic 1 : `PHOTO_NORMALIZED`, `GO_TO_STEP` (retour lossless — refuse d'avancer), `CONFIRM_ADVANCE_FROM` (invalide l'aval + epoch++), `SET_WAIT_PHASE` (monotone AD-14), `SET_ERROR` (préserve l'amont AD-8), `CLEAR_ERROR`. Invalidation aval par index sur `STEP_ORDER`. Immutabilité stricte.
- Contexte (`src/state/generation-context.tsx`, `"use client"`) : `GenerationProvider` + `useGeneration()`. Monté dans `layout.tsx` — seul détenteur d'état pipeline (AD-3).
- Stepper (`src/components/stepper.tsx`) : 4 étapes, courante en or, accomplies coche+label cliquables (GO_TO_STEP), aval encore accomplie → guard, futures inertes. `aria-current`, `aria-live=polite`, jamais la couleur seule (UX-DR18). Dialog shadcn de confirmation. Helpers purs `isReachableAhead`, `hasDownstreamArtifacts`.
- Branché : `page.tsx` passe `<Stepper />` au slot `stepper` d'`AppShell`.
- Tests : `reducer.test.ts` 10 tests purs ; `stepper.test.tsx` rendu + helpers. Suite 16/16. `tsc`, `lint`, `build` OK. Vérif Playwright : « Upload » actif en or, 2/3/4 inertes.

### File List

- `src/state/types.ts` (nouveau)
- `src/state/reducer.ts` (nouveau)
- `src/state/reducer.test.ts` (nouveau)
- `src/state/generation-context.tsx` (nouveau)
- `src/components/stepper.tsx` (nouveau)
- `src/components/stepper.test.tsx` (nouveau)
- `src/components/ui/dialog.tsx` (nouveau — shadcn)
- `src/app/layout.tsx` (modifié — GenerationProvider)
- `src/app/page.tsx` (modifié — slot stepper)
- `src/app/page.test.tsx` (modifié — wrap provider)

## Change Log

- 2026-07-11 : Story 1.2 implémentée — types domaine, reducer pur (AD-11/AD-12/AD-14/AD-8), contexte React, Stepper (UX-DR5/UX-DR18) + Dialog. 16 tests verts. Statut → review.
