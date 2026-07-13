---
baseline_commit: 816742e
---

# Story 5.4: Ajout d'objet par texte (Ajouter)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur en mode édition,
I want dessiner une zone, décrire un objet au texte et l'y faire apparaître,
so that j'enrichis la pièce (« pot de fleur », « tableau », …) avec un contrôle spatial précis.

## Acceptance Criteria

1. **Given** l'étape `editor`, **When** l'utilisateur regarde la barre d'action, **Then** une bascule **Enlever / Ajouter** est présente (Enlever actif par défaut) ; passer sur « Ajouter » fait apparaître un **champ texte** (placeholder ex. « pot de fleur, tableau… »).
2. **Given** l'opération « Ajouter » sélectionnée, **When** la zone est vide OU le texte est vide, **Then** « Appliquer » est **désactivé** (pour « Enlever », seule la zone compte, comportement 5.3 inchangé).
3. **Given** une zone dessinée, « Ajouter » et un texte saisi, **When** l'utilisateur clique « Appliquer », **Then** `runEdit` appelle `editAdd(imageUrl, maskUrl, prompt)` → `flux-pro/v1/fill` (remplissage génératif masqué : l'objet décrit est généré **dans** la zone blanche, le reste de l'image préservé), avec le même cycle attente/succès (`EDIT_APPLIED`, boucle itérative) / erreur (`StepError "edit"`) que « Enlever ».
4. **Given** le rôle de modèle « add », **When** on configure le pipeline, **Then** `MODELS.editAdd = "fal-ai/flux-pro/v1/fill"` est déclaré (swappable), avec `TIMEOUTS_MS.editAdd` et l'endpoint **ajouté** à `FAL_ALLOWED_ENDPOINTS` (`/**` + exact), `@fal-ai/client` restant confiné à `src/pipeline/` (AD-5, AD-4).
5. **Given** le risque de qualité d'insertion (cohérence lumière/perspective d'un objet neuf), **When** la vérif live est faite, **Then** l'ajout est testé sur une vraie photo (« pot de fleur » dans une zone) ; le modèle étant swappable (`MODELS.editAdd`) et bench-ready, si flux-fill est insuffisant un bench flux-fill vs `bria/genfill` est réalisé et le résultat **remonté à l'utilisateur** pour choisir avant de verrouiller.

## Tasks / Subtasks

- [x] **Task 1 — Adaptateur `editAdd` + config (AC: 3, 4)**
  - [x] `pipeline/config.ts` : `MODELS.editAdd = "fal-ai/flux-pro/v1/fill"` ; `TIMEOUTS_MS.editAdd = 90_000` ; **ajouter** `${MODELS.editAdd}/**` et `${MODELS.editAdd}` à `FAL_ALLOWED_ENDPOINTS` (flux-fill n'y est plus depuis le swap 3.1→bria).
  - [x] `pipeline/edit.ts` : `editAdd(imageUrl, maskUrl, prompt, { signal, onPhase }): Promise<EditResult>` — même squelette que `editRemove` (controller chaîné, timeout `editAdd`→`makeStepError("edit")`, race, header 24h, `onQueueUpdate→onPhase`, throw-on-empty). Input `{ image_url, mask_url, prompt }` sur `MODELS.editAdd`. **Sortie flux-fill = `data.images[0].url`** (tableau, ≠ bria `data.image.url`) → `{ image }`. [ASSUMPTION calibrée live : flux-pro/v1/fill renvoie `images[]` ; le mapping est le seul point à ajuster si le modèle change.]
  - [x] `pipeline/index.ts` : exporter `editAdd`.
  - [x] Tests `edit.test.ts` (suite `editAdd`) : succès (lit `images[0].url`), input (`image_url`/`mask_url`/`prompt`), phases, timeout→StepError("edit"), throw-on-empty (`images: []` et `images: [{}]`).
  - [x] `config.test.ts` : `editAdd` dans MODELS + allowlist.
- [x] **Task 2 — `runEdit` élargi (« add ») (AC: 3)**
  - [x] `effects.ts` : signature `runEdit(state, dispatch, { operation: "remove" | "add"; prompt?: string; signal; isStale })`. Branche : `operation === "add"` → garde `prompt` non vide (trim) puis `editAdd(imageUrl, maskUrl, prompt)` ; sinon `editRemove(imageUrl, maskUrl)`. Reste identique (upload paresseux editBase, encode+upload mask, dead(), EDIT_APPLIED, SET_ERROR "edit"). Import `editAdd`.
  - [x] Tests `effects.test.ts` (suite `runEdit` add) : `operation:"add"` + prompt → `editAdd` appelé avec `(imageUrl, maskUrl, prompt)`, EDIT_APPLIED ; add sans prompt (vide/blanc) = no-op (ne pas appeler editAdd) ; réutilise les gardes existantes.
- [x] **Task 3 — UI bascule Enlever/Ajouter + champ texte (AC: 1, 2)**
  - [x] `editor-surface.tsx` : état local `operation: "remove" | "add"` (défaut `"remove"`) + `prompt: string`. Bascule à deux boutons (ou segmented) « Enlever » / « Ajouter » (langage DESIGN.md, actif = or). Quand `operation==="add"` : champ texte (`<input>`/shadcn, placeholder « pot de fleur, tableau… », lié à `prompt`).
  - [x] « Appliquer » : `disabled` si masque vide OU (`operation==="add"` && `prompt.trim()===""`) OU `applying`. `onClick` → `runEdit(state, dispatch, { operation, prompt: prompt.trim(), signal, isStale })`.
  - [x] Le champ texte ne doit PAS déclencher les raccourcis clavier du MaskCanvas (déjà géré : `isEditableTarget` ignore INPUT/TEXTAREA — vérifier que le champ est bien un `<input>`).
  - [x] Microcopy hint adaptée à l'opération (« Peignez la zone… » pour Enlever ; « Dessinez où placer l'objet et décrivez-le » pour Ajouter).
