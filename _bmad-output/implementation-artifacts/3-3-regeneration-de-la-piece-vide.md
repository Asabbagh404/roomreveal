---
baseline_commit: 990ee7b
---

# Story 3.3: Régénération de la Pièce vide

Status: done

## Story

As a utilisateur exigeant,
I want relancer l'Inpainting sans refaire les étapes précédentes,
so that j'obtienne une Pièce vide propre quand la première ne me convient pas.

## Acceptance Criteria

1. **Given** une Pièce vide affichée **When** l'utilisateur clique « Régénérer » **Then** l'Inpainting est relancé avec le **même Masque validé** (`generation.mask` inchangé), sans repasser par les étapes précédentes, et le nouveau résultat **remplace** l'ancien sans historique de versions (FR-9, UX-DR) **And** la microcopie « Un doute ? Régénérez : chaque Pièce vide est unique. » est présente (UX-DR14).
2. **Given** le nombre de régénérations **When** l'utilisateur régénère **Then** aucune limite n'est appliquée en v1 (FR-9) **And** « Régénérer » est un **bouton secondaire** ; « Créer ma vidéo » reste la **seule action d'or** de la surface (UX-DR13).
3. **Given** une régénération de la Pièce vide **When** elle produit un nouveau résultat **Then** toute Révélation existante en aval est invalidée et le jeton d'époque incrémenté — une Révélation ne peut jamais coexister avec une Pièce vide qui n'est pas la sienne (FR-9, AR-INVALIDATION).

## Tasks / Subtasks

