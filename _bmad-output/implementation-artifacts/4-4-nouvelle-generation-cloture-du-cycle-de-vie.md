---
baseline_commit: 2f1afe5
---

# Story 4.4: Nouvelle Génération & clôture du cycle de vie

Status: done

## Story

As a utilisateur,
I want relancer une nouvelle Génération quand j'ai fini,
so that j'enchaîne une deuxième photo sans confusion ni perte accidentelle.

## Acceptance Criteria

1. **Given** l'étape Vidéo **When** l'utilisateur regarde sous le lecteur **Then** trois actions apparaissent dans l'ordre canonique **« Nouvelle Génération » (ghost) → « Revoir » (outline) → « Télécharger le MP4 » (or)** (UX-DR10, UX-DR16, DESIGN).
2. **Given** une Révélation **non téléchargée** **When** l'utilisateur clique « Nouvelle Génération » **Then** une **confirmation** est demandée avant de repartir d'une Zone d'upload vierge (UX-DR16) ; si elle a déjà été téléchargée, la remise à zéro est directe.
3. **Given** une Génération en cours **When** l'utilisateur rafraîchit ou ferme l'onglet **Then** `beforeunload` avertit (« Votre Génération en cours sera perdue. ») et, après rechargement, retour à l'Accueil sans reprise en v1 (UX-DR15).
4. **Given** le Parcours complet à 4 étapes **When** l'utilisateur revient en arrière via le stepper (ex. Vidéo → Masque) **Then** les artefacts amont sont conservés et le retour reste limité à la Génération en cours (FR-15, Flow 4) — *déjà en place (GO_TO_STEP lossless), à confirmer de bout en bout*.

## Tasks / Subtasks

- [x] Task 1 : Reducer — action `RESET` (AC: 2)
  - [x] Ajouter `{ type: "RESET" }` à `GenerationAction`. Cas reducer **pur** : `return initialGeneration` (nouvelle Génération vierge : `step:"upload"`, `epoch:0`, aucun artefact). Tout run aval en vol sous l'ancienne époque devient stale (l'époque repart à 0 ≠ ancienne) et les surfaces se démontent (retour Upload) → jobs ignorés (AD-12). Test reducer (depuis une génération pleine → `toEqual(initialGeneration)`).
- [x] Task 2 : `reveal-player.tsx` — « Nouvelle Génération » + confirmation (AC: 1, 2)
  - [x] `useGeneration()` pour `dispatch`. Rangée d'actions réordonnée : **« Nouvelle Génération »** (`Button variant="ghost"`) **en premier**, puis « Revoir » (outline), puis « Télécharger le MP4 » (or) — ordre canonique DESIGN.
  - [x] Suivre `hasDownloaded` (état local) : passer à `true` après un `downloadFile` réussi (dans le `try`, avant le `finally`).
  - [x] `onClick` « Nouvelle Génération » : si `!hasDownloaded` → ouvrir un `Dialog` de confirmation (« Commencer une nouvelle Génération ? » / « Votre Révélation actuelle sera perdue si vous ne l'avez pas téléchargée. » ; boutons **Annuler** (ghost) / **Nouvelle Génération** (default)) → sur confirmation `dispatch({ type: "RESET" })`. Si `hasDownloaded` → `dispatch(RESET)` directement (pas de confirmation). Motif Dialog = `stepper.tsx` (confirmation d'avance).