- [x] **Task 4 — Vérification & non-régression (AC: tous)**
  - [x] `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
  - [x] Live-verify (Playwright, :3000, FAL_KEY) : mode édition → upload → bascule « Ajouter » → dessiner une zone → saisir « pot de fleur » → « Appliquer » → **un pot de fleur apparaît dans la zone**, reste de l'image préservé, « Retouche n° 1 ». Puis « Enlever » sur le résultat (non-régression 5.3). 0 erreur console. Juger la qualité d'insertion ; si insuffisante → bench `bria/genfill` et remonter à l'utilisateur (AC5).

## Dev Notes

### Portée & décision
5.4 = **l'ajout d'objet par texte**, greffé sur l'éditeur itératif de 5.3. Le retrait (Enlever) et toute la boucle (`editBase`, `EDIT_*`, mesure dims, seeding mask, EditorSurface) existent déjà — 5.4 n'ajoute qu'un **2ᵉ modèle** (`editAdd`/flux-fill), **une branche** dans `runEdit`, et **la bascule + champ texte** dans l'UI. Le download + « Nouvelle image » restent en **5.5**. Aucune nouvelle action reducer (réutilise EDIT_APPLIED etc.).

### flux-pro/v1/fill — points de vigilance
- **Endpoint à ré-autoriser** : flux-fill avait été retiré de `FAL_ALLOWED_ENDPOINTS` au swap 3.1 (bria). Sans l'ajout, le proxy refusera l'appel (AR-PROXY). Bien ajouter `/**` + exact.
- **Sémantique du masque** : flux fill régénère la zone **blanche** selon le prompt — c'est exactement notre convention (zone dessinée = où l'objet apparaît, AD-7). Pas d'inversion.
- **Sortie** : `data.images[0].url` (tableau), contrairement à bria (`data.image.url`). Throw-on-empty doit gérer `images` absent/vide ET `images[0].url` absent/vide.
- **Pourquoi flux-fill ici** alors qu'on l'a retiré en 3.1 : en 3.1 on voulait *effacer* (flux fill *reconstruisait* du mobilier = mauvais) ; ici on veut *générer* du contenu dans la zone = précisément le comportement recherché. Aucun conflit : bria=remove, flux-fill=add.

### État actuel des fichiers touchés (UPDATE)
- **`src/pipeline/config.ts`** — `MODELS` (detect/inpaint/emptyRoomAuto/video), `TIMEOUTS_MS` (+ edit=90s en 5.3), `FAL_ALLOWED_ENDPOINTS` (detect/inpaint/emptyRoomAuto/video). **Changement** : + `editAdd` (model, timeout, allowlist). **À préserver** : entrées existantes.
- **`src/pipeline/edit.ts`** — contient `editRemove` (bria). **Changement** : + `editAdd` (flux-fill). Motif identique ; seuls l'input (`prompt`), le modèle et le mapping de sortie (`images[0]`) diffèrent. **À préserver** : `editRemove` inchangé.
- **`src/state/effects.ts`** — `runEdit({operation:"remove"})` (5.3). **Changement** : élargir l'union `operation` + `prompt`, brancher editAdd. **À préserver** : tout le corps (upload paresseux, encode/upload mask, gardes dead(), EDIT_APPLIED, SET_ERROR "edit").
- **`src/components/editor-surface.tsx`** — bouton unique « Appliquer » = remove (5.3). **Changement** : bascule operation + champ texte ; « Appliquer » passe `operation`+`prompt`. **À préserver** : EDIT_START, seeding, mesure dims (+onerror), AbortController/epoch, « Retouche n°X », MaskCanvas.
- **`src/pipeline/index.ts`**, **`edit.test.ts`**, **`config.test.ts`**, **`effects.test.ts`** — extensions.

### Contraintes d'architecture (spine)
- **AD-5/AR-PROXY** : `@fal-ai/client` seulement dans pipeline ; endpoint dans l'allowlist. **AD-12/AR-LAYERS** : appel dans `runEdit` (effects), jamais dans le composant. **AD-7** : masque verbatim (blanc = zone à générer). **AD-8** : `StepError "edit"` partagé remove/add (une seule étape UX). **AD-9** : header 24h. UI FR / code EN. **UX-DR13** : « Appliquer » reste l'unique action d'or ; la bascule est un contrôle secondaire (pas une 2ᵉ action d'or).

### Réutilisation
- `editRemove` (patron pour `editAdd`), `runEdit` (patron branche), `MaskCanvas`/`GenerationButton`/`isBufferEmpty`/`encodeMaskPng`/`uploadArtifact`. Champ texte : `<input>` stylé DESIGN.md ou composant shadcn existant s'il y en a un (`ui/input`?) — sinon un `<input>` simple avec les tokens.
- Bench (si besoin) : scratchpad jetable façon `scratchpad/bench.mjs` (bria/lama), même méthode que 3.4.

### Testing standards
- Vitest, adapters mockés à la frontière. RED→GREEN par task. Cible 80%. Live-verify pour la qualité d'insertion (jsdom ne rend pas le canvas). Ne pas casser les 201 tests existants (dont la suite `runEdit` remove).

### Project Structure Notes
- Pas de nouveau fichier composant (extension d'`editor-surface`). Nouveau : rien côté pipeline (extension d'`edit.ts`). Éventuel `ui/input.tsx` si absent.
- Pas de nouvelle dépendance. `MODELS.editAdd` swappable → un bench ne touche que config.ts.

### References
- [Source: docs/plans/2026-07-13-image-edit-mode-design.md#2-pipeline--modèles et #4] — editAdd = flux-fill masqué, swappable/bench-gate.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4]
- [Source: src/pipeline/edit.ts (editRemove — patron editAdd)]
- [Source: src/state/effects.ts (runEdit — branche à ajouter)]
- [Source: src/components/editor-surface.tsx (5.3 — bascule + champ à greffer)]
- [Source: src/pipeline/config.ts (MODELS/TIMEOUTS/allowlist ; flux-fill retiré en 3.1 → à ré-ajouter)]
- [Source: 5.3 done (editBase, runEdit remove, EditorSurface itératif), [[inpaint-declutter-quality]] (historique flux-fill)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- RED : suite `editAdd` (edit.test) + 2 tests `runEdit` add (effects.test) échouent avant impl → GREEN après config/adapter/effects.
- Aucun blocage tsc/lint. flux-fill ré-ajouté à l'allowlist (retiré au swap 3.1).

### Completion Notes List

- **config.ts** : `MODELS.editAdd = "fal-ai/flux-pro/v1/fill"`, `TIMEOUTS_MS.editAdd = 90_000`, `FAL_ALLOWED_ENDPOINTS` + flux-fill (`/**` + exact).
- **pipeline/edit.ts** : `editAdd(imageUrl, maskUrl, prompt)` — squelette identique à `editRemove`, input `{image_url, mask_url, prompt}`, sortie **`data.images[0].url`** (tableau flux) → `{image}`, StepError `edit`. `editRemove` inchangé. Export index.
- **effects.runEdit** : union `operation: "remove" | "add"` + `prompt` ; garde add sans prompt (trim) = no-op ; branche `editAdd`/`editRemove`. Reste du corps inchangé.
- **editor-surface.tsx** : bascule **Enlever / Ajouter** (aria-pressed, or actif, contrôle secondaire — « Appliquer » reste l'unique action d'or UX-DR13) + champ texte `<input aria-label="Objet à ajouter">` (ignoré par les raccourcis MaskCanvas via `isEditableTarget`). « Appliquer » désactivé si zone vide OU (add && prompt vide). Hint adapté à l'opération.
- **config.test** : editAdd dans MODELS + allowlist.
- **211 tests** (vs 201 ; +edit 6, +runEdit 3, +config 1), tsc/lint/build verts.
- **Live-verify (FAL_KEY)** : Éditer une image → upload → bascule « Ajouter » → champ « a potted plant » → zone dessinée → « Appliquer » → flux-fill renvoie un résultat (`v3b.fal.media/…`), « Retouche n° 1 », 0 erreur console. Capture envoyée à l'utilisateur pour juger la qualité d'insertion (AC5 — modèle swappable, bench bria/genfill si insuffisant).

### File List

- `src/pipeline/config.ts` (+ `config.test.ts`), `src/pipeline/edit.ts` (+ `edit.test.ts`), `src/pipeline/index.ts` — modifiés
- `src/state/effects.ts` (+ `effects.test.ts`) — modifiés
- `src/components/editor-surface.tsx` — modifié (bascule + champ texte)

### Change Log

- 2026-07-13 : Story 5.4 créée (create-story). Ajout d'objet : `MODELS.editAdd`=flux-pro/v1/fill (+ allowlist ré-ajoutée, timeout), adaptateur `editAdd` (sortie `images[0].url`), `runEdit` élargi `operation:"add"`+prompt, bascule Enlever/Ajouter + champ texte dans EditorSurface. Modèle swappable/bench-ready. Statut → ready-for-dev.
- 2026-07-13 : Story 5.4 implémentée en TDD (4 tasks) + live-verify + revue adverse 2 couches. 201 → **211 tests**, tsc/lint/build verts. 3 correctifs. Statut → review → **done**.

## Senior Developer Review (AI)

**Date :** 2026-07-13 · **Reviewers :** 2 sous-agents adverses (Correctness & Parity, Acceptance & Scope) · **Résultat :** Approuvé après 3 correctifs.

**Verdict :** **APPROVE** des deux côtés — AC1-AC5 tous PASS. Parité `editAdd`/`editRemove` **confirmée** sur tous les axes (controller chaîné, timeout, race, run.catch, header 24h, finally, onQueueUpdate) ; seules diffèrent les 3 différences voulues (modèle, `prompt`, sortie `images[0].url`). Garde output couvre les 4 formes dégénérées. Branche `runEdit` : garde prompt vide AVANT tout side-effect ; `trimmedPrompt` passé ; remove inchangé. Allowlist OK (`/**`+exact). Raccourcis clavier isolés (input ignoré par `isEditableTarget`). UX-DR13 respecté (bascule = contrôle secondaire, « Appliquer » seule action d'or). Scope propre (rien de 5.5), aucune nouvelle action reducer, AR-LAYERS/AD-5 OK, UI FR/code EN.

### Correctifs appliqués
- [x] **[Moyen — 2 reviewers]** Cas throw-on-empty manquants dans `edit.test` (editAdd) → test paramétré couvrant les 4 formes (`{}`, `images:[]`, `images:[{}]`, `images:[{url:""}]`).
- [x] **[Moyen — correctness]** Prompt « Ajouter » non réinitialisé après application → effet sur `epoch` qui vide le prompt après une retouche réussie (préservé en cas d'erreur — pas de bump epoch — pour re-tenter). Préservation au toggle documentée comme intentionnelle.
- [x] **[Bas]** Commentaires obsolètes corrigés (`FAL_ALLOWED_ENDPOINTS` « three models » → 5 modèles ; JSDoc `runEdit` « add arrives in 5.4 »).

### Écartés (documentés)
- Garde redondante dans `handleApply` (défense en profondeur, le bouton désactivé la couvre) — laissée.
- `TIMEOUTS_MS.edit` vs `editAdd` (deux clés à 90s) — séparées volontairement (flux est plus lourd, pourra diverger).
- **Qualité d'insertion** (AC5) : testée live (flux-fill renvoie un résultat cohérent), **capture remontée à l'utilisateur** pour arbitrage ; modèle swappable en 1 ligne (`MODELS.editAdd`), bench `bria/genfill` prêt si jugé insuffisant.