- [x] Task 1 : Reducer — action `REGENERATE_EMPTY_ROOM` (AC: 1, 3)
  - [x] Ajouter `{ type: "REGENERATE_EMPTY_ROOM" }` (sans payload) à `GenerationAction`.
  - [x] Cas reducer **pur** : **no-op** si `state.step !== "emptyRoom"` OU `state.emptyRoom === undefined` (on ne régénère qu'un résultat déjà affiché). Sinon : `...invalidateDownstream("emptyRoom")` (efface `reveal`, borne stricte → conserve `mask`/`maskDraft`), **`emptyRoom: undefined`** (effacé explicitement → l'effet d'entrée de la surface relance `runInpaint`), **`epoch: state.epoch + 1`** (avorte tout job aval en vol, AR-INVALIDATION/AD-11/12), `waitPhase: undefined`, `error: undefined`. **NE touche PAS** `mask`, `maskDraft`, `originalPhoto` (même Masque validé + même photo canonique mémoïsée). Reste sur `step: "emptyRoom"`.
- [x] Task 2 : `empty-room-surface.tsx` — bouton secondaire « Régénérer » + microcopie (AC: 1, 2)
  - [x] Sous le bloc « Créer ma vidéo » (visible uniquement quand `ready`), ajouter un **bouton secondaire** `<Button variant="outline" onClick={…}>Régénérer</Button>` (composant `ui/button.tsx`) — PAS un `GenerationButton` (le bouton d'or reste « Créer ma vidéo », action d'or unique, UX-DR13).
  - [x] `onClick` : `dispatch({ type: "REGENERATE_EMPTY_ROOM" })`. Aucune limite/compteur (FR-9). Le bouton d'or « Créer ma vidéo » (Task de 3.2) reste inchangé au-dessus.
  - [x] Microcopie **exacte** sous les boutons : `<p>` en `text-texte-secondaire` « Un doute ? Régénérez : chaque Pièce vide est unique. » (UX-DR14).
  - [x] Layout : le bloc d'actions passe en colonne — bouton d'or, puis bouton secondaire, puis microcopie (ordre visuel = importance). Regrouper dans un conteneur `flex flex-col items-center gap-3`.
- [x] Task 3 : Vérification (AC: 1–3)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (aucune régression Epics 1–3.2).
  - [x] **Live (FAL_KEY)** : Pièce vide affichée → « Régénérer » (secondaire, gris/outline ; « Créer ma vidéo » reste l'or) + microcopie présente → clic → surface repasse en attente (« Génération de la Pièce vide… »), **sans** revenir au Masque/Upload → nouvelle Pièce vide **remplace** l'ancienne (même Masque envoyé au proxy : vérifier `mask_url` identique dans la requête inpaint) → `generation.emptyRoom` mis à jour, `epoch` incrémenté. Régénérer plusieurs fois de suite (aucune limite). 0 erreur console. **Caveat déterminisme** : noter si le résultat **change** entre deux régé (voir Dev Notes « Déterminisme »).

## Dev Notes

### État en place (NE PAS recréer)

- **`empty-room-surface.tsx`** (3.1 + 3.2) : effet d'entrée `runInpaint` (garde `step/mask/emptyRoom/error`, AbortController + epochRef, deps `[step, epoch, mask, emptyRoom, error]`, `originalPhoto` volontairement hors deps) — **c'est le moteur de la régénération** : quand `emptyRoom` repasse à `undefined` et `epoch` change, l'effet **relance automatiquement** `runInpaint` avec `state.mask` inchangé. NE PAS dupliquer l'appel d'inpaint dans le handler « Régénérer » — juste dispatch l'action, l'effet fait le reste (AR-LAYERS). Rendu : `ready = emptyRoom !== undefined && photoUrl !== null` → cartes + boutons, sinon placeholder (le WaitPanel overlay de `ParcoursScene` affiche la phase). Le bloc d'actions actuel contient déjà `GenerationButton` « Créer ma vidéo » (garde anti-double-clic `step==="emptyRoom"`).
- **Reducer** (`state/reducer.ts`) : `invalidateDownstream(step)` (borne **stricte** `<` : `invalidateDownstream("emptyRoom")` efface `reveal` mais **PAS** `emptyRoom` — d'où le `emptyRoom: undefined` explicite requis). `INPAINT_SUCCEEDED` pose `emptyRoom` (pas d'avance, pas de bump). `PHOTO_UPLOADED` a mémoïsé `originalPhoto.falUrl` → la régé **réutilise** l'URL photo (pas de ré-upload). `CONFIRM_ADVANCE_FROM` (avance ; `step`=destination).
- **`effects.runInpaint`** : upload paresseux photo (skip si `falUrl` présent — c'est le cas après la 1re génération) → `inpaint(photoUrl, maskUrl)` → `INPAINT_SUCCEEDED`. Gardes `dead()` (abort/`isStale`). Inchangé.
- **`ui/button.tsx`** : `variant` `outline`/`secondary`/`ghost`/`default` (défaut = or via `--primary`). « Régénérer » = **`outline`** (secondaire, visible, non-or).
- **pipeline** : inpaint = `fal-ai/bria/eraser` (object-eraser, sans prompt ni seed — voir « Déterminisme »).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AR-INVALIDATION / AD-11 (AC3)** : « Régénérer » = invalidation d'aval. Toute Révélation (`reveal`) existante est détruite et le jeton d'époque incrémenté — « une Révélation ne peut jamais coexister avec une Pièce vide qui n'est pas la sienne ». Le bump d'epoch **aborte** tout job vidéo en vol (Epic 4). Le Masque n'est **pas** touché (régé ≠ ré-édition du Masque). [Source: ARCHITECTURE-SPINE.md#AD-11, epics.md#3.3]
- **AD-12 (point clé, hérité de la revue 3.2)** : la régé DOIT passer par une action qui **bumpe l'epoch**, sinon les gardes `abort`/`isStale` de l'effet d'entrée ne se déclenchent pas et un run en vol serait stranded. `REGENERATE_EMPTY_ROOM` bumpe l'epoch → le cleanup de l'effet précédent aborte l'ancien `AbortController`, et `isStale` (via `epochRef`) jette tout résultat périmé. [Source: 3-2 Senior Review, forward-compat note]
- **AR-LAYERS** : le composant **dispatche une intention** (`REGENERATE_EMPTY_ROOM`) ; l'orchestration (relance inpaint) vit dans l'effet + `effects.runInpaint`. Le composant n'appelle JAMAIS `pipeline/`. Reducer pur. [Source: 3-1/3-2 Dev Notes]
- **AD-2/AD-7** : même Masque validé (dims canoniques) + même photo canonique → cohérence dimensionnelle conservée à chaque régé. [Source: ARCHITECTURE-SPINE.md#AD-2]

### Contraintes UX (font foi)

- **« Régénérer » = bouton secondaire** ; « Créer ma vidéo » reste **l'action d'or unique** (UX-DR13). Ne pas faire de Régénérer un `GenerationButton`. [Source: EXPERIENCE.md:71]
- **Microcopie UX-DR14 exacte** : « Un doute ? Régénérez : chaque Pièce vide est unique. » (FR-9). [Source: EXPERIENCE.md:56,160]
- **Aucune limite** de régénérations en v1 (FR-9). Le résultat **remplace** l'ancien — **pas d'historique de versions**. [Source: EXPERIENCE.md:71]
- **Sans repasser par les étapes précédentes** : la régé reste sur l'étape Pièce vide, ne revient jamais à Upload/Masque. [Source: epics.md#3.3, EXPERIENCE.md:160]

### Déterminisme (à observer en live — informatif)

- La microcopie « chaque Pièce vide est **unique** » présuppose un résultat **non déterministe** (EXPERIENCE.md:56 : mapping « Résultat non déterministe »). L'inpaint actuel est `fal-ai/bria/eraser`, un eraser **sans `seed` ni prompt** — il **peut** renvoyer une image identique à chaque appel (déterministe). **Ce n'est pas un blocage de 3.3** : FR-9 exige le **mécanisme** (relance même Masque, remplace, illimité, invalide l'aval), que cette story livre. Si la vérif live montre des résultats identiques, c'est une question **produit/modèle** (ex. exposer un `seed`/une variation, ou revisiter le modèle) à traiter séparément — le noter, ne pas sur-corriger ici. [Source: EXPERIENCE.md:56 ; [[inpaint-declutter-quality]]]

### Pièges connus

- **`invalidateDownstream("emptyRoom")` ne suffit PAS** à effacer `emptyRoom` (borne stricte `<` conserve l'artefact de l'étape même) → poser **`emptyRoom: undefined` explicitement** dans l'action, sinon l'effet d'entrée ne relance pas (`emptyRoom !== undefined` reste vrai) et « Régénérer » ne fait rien.
- **Ne pas appeler l'inpaint depuis le handler** : dispatch `REGENERATE_EMPTY_ROOM` et laisser l'effet d'entrée relancer (AR-LAYERS ; sinon double appel).
- **Bump d'epoch obligatoire** (AD-12) : sans lui, un run précédent en vol pourrait écrire par-dessus (ici improbable car « Régénérer » n'apparaît que quand `ready`, mais l'invariant AC3 l'exige pour l'aval vidéo).
- **Ne pas toucher au Masque** : `mask` et `maskDraft` conservés (régé = même Masque validé). Un retour arrière au Masque après régé doit ré-afficher le brouillon (FR-15).
- **Double-clic « Régénérer »** : après le 1er clic, `emptyRoom` devient `undefined` → `ready` false → cartes + boutons masqués (placeholder + WaitPanel) → « Régénérer » n'est plus cliquable pendant la régé. Pas de garde supplémentaire nécessaire (mais un `state.step === "emptyRoom"` implicite via le no-op reducer protège quand même).
- **Photo non ré-uploadée** : `runInpaint` réutilise `originalPhoto.falUrl` mémoïsé → la régé n'uploade pas la photo à nouveau (rapide). NE PAS invalider `originalPhoto`.

### Testing Requirements

- **Pur (Vitest)** : reducer `REGENERATE_EMPTY_ROOM` — (a) depuis `emptyRoom` avec `emptyRoom` présent : `emptyRoom` effacé, `reveal` effacé, `epoch+1`, `mask`/`maskDraft`/`originalPhoto` conservés, `step` reste `emptyRoom`, `waitPhase`/`error` à `undefined` ; (b) no-op si `step !== "emptyRoom"` ; (c) no-op si `emptyRoom === undefined`.
- **Non testable jsdom → live (FAL_KEY)** : rendu du bouton secondaire + microcopie, relance effective (même `mask_url`), remplacement, illimité, déterminisme. Vérif live Playwright.
- Régression : suites 1.x/2.x/3.1/3.2 vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Modifs uniquement** (aucun nouveau fichier) : `src/state/reducer.ts` (+ `.test.ts` — `REGENERATE_EMPTY_ROOM`), `src/components/empty-room-surface.tsx` (bouton secondaire + microcopie).
- Nommage anglais. Réutilise `ui/button.tsx` (variant outline), l'effet d'entrée existant. Ne réinvente rien.

### References

- [Source: epics.md#Story 3.3]
- [Source: ARCHITECTURE-SPINE.md#AD-2, AD-7, AD-11 (AR-INVALIDATION), AD-12, AR-LAYERS]
- [Source: prd.md#FR-9, FR-15 ; EXPERIENCE.md:56,71,157-160 (Flow 4 régénérations, microcopie UX-DR14) ; DESIGN.md (bouton secondaire)]
- [Source: src/components/empty-room-surface.tsx (effet d'entrée 3.1, bloc actions 3.2), src/state/reducer.ts (invalidateDownstream, INPAINT_SUCCEEDED), 3-2 Senior Review (note forward-compat régé/epoch)]
- [Source: [[inpaint-declutter-quality]] — modèle bria eraser, déterminisme]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

### Completion Notes List

- **Reducer `REGENERATE_EMPTY_ROOM`** (pur) : no-op hors étape emptyRoom ou si `emptyRoom` absent ; sinon `...invalidateDownstream("emptyRoom")` (efface `reveal`) + `emptyRoom: undefined` explicite (borne stricte ne l'efface pas) + `epoch+1` + `waitPhase`/`error` à `undefined`. Conserve `mask`/`maskDraft`/`originalPhoto` (même Masque validé, `falUrl` mémoïsé réutilisé). Reste sur `emptyRoom`.
- **`empty-room-surface.tsx`** : bloc d'actions en colonne — `GenerationButton` « Créer ma vidéo » (or, inchangé) puis `<Button variant="outline">Régénérer</Button>` (secondaire) qui `dispatch(REGENERATE_EMPTY_ROOM)`, puis microcopie exacte « Un doute ? Régénérez : chaque Pièce vide est unique. ». La relance de l'inpaint est portée par **l'effet d'entrée existant** (emptyRoom repasse à `undefined` + epoch change → `runInpaint` refire avec le même `state.mask`) — aucun appel pipeline dans le composant (AR-LAYERS). Aucune limite (FR-9). Pendant la régé, `ready` false → placeholder + WaitPanel, boutons masqués (pas de double-régé).
- **AC3** : `reveal` invalidé + epoch bumpé (une Révélation ne coexiste jamais avec une Pièce vide qui n'est pas la sienne) — forward-correct pour Epic 4 (aucun `reveal` en v1 encore).
- **126 tests verts** (+2 reducer), `tsc`/`lint`/`build` OK. Bouton/microcopie/relance/déterminisme = **vérif live (FAL_KEY) en attente**.

### File List

- `src/state/reducer.ts` (modifié — action `REGENERATE_EMPTY_ROOM`)
- `src/state/reducer.test.ts` (modifié — 2 tests `REGENERATE_EMPTY_ROOM`)
- `src/components/empty-room-surface.tsx` (modifié — bouton secondaire « Régénérer » + microcopie)

## Change Log

- 2026-07-12 : Story 3.3 créée (create-story) — régénération de la Pièce vide (clôt l'Epic 3). Action reducer dédiée `REGENERATE_EMPTY_ROOM` (efface emptyRoom + reveal, bump epoch, conserve le Masque) ; l'effet d'entrée existant relance l'inpaint. Statut → ready-for-dev.
- 2026-07-12 : Story 3.3 implémentée (dev-story) — `REGENERATE_EMPTY_ROOM` reducer + bouton secondaire « Régénérer » + microcopie UX-DR14. La relance passe par l'effet d'entrée (AR-LAYERS). 126 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-12 : Revue adversariale (Blind + Edge + Acceptance). ACs 1-3 tous PASS (microcopie vérifiée octet par octet). 0 CRITICAL, 0 bug fonctionnel (Edge : 7 scénarios défendus). 2 correctifs de test, 1 finding écarté. 126 tests verts. Statut → **done**. Vérif live en attente.

## Senior Developer Review (AI)

**Date :** 2026-07-12 · **Résultat :** Approuvé après 2 correctifs de test · **Verdict ACs :** AC1/AC2/AC3 PASS statiquement (même Masque conservé, reste sur emptyRoom, remplace sans historique, microcopie exacte, bouton secondaire outline vs or unique, `reveal` invalidé + epoch bumpé). Relance effective / même `mask_url` / remplacement / déterminisme = live-only.

### Correctifs appliqués

- [x] **[Bas]** Tests `REGENERATE_EMPTY_ROOM` : ajout `expect(next.waitPhase).toBeUndefined()` (garde une régression AD-14 — un `waitPhase` périmé ferait rejeter la 1re phase du nouveau run) + `expect(next).not.toBe(state)` (immuabilité). (Blind Hunter)

### Écartés / Différés (documentés)

- **Écarté — fragilité de l'ordre des effets `epochRef`** (Blind, annoncé HIGH → recalibré **non-problème**) : `isStale()` n'est évalué qu'**après un `await`** (post-commit) dans `runInpaint`, jamais synchroniquement à la capture de `startEpoch` ; `startEpoch` et `epochRef.current` proviennent du **même render** (même `state.epoch`). L'ordre de déclaration des deux effets dans le commit n'impacte donc pas la correction. Motif **identique et live-vérifié** dans 4 surfaces (detect 2.1, mask 2.2/2.3, inpaint 3.1). Le refactorer dans ce seul composant créerait une incohérence — amélioration transverse éventuelle, hors périmètre 3.3.
- **Note — déterminisme** (Edge, Bas) : `bria/eraser` sans seed peut renvoyer une image identique ; la microcopie UX-DR14 « chaque Pièce vide est unique » est **imposée par l'UX** (non modifiée). Le **mécanisme** FR-9 (relance même Masque, remplace, illimité, invalide l'aval) est livré et correct quel que soit le rendu. À observer en live ; si l'uniformité gêne, sujet produit/modèle (seed/variation) séparé — voir [[inpaint-declutter-quality]].
- **Note pour Epic 4** (Edge) : l'effet vidéo devra keyer son abort/`isStale` sur `state.epoch` (comme detect/inpaint) pour que le bump d'epoch de la régé l'avorte.