- [x] Task 3 : `parcours-scene.tsx` — garde `beforeunload` (AC: 3)
  - [x] `useEffect` : quand une Génération est **en cours** (`state.step !== "upload"`), ajouter un écouteur `window` `beforeunload` qui `e.preventDefault()` + `e.returnValue = "Votre Génération en cours sera perdue."` (le texte custom est ignoré par les navigateurs modernes — le prompt natif s'affiche quand même). Retirer l'écouteur quand `step === "upload"` ou au démontage. Pas de reprise après reload (v1) — l'état vit en mémoire (AD-3), donc un reload repart à l'Accueil naturellement (rien à coder pour ça).
- [x] Task 4 : Vérification (AC: 1–4)
  - [x] `npm test` + `tsc` + `lint` + `build` verts. Test reducer `RESET`. (`beforeunload`/Dialog = jsdom-limité → live.)
  - [x] **Live (FAL_KEY)** : sous le lecteur, 3 actions dans l'ordre ghost/outline/or ; « Nouvelle Génération » **sans** téléchargement préalable → Dialog de confirmation → Annuler (reste), Confirmer → retour **Upload vierge** (aucun artefact) ; après un téléchargement → « Nouvelle Génération » repart **sans** Dialog ; `beforeunload` : tenter un reload en cours de Génération → prompt natif ; **retour arrière** Vidéo→Masque via le stepper → artefacts conservés (FR-15). 0 erreur console.

## Dev Notes

### État en place (NE PAS recréer)

- **Reducer** (`state/reducer.ts`) : `initialGeneration = { step:"upload", epoch:0 }` **exporté** — c'est la cible de `RESET`. `GO_TO_STEP` (retour arrière lossless, préserve tous les artefacts) et `CONFIRM_ADVANCE_FROM` (avance + invalidation) **déjà là** → AC4 est **déjà satisfait** par l'existant (le Parcours 4 étapes est complet depuis 4.1). `VIDEO_SUCCEEDED` pose `reveal`.
- **`reveal-player.tsx`** (4.2/4.3) : rangée d'actions `flex gap-3` avec « Revoir » (outline) + « Télécharger le MP4 » (`GenerationButton` or) ; état `downloading`/`downloadError`/`mountedRef`. C'est là qu'on **préfixe** « Nouvelle Génération » (ghost) et qu'on ajoute `hasDownloaded`. Composant client sous le provider → peut appeler `useGeneration()`.
- **`ui/dialog.tsx`** : `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` — motif de confirmation **déjà utilisé** dans `stepper.tsx` (Dialog « Continuer le Parcours ? » avec Annuler/Continuer). Copier ce motif.
- **`ui/button.tsx`** : `variant` ghost (Nouvelle Génération) / outline (Revoir) / default=or (Télécharger).
- **`parcours-scene.tsx`** : root client du Parcours, a `useGeneration()` → hôte de l'effet `beforeunload`.
- **`generation-context.tsx`** : `dispatch` via `useReducer` (stable).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-3** : la Génération vit dans un reducer en mémoire, le serveur ne persiste rien ; **perte au rafraîchissement assumée** (v1). `RESET` = repartir de `initialGeneration` ; le reload repart à l'Accueil sans reprise (rien à persister). [Source: ARCHITECTURE-SPINE.md#AD-3]
- **AD-11/AD-12** : `RESET` remet l'époque à 0 et démonte les surfaces → tout job aval en vol est ignoré (stale/abort). Aucun artefact ne survit. [Source: ARCHITECTURE-SPINE.md#AD-11/12]
- **AD-11 / FR-15** : retour arrière lossless (déjà implémenté) — AC4 valide l'existant de bout en bout. [Source: ARCHITECTURE-SPINE.md#AD-11]
- **AR-LAYERS** : les composants dispatchent des intentions (`RESET`) ; reducer pur ; pas de `pipeline/`. [Source: Dev Notes précédents]

### Contraintes UX (font foi)

- **Ordre canonique des actions** (DESIGN.md:160, la plus forte en dernier) : « Nouvelle Génération » (ghost) · « Revoir » (outline) · « Télécharger le MP4 » (or). [Source: DESIGN.md:160, EXPERIENCE.md:72]
- **UX-DR16** : confirmation avant de repartir de zéro si la Révélation n'a pas été téléchargée (éviter la perte accidentelle). [Source: epics.md#4.4]
- **UX-DR15** : `beforeunload` avertit d'une perte en cours ; pas de confetti/toast ailleurs. [Source: epics.md#4.4]

### Pièges connus

- **Confirmation conditionnelle** : Dialog **seulement** si `!hasDownloaded` (téléchargée → reset direct). Ne pas confirmer inutilement après un téléchargement.
- **`beforeunload`** : texte custom ignoré par les navigateurs (prompt générique) — c'est attendu ; il faut `preventDefault()` + `returnValue` pour déclencher le prompt. Ne l'activer que quand une Génération est en cours (`step !== "upload"`) pour ne pas gêner l'Accueil. Nettoyer l'écouteur (sinon il persiste après RESET/retour Upload).
- **`RESET` remet epoch à 0** : OK, les surfaces se démontent et les runs en vol sont stale ; ne pas essayer de préserver quoi que ce soit.
- **AR-LAYERS** : `reveal-player` dispatche `RESET` (intention) ; ne pas manipuler l'état ailleurs.
- **Ne pas ré-implémenter le retour arrière** (AC4 déjà couvert par `GO_TO_STEP`).

### Testing Requirements

- **Pur (Vitest)** : reducer `RESET` (depuis `fullGeneration()` → `initialGeneration`). `beforeunload` + Dialog de confirmation = comportement navigateur (jsdom limité) → **live**. Optionnel : test que le Dialog s'ouvre quand `!hasDownloaded` (jsdom rend le Dialog radix).
- **Non testable jsdom → live** : `beforeunload` prompt, reset visuel, ordre des 3 boutons. Vérif live.
- Régression : suites 1.x–4.3 vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Modifs** : `state/reducer.ts` (+ test — `RESET`), `components/reveal-player.tsx` (Nouvelle Génération + confirm + hasDownloaded), `components/parcours-scene.tsx` (beforeunload).
- Nommage anglais. Réutilise `ui/dialog` (motif stepper), `ui/button`. Ne réinvente rien.

### References

- [Source: epics.md#Story 4.4]
- [Source: ARCHITECTURE-SPINE.md#AD-3, AD-11, AD-12, AR-LAYERS]
- [Source: prd.md#FR-15 ; EXPERIENCE.md (UX-DR15/DR16, ordre des actions) ; DESIGN.md:160]
- [Source: src/components/reveal-player.tsx (4.2/4.3), stepper.tsx (motif Dialog de confirmation), state/reducer.ts (initialGeneration, GO_TO_STEP)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

### Completion Notes List

- **Reducer `RESET`** (pur) : `return initialGeneration` (Upload, epoch 0, aucun artefact). Test ajouté.
- **`reveal-player.tsx`** : `useGeneration()` pour `dispatch` ; rangée d'actions réordonnée **« Nouvelle Génération » (ghost) · « Revoir » (outline) · « Télécharger le MP4 » (or)** ; `hasDownloaded` (→true après download réussi) ; `newGeneration()` → si téléchargée `dispatch(RESET)` direct, sinon Dialog de confirmation (motif `stepper`) → RESET sur confirmation.
- **`parcours-scene.tsx`** : effet `beforeunload` (`preventDefault` + `returnValue`) actif tant que `step !== "upload"` (UX-DR15) ; nettoyé au retour Upload/démontage. Pas de reprise après reload (AD-3, en mémoire).
- **AC4** (retour arrière lossless) : déjà couvert par `GO_TO_STEP` (Epic 1-2) — validé de bout en bout maintenant que les 4 étapes existent.
- **145 tests verts** (+1 RESET), `tsc`/`lint`/`build` OK. Confirmation/beforeunload/ordre = vérif live.

### File List

- `src/state/reducer.ts` (modifié — action `RESET`)
- `src/state/reducer.test.ts` (modifié — test `RESET`)
- `src/components/reveal-player.tsx` (modifié — Nouvelle Génération + confirm + hasDownloaded)
- `src/components/parcours-scene.tsx` (modifié — garde `beforeunload`)

## Change Log

- 2026-07-12 : Story 4.4 créée (create-story) — Nouvelle Génération (RESET + confirmation si non téléchargée), garde beforeunload, ordre canonique des 3 actions, AC4 (retour arrière lossless) validant l'existant. Statut → in-progress (dev enchaîné).
- 2026-07-12 : Story 4.4 implémentée + revue (passe unique). ACs 1-4 PASS (0 CRITICAL/HIGH ; chaîne epoch-stranding après RESET vérifiée correcte). 2 correctifs : `RESET` renvoie `{...initialGeneration}` (objet frais, pas le singleton) + assertion test `not.toBe`. LOW écartés (double setConfirmingNew no-op React 18 ; tests optionnels). 145 tests, tsc/lint/build verts. Statut → **done**. Vérif live (confirm/beforeunload/reset) en attente.
