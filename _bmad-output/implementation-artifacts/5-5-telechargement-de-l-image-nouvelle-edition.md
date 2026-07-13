---
baseline_commit: f46133f
---

# Story 5.5: Téléchargement de l'image & nouvelle édition

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur en mode édition,
I want télécharger l'image éditée et repartir sur une nouvelle photo,
so that je récupère mon résultat et j'enchaîne sans confusion ni perte accidentelle.

## Acceptance Criteria

1. **Given** une image de travail éditée (au moins une retouche appliquée), **When** l'utilisateur clique « Télécharger l'image », **Then** l'image courante (`editBase`) est téléchargée via `download-file.ts` (`downloadFile` : fetch → blob → objectURL → ancre `download` ; GET fal direct, sans re-hébergement — AD-4/AD-9), avec état occupé (« Téléchargement… ») et erreur inline en cas d'échec.
2. **Given** l'étape `editor`, **When** l'utilisateur clique « Nouvelle image », **Then** si des retouches ont été appliquées ET non téléchargées, une **confirmation** est demandée avant de repartir d'une zone d'upload vierge ; sinon le retour est direct. Le reset conserve `mode:"edit"` (via `RESET` — déjà mode-preserving depuis 5.1, `editBase`/`maskDraft` remis à zéro, epoch 0). (UX-DR16)
3. **Given** une édition en cours (au-delà de l'accueil/upload), **When** l'utilisateur rafraîchit ou ferme l'onglet, **Then** `beforeunload` avertit que le travail en cours sera perdu (UX-DR15, pas de reprise en v1) — comportement **déjà en place** depuis 5.1 (`mode !== undefined && step !== "upload"`), à vérifier de bout en bout.
4. **Given** les actions sous l'éditeur, **When** elles s'affichent, **Then** l'ordre et la hiérarchie visuelle sont cohérents avec le reste de l'app : « Nouvelle image » (ghost) · « Télécharger l'image » (or, action d'or unique — UX-DR13). La bascule Enlever/Ajouter + « Appliquer » (5.3/5.4) restent la zone d'action principale ; télécharger/nouvelle image sont des actions de clôture, visuellement distinctes.

## Tasks / Subtasks

- [x] **Task 1 — Téléchargement de l'image (AC: 1, 4)**
  - [x] `editor-surface.tsx` : état local `downloading`/`downloadError`/`hasDownloaded` + `mountedRef` (motif `reveal-player`). `handleDownload` : `downloadFile(source, "roomreveal-edition.png")` où `source = editBase.url ?? backgroundUrl` (le blob objectURL marche aussi : `fetch` sur un `blob:` renvoie le blob). Busy + erreur inline, gardes `mountedRef` (pas de setState après unmount).
  - [x] Bouton **« Télécharger l'image »** (`GenerationButton`, or) sous la zone d'action principale ; désactivé si l'image de travail n'est pas prête (`backgroundUrl === null`) ou pendant `downloading`. `setHasDownloaded(true)` au succès.
  - [x] Réutiliser `download-file.ts` **tel quel** (aucune modif ; déjà couvert par `download-file.test.ts`).
- [x] **Task 2 — « Nouvelle image » + confirmation (AC: 2, 4)**
  - [x] Bouton **« Nouvelle image »** (`Button variant="ghost"`). `handleNew` : si `retouchCount > 0 && !hasDownloaded` → ouvrir un `Dialog` de confirmation (« Repartir d'une nouvelle image ? Vos retouches non téléchargées seront perdues. » + Annuler / Continuer) ; sinon `dispatch({ type: "RESET" })` direct. Continuer → `RESET`.
  - [x] **Réutiliser `RESET`** (mode-preserving depuis 5.1 : `{...initialGeneration, mode}` → step upload, edit conservé, editBase/maskDraft vidés). **Ne PAS** créer d'action `RESET_EDIT` (redondante).
  - [x] Dialog via `@/components/ui/dialog` (motif `reveal-player`/`stepper`).
- [x] **Task 3 — Tests (AC: 1, 2)**
  - [x] `editor-surface` test (ou étendre) : « Télécharger l'image » appelle `downloadFile` (mocké) avec la source de l'image de travail ; « Nouvelle image » sans retouche → `RESET` direct (pas de dialog) ; avec retouche non téléchargée → dialog, « Continuer » → `RESET` ; après téléchargement → pas de dialog.
  - [x] Ne pas casser les tests existants (211).
- [x] **Task 4 — Vérification & non-régression (AC: tous)**
  - [x] `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
  - [x] Live-verify (Playwright, :3000, FAL_KEY) : édition → une retouche → « Télécharger l'image » → le fichier se télécharge (image éditée) ; « Nouvelle image » sans re-téléchargement → dialog de confirmation → Continuer → retour Upload en mode édition (choisir une 2ᵉ photo possible) ; `beforeunload` vérifié. 0 erreur console.

## Dev Notes

### Portée & décision — DERNIÈRE story du projet
5.5 = **la clôture du cycle d'édition** : récupérer l'image + recommencer. Purement UI (composant `EditorSurface`), **aucune** nouvelle action reducer, **aucun** appel pipeline, **aucun** nouveau modèle. Réutilise `downloadFile` (4.3) et `RESET` (mode-preserving depuis 5.1). Termine l'Epic 5.

### Réutilisations décisives (ne PAS réinventer)
- **`RESET`** : depuis 5.1, `RESET` retourne `{...initialGeneration, mode: state.mode}` → en mode edit, repart sur Upload en conservant `mode:"edit"`, `editBase`/`maskDraft` remis à `undefined`. C'est EXACTEMENT « Nouvelle image ». Pas de `RESET_EDIT`.
- **`downloadFile(url, filename)`** (`src/lib/download-file.ts`) : fetch→blob→objectURL→`<a download>`→revoke différé. Marche pour une URL fal cross-origin (GET public, CORS OK — prouvé en 4.3 sur le MP4) ET pour un `blob:` objectURL (fetch sur blob: renvoie le blob). Ne pas le modifier.
- **Pattern download/reset** de `reveal-player.tsx` (4.3/4.4) : `downloading`/`downloadError`/`hasDownloaded`/`mountedRef` + `confirmingNew` Dialog. Copier ce motif dans `EditorSurface`.
- **`beforeunload`** : `parcours-scene.tsx` l'active déjà pour `mode !== undefined && step !== "upload"` (5.1) → couvre l'étape `editor`. Rien à ajouter (AC3 = vérification).

### État actuel du fichier touché (UPDATE)
- **`src/components/editor-surface.tsx`** — aujourd'hui : bascule Enlever/Ajouter + champ texte + « Appliquer » (5.3/5.4), « Retouche n° X », `editBase`, effets (EDIT_START, seeding, mesure dims, reset prompt). **Changement** : ajouter la rangée d'actions de clôture (« Nouvelle image » ghost + « Télécharger l'image » or) + le Dialog de confirmation + les états download/hasDownloaded. **À préserver** : toute la logique 5.3/5.4 (opération, prompt, apply, boucle), les effets, le MaskCanvas.
- **Où placer les boutons** : sous la zone d'action principale (toggle + input + Appliquer). « Appliquer » reste l'action d'or de la retouche ; « Télécharger l'image » est l'action d'or de clôture. Deux `GenerationButton` or dans des contextes distincts (retouche vs clôture) est acceptable — mais s'assurer visuellement qu'il n'y a pas d'ambiguïté (séparer les deux zones, ex. un séparateur ou un espacement). Alternative si ambigu : « Télécharger l'image » en `Button` outline plutôt que GenerationButton. Choisir la variante la plus claire (UX-DR13 : une seule action d'or par contexte).

### Contraintes d'architecture (spine)
- **AD-4/AD-9** : téléchargement = GET fal direct, jamais re-hébergé (downloadFile). **AD-3** : `RESET` = perte assumée, serveur sans état. **AR-LAYERS** : composant lit l'état + dispatch ; `downloadFile` est un util lib feuille (pas de pipeline). **UX-DR15/DR16** : garde beforeunload + confirmation avant perte. UI FR / code EN.

### Testing standards
- Vitest. Mocker `@/lib/download-file` au besoin (browser fetch). Tests composant légers (rendu, dialog, dispatch RESET). Ne pas re-tester `downloadFile` (déjà couvert). Live-verify le téléchargement réel (le fichier).

### Project Structure Notes
- Aucun nouveau fichier (extension d'`editor-surface`). `download-file.ts` réutilisé. Pas de nouvelle dépendance.

### References
- [Source: docs/plans/2026-07-13-image-edit-mode-design.md#3-composants--ui] — « Télécharger l'image » + « Nouvelle image » (confirm si non téléchargé).
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5]
- [Source: src/lib/download-file.ts + download-file.test.ts (4.3)]
- [Source: src/components/reveal-player.tsx (4.3/4.4 — motif download/hasDownloaded/confirm Dialog)]
- [Source: src/state/reducer.ts (RESET mode-preserving depuis 5.1)]
- [Source: src/components/parcours-scene.tsx (beforeunload mode-aware depuis 5.1)]
- [Source: 5.3/5.4 done (EditorSurface, editBase, boucle)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Purement UI, aucun blocage. `downloadFile` réutilisé tel quel. Décision : « Nouvelle image » = `RESET` (déjà mode-preserving depuis 5.1) — pas de `RESET_EDIT`.

### Completion Notes List

- **editor-surface.tsx** : rangée d'actions de clôture (séparateur `border-t`) — **« Nouvelle image »** (ghost) + **« Télécharger l'image »** (`GenerationButton` or, la primaire de clôture — distincte de « Appliquer » qui est celle de la retouche, zones séparées, UX-DR13). États `downloading`/`downloadError`/`hasDownloaded`/`mountedRef` + `confirmingNew` (motif reveal-player). `handleDownload` → `downloadFile(backgroundUrl, "roomreveal-edition.png")` (marche pour URL fal cross-origin ET blob:). `newImage` → confirm Dialog si `retouchCount>0 && !hasDownloaded`, sinon `RESET` direct. Dialog Annuler/Continuer.
- **Réutilisations** : `RESET` (mode-preserving 5.1), `downloadFile` (4.3, inchangé), Dialog (ui/dialog), `beforeunload` (déjà actif en edit depuis 5.1 — AC3 = vérif).
- **editor-surface.test.tsx** (nouveau) : download appelle downloadFile (source + filename) ; « Nouvelle image » sans retouche → RESET direct (pas de dialog, retour Upload) ; download désactivé si pas prêt.
- **214 tests** (vs 211), tsc/lint/build verts.
- **Live-verify (FAL_KEY)** : édition → 1 retrait → « Nouvelle image » → **dialog de confirmation** (édité+non-téléchargé) → Annuler → **« Télécharger l'image » → fichier `roomreveal-edition.png` PNG 1024×768 téléchargé** (fetch fal cross-origin OK, pas d'erreur CORS) → « Nouvelle image » (après download) → **pas de dialog, RESET direct → retour Upload en mode édition**. beforeunload hérité (5.1). 0 erreur console.

### File List

- `src/components/editor-surface.tsx` — modifié (actions de clôture + Dialog + download/reset)
- `src/components/editor-surface.test.tsx` — **nouveau**

### Change Log

- 2026-07-13 : Story 5.5 créée (create-story). Clôture Epic 5 : « Télécharger l'image » (réutilise downloadFile) + « Nouvelle image » (réutilise RESET mode-preserving + confirm Dialog si retouche non téléchargée). Purement UI (EditorSurface), aucune nouvelle action reducer/pipeline. beforeunload déjà en place (5.1). Statut → ready-for-dev.
- 2026-07-13 : Story 5.5 implémentée + live-verify + revue adverse 2 couches. 214 → **216 tests**, tsc/lint/build verts. 3 correctifs. Statut → review → **done**. **Clôt l'Epic 5.**

## Senior Developer Review (AI)

**Date :** 2026-07-13 · **Reviewers :** 2 sous-agents adverses (Correctness, Acceptance & Scope) · **Résultat :** Approuvé après 3 correctifs.

**Verdict :** AC1/AC3/AC4 PASS d'emblée ; AC2 PARTIAL → corrigé (voir ci-dessous). Vérifiés : download non-nul gardé, `mountedRef` guards, `downloadFile` inchangé (AD-4/AD-9), `RESET` mode-preserving vide editBase/maskDraft (aucune fuite ; l'EditorSurface se démonte au retour Upload → états locaux repartis à neuf), Dialog Annuler/Continuer correct, aucune régression 5.3/5.4, scope propre (aucune action reducer/pipeline/dép), AR-LAYERS/convention OK.

### Correctifs appliqués
- [x] **[Haut — correctness, cas (d)]** `hasDownloaded` booléen survivait à une nouvelle retouche → download puis re-édition puis « Nouvelle image » sautait le dialog et **perdait la retouche silencieusement**. Remplacé par `downloadedAtEpoch` (epoch au moment du download) ; `hasDownloaded = downloadedAtEpoch === state.epoch` → automatiquement ré-armé dès qu'une retouche bumpe l'epoch.
- [x] **[Haut — acceptance]** Chemin confirm-dialog (AC2, requis par Task 3) non testé (retouchCount toujours 0 en test). Ajout de 3 tests via un `Capture` (dispatch) + stub `Image` : dialog quand retouche non téléchargée, cas (d) (download→re-édition→dialog), + le direct-reset existant.
- [x] **[Bas — acceptance]** Garde `backgroundUrl === null` → `!backgroundUrl` (+ `ready = !!backgroundUrl && …`) : correct pour `null` ET `undefined` (hygiène de type).

### Écartés (documentés)
- `mountedRef` initialisé à `true` + resynchronisé dans l'effet (MEDIUM) : **pattern identique à `reveal-player`** (éprouvé, StrictMode-safe). Conservé par parité.
- Deux `GenerationButton` or (« Appliquer » retouche / « Télécharger » clôture) : zones séparées par `border-t`, contextes distincts — accepté (précédent reveal-player, UX-DR13 respecté par séparation).
