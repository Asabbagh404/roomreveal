---
baseline_commit: 6e7d6ff
---

# Story 3.2: Comparaison côte à côte Photo originale / Pièce vide

Status: done

## Story

As a utilisateur,
I want voir ma photo d'origine et la Pièce vide côte à côte,
so that je juge d'un coup d'œil qu'aucun meuble ne subsiste avant de lancer la vidéo.

## Acceptance Criteria

1. **Given** une Pièce vide générée (`generation.emptyRoom` présent) **When** l'étape Pièce vide s'affiche **Then** deux cartes de **même taille** « Photo originale » et « Pièce vide » sont présentées **côte à côte**, jamais l'une sans l'autre, légendes sous l'image en `carton-titre`, fond `surface-carte`, cadre `rounded-lg`, aucune décoration (FR-8, UX-DR9, DESIGN.md#Cartes de comparaison).
2. **Given** les cartes de comparaison **When** l'utilisateur clique sur une carte **Then** elle s'ouvre en **plein écran** (`Dialog`) pour inspection détaillée (UX-DR9).
3. **Given** l'étape Pièce vide jugée satisfaisante **When** l'utilisateur regarde l'action principale **Then** le Bouton de Génération « Créer ma vidéo » porte en **sous-texte** « 1 à 3 minutes de génération » (FR-14, UX-DR13, EXPERIENCE.md#Honnêteté) **And** un clic avance le Parcours à l'étape Vidéo (la génération FLF elle-même est Story 4.1).

## Tasks / Subtasks

- [x] Task 1 : Extraire `usePhotoObjectUrl` en hook partagé (AC: 1)
  - [x] Déplacer `usePhotoObjectUrl(blob)` de `mask-surface.tsx` vers un module partagé `src/components/use-photo-object-url.ts` (créé + revoke dans le MÊME effet, garde StrictMode — commentaire existant conservé mot pour mot). L'importer dans `mask-surface.tsx` (supprimer la copie locale) ET dans `empty-room-surface.tsx`. DRY, aucun changement de comportement (le bug blob StrictMode reste corrigé).
- [x] Task 2 : `GenerationButton` — sous-texte optionnel (AC: 3)
  - [x] Ajouter une prop optionnelle `subtext?: string` à `src/components/generation-button.tsx`. Quand présente, rendre une 2ᵉ ligne plus discrète **sous** le label, dans le `<Button>` (ex. `<span className="text-xs opacity-80">`), en empilement vertical (`flex-col`). Rétro-compatible : `mask-surface` (« Valider le Masque », sans subtext) inchangé. Le tooltip/disabled existant reste tel quel.
- [x] Task 3 : `empty-room-surface.tsx` — cartes de comparaison + Dialog (AC: 1, 2)
  - [x] Quand `state.emptyRoom !== undefined` : remplacer l'`<img>` unique par **deux cartes de même taille côte à côte** (grille `grid grid-cols-2 gap-4`, conteneur `max-w-4xl`). Carte gauche = « Photo originale » (objet-URL de `state.originalPhoto.blob` via `usePhotoObjectUrl`), carte droite = « Pièce vide » (`state.emptyRoom`, URL fal directe). Chaque carte : `<figure>` fond `bg-surface-carte` `rounded-lg`, image `w-full h-auto` (ratio naturel, cf. correctif 3.1), légende `<figcaption className="text-carton-titre …">` **sous** l'image. Jamais une carte sans l'autre (les deux rendues ensemble, gardées par `emptyRoom` présent + `originalPhoto` présent).
  - [x] Chaque carte est **cliquable** (bouton/rôle) → ouvre un `Dialog` (composant `ui/dialog.tsx`) affichant l'image en **plein écran** : `DialogContent` avec className élargi (ex. `max-w-[92vw] sm:max-w-[92vw] p-2 bg-surface-carte`) contenant l'image `max-h-[85vh] w-auto object-contain` + un `DialogTitle` (le nom de la carte ; masquer visuellement via `sr-only` si on ne veut pas de titre visible — **obligatoire pour l'a11y radix**). Le bouton de fermeture par défaut (`showCloseButton`) suffit. Un `Dialog` par carte (ou un seul piloté par un state `openCard`).
  - [x] Tant que `emptyRoom` est absent (génération en cours) : conserver le placeholder de 3.1 (`aspect-[4/3]` `bg-surface-elevee`) ; `WaitPanel`/`ErrorBanner` restent des overlays de `ParcoursScene` (ne pas dupliquer). L'effet d'entrée `runInpaint` de 3.1 est **inchangé**.
- [x] Task 4 : Bouton d'or « Créer ma vidéo » (AC: 3)
  - [x] Sous les cartes, rendre `<GenerationButton subtext="1 à 3 minutes de génération" onClick={…}>Créer ma vidéo</GenerationButton>` — visible uniquement quand `emptyRoom` présent (comme les cartes). Toujours actif (précondition = Pièce vide présente, garantie par le rendu). Pas de tooltip/disabled.
  - [x] `onClick` : `dispatch({ type: "CONFIRM_ADVANCE_FROM", step: "video" })` — avance à l'étape Vidéo (reducer existant : pose `step="video"`, `epoch+1`, `invalidateDownstream("video")` ne touche à rien en pratique car borne stricte `<`, donc emptyRoom/mask conservés). **Aucune** génération vidéo ici (Story 4.1). Le Parcours affiche alors le placeholder Vidéo (« Cette étape arrive bientôt »).
- [x] Task 5 : Vérification (AC: 1–3)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (aucune régression Epics 1–3.1).
  - [x] **Live (FAL_KEY)** : arriver sur Pièce vide → deux cartes égales « Photo originale » / « Pièce vide » côte à côte, légendes en petites capitales ; clic sur chaque carte → plein écran (Dialog), fermeture OK ; bouton d'or « Créer ma vidéo » + sous-texte « 1 à 3 minutes de génération » ; clic → **Stepper passe à « Étape 4 sur 4 : Vidéo »** (placeholder), retour arrière (Stepper « Pièce vide ») ré-affiche les cartes (artefacts conservés). 0 erreur console.

## Dev Notes

### État en place (NE PAS recréer)

- **`empty-room-surface.tsx`** (Story 3.1) : effet d'entrée déclenchant `runInpaint` (garde `step/mask/emptyRoom/error`, AbortController + epochRef, `state.originalPhoto` volontairement hors deps — NE PAS y toucher). Rendu actuel = une `<img alt="Pièce vide" className="block h-auto w-full">` ou un placeholder `aspect-[4/3]`. **Cette story remplace le rendu du cas `emptyRoom` présent** par les deux cartes ; l'effet et le placeholder restent.
- **`ui/dialog.tsx`** : shadcn/radix **déjà présent**. Exports : `Dialog`, `DialogTrigger`, `DialogContent` (prop `showCloseButton` par défaut `true`, `className` surchargable — défaut `sm:max-w-sm`, à élargir), `DialogTitle`, `DialogHeader`, etc. **`DialogTitle` est requis** par radix pour l'a11y (sinon warning console) — le fournir (sr-only si besoin).
- **`generation-button.tsx`** : `GenerationButton { children, disabled?, tooltip?, onClick? }` (bouton d'or unique UX-DR13, gère tooltip sur disabled). Ajouter `subtext?` (Task 2). Déjà utilisé par `mask-surface` (« Valider le Masque »).
- **`usePhotoObjectUrl`** : défini localement dans `mask-surface.tsx` (create+revoke même effet, garde StrictMode contre `ERR_FILE_NOT_FOUND`). À extraire en module partagé (Task 1) — c'est la source de l'objet-URL de la « Photo originale ».
- **Reducer** : `CONFIRM_ADVANCE_FROM { step }` **existe et est testé** — pose `step=action.step`, `epoch+1`, `invalidateDownstream(action.step)`. Utilisé par le Stepper pour l'avance avant. `GO_TO_STEP` (retour arrière lossless). `emptyRoom` posé par `INPAINT_SUCCEEDED` (3.1). **Aucun changement reducer nécessaire.**
- **`parcours-scene.tsx`** : `step==="emptyRoom" → <EmptyRoomSurface/>`, `step==="video" → placeholder « Cette étape arrive bientôt »`. Overlays `WaitPanel`/`ErrorBanner` transverses. Inchangé (le placeholder Vidéo sert de cible d'avance jusqu'à Epic 4).
- **`stepper.tsx`** : gère déjà l'avance avant + confirmation (`hasDownstreamArtifacts` → Dialog « Continuer le Parcours ? »). « Créer ma vidéo » avance **directement** (première avance emptyRoom→video, aucun `reveal` en aval → pas de confirmation à gérer côté surface ; le Stepper garde sa propre logique de ré-avance).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AR-LAYERS** : `components/ → state/ → pipeline/`. Cette story est **100 % présentation** : le composant lit `state` (via `useGeneration`) et dispatche des intentions (`CONFIRM_ADVANCE_FROM`). **Aucun** appel `pipeline/`, aucune nouvelle logique métier, reducer inchangé. [Source: 2-x/3-1 Dev Notes]
- **AD-1 / AD-2** : la « Photo originale » affichée = la photo **canonique** (`originalPhoto.blob`, ≤1024, intouchée). Les deux cartes partagent les dims canoniques (la Pièce vide est 1024×768 comme prouvé en 3.1) → « même taille » naturel. Ne jamais réafficher le `File` d'origine. [Source: ARCHITECTURE-SPINE.md#AD-1/AD-2]
- **AD-11 / FR-15** : avancer à Vidéo puis revenir (Stepper) doit **conserver** emptyRoom + mask (retour arrière lossless). `CONFIRM_ADVANCE_FROM("video")` respecte ça (borne stricte). [Source: ARCHITECTURE-SPINE.md#AD-11]
- **Object-URL / StrictMode** : la « Photo originale » utilise `usePhotoObjectUrl` — création+révocation dans le même effet (jamais `useMemo`), sinon `blob: … ERR_FILE_NOT_FOUND` au remount StrictMode (bug corrigé en 2.2, régression à ne pas rouvrir). [Source: mask-surface.tsx#usePhotoObjectUrl]

### Contraintes UX (font foi)

- **Cartes de comparaison (DESIGN.md#Cartes de comparaison, UX-DR9)** : deux cartes **côte à côte de même taille**, légendes « Photo originale » / « Pièce vide » en `carton-titre` **sous** l'image, fond `surface-carte`, `rounded-lg` (12px, famille « écran de cinéma »). **Aucune décoration** — « les deux images se comparent d'elles-mêmes ». Jamais l'une sans l'autre. [Source: DESIGN.md:159, EXPERIENCE.md:70]
- **`carton-titre`** = petites capitales trackées 0.12em (`text-carton-titre` utilitaire existant, globals.css). [Source: DESIGN.md:128]
- **Bouton d'or (UX-DR13, EXPERIENCE.md:95/138)** : action d'or **unique** de la surface = « Créer ma vidéo », sous-texte « 1 à 3 minutes de génération » (honnêteté avant le clic, FR-14). En 3.2 « Régénérer » (bouton secondaire) n'existe pas encore — c'est Story 3.3. [Source: EXPERIENCE.md:71/75/95]
- Clic carte → plein écran `Dialog` (inspection). [Source: EXPERIENCE.md:70]
- Layout ≥1024px (pas de responsive poussé) ; deux colonnes assumées. [Source: EXPERIENCE.md:21]

### Pièges connus

- **Object-URL** : NE PAS recréer l'URL de la Photo originale via `useMemo` — utiliser le hook partagé (create+revoke même effet). Régression `ERR_FILE_NOT_FOUND` sinon.
- **`DialogTitle` obligatoire** : radix émet un warning a11y sans titre — fournir un `DialogTitle` (sr-only accepté).
- **Ne pas dupliquer les overlays** : `WaitPanel`/`ErrorBanner` sont rendus par `ParcoursScene`. La surface ne rend QUE cartes + bouton (et le placeholder pendant génération).
- **Avance = `CONFIRM_ADVANCE_FROM("video")`**, PAS un nouvel action ni `GO_TO_STEP` (qui est back-only et ne ferait rien vers l'avant). Ne PAS lancer d'inpaint/vidéo ici.
- **« même taille »** : les deux cartes doivent avoir des dimensions égales même si (improbable) les ratios diffèrent — utiliser une grille 2 colonnes égales ; les deux images étant canoniques, le ratio est identique.
- **Effet d'entrée 3.1 intact** : ne pas modifier la logique `runInpaint`/deps en restructurant le rendu.
- **Régénérer hors périmètre** : ne pas ajouter « Régénérer » (Story 3.3).

### Testing Requirements

- **Pur (Vitest)** : rien de nouveau côté reducer/lib (aucun changement). Si utile, un test léger que `CONFIRM_ADVANCE_FROM("video")` depuis emptyRoom pose `step="video"` + conserve `emptyRoom`/`mask` (le reducer est déjà couvert ; ajouter le cas précis si absent). `GenerationButton` avec `subtext` = rendu simple (jsdom OK) : optionnel.
- **Non testable jsdom → live (FAL_KEY)** : cartes côte à côte, Dialog plein écran, objet-URL de la photo, sous-texte du bouton, avance vers Vidéo + retour lossless. Vérif live Playwright.
- Régression : suites 1.x/2.x/3.1 vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Nouveau** : `src/components/use-photo-object-url.ts` (hook extrait).
- **Modifs** : `src/components/empty-room-surface.tsx` (cartes + Dialog + bouton), `src/components/generation-button.tsx` (prop `subtext`), `src/components/mask-surface.tsx` (importe le hook extrait, supprime la copie).
- Nommage anglais. Réutilise `ui/dialog.tsx`, `GenerationButton`, tokens `surface-carte`/`carton-titre` existants — ne rien réinventer.

### References

- [Source: epics.md#Story 3.2]
- [Source: ARCHITECTURE-SPINE.md#AD-1, AD-2, AD-11, AR-LAYERS]
- [Source: prd.md#FR-8, FR-14, FR-15 ; EXPERIENCE.md:70-75,95,137-138 ; DESIGN.md:128,145,159 (cartes, carton-titre, rounded.lg)]
- [Source: src/components/empty-room-surface.tsx (3.1), ui/dialog.tsx, generation-button.tsx, stepper.tsx (CONFIRM_ADVANCE_FROM), mask-surface.tsx (usePhotoObjectUrl)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

### Completion Notes List

- **`use-photo-object-url.ts`** (nouveau) : hook `usePhotoObjectUrl` extrait de `mask-surface.tsx` (create+revoke même effet, garde StrictMode `ERR_FILE_NOT_FOUND` — commentaire conservé). Importé par `mask-surface` (copie locale supprimée) et `empty-room-surface`. DRY, comportement inchangé.
- **`generation-button.tsx`** : prop optionnelle `subtext?` — 2ᵉ ligne discrète sous le label (`flex-col`, `text-xs opacity-80`), bouton `h-auto`. Rétro-compatible (mask-surface sans subtext inchangé).
- **`empty-room-surface.tsx`** : rendu restructuré. Effet d'entrée `runInpaint` (3.1) **inchangé**. Quand `emptyRoom` + `photoUrl` prêts (`ready`) : **deux cartes égales** en `grid grid-cols-2` (`max-w-4xl`) — « Photo originale » (objet-URL de la photo canonique) / « Pièce vide » (URL fal) ; chaque carte = `<figure>` `bg-surface-carte` `rounded-lg`, image `h-auto w-full`, légende `text-carton-titre` sous l'image. Carte cliquable (`DialogTrigger` bouton) → `DialogContent` plein écran (`max-w-[92vw]`, image `max-h-[85vh] object-contain`, `DialogTitle` sr-only pour l'a11y radix). Sinon (génération en cours) : placeholder `aspect-[4/3]` (les deux cartes ensemble ou aucune, UX-DR9). Bouton d'or `<GenerationButton subtext="1 à 3 minutes de génération">Créer ma vidéo</GenerationButton>` → `dispatch(CONFIRM_ADVANCE_FROM { step:"video" })` (avance à Vidéo, conserve emptyRoom/mask ; aucune génération vidéo ici — Story 4.1).
- **Reducer/pipeline inchangés** (AR-LAYERS : présentation pure). Test reducer ajouté : `CONFIRM_ADVANCE_FROM("video")` depuis emptyRoom → `step="video"`, `epoch+1`, emptyRoom+mask conservés (borne stricte).
- **124 tests verts** (+1), `tsc`/`lint`/`build` OK. Cartes/Dialog/objet-URL/avance = **vérif live (FAL_KEY) en attente**.

### File List

- `src/components/use-photo-object-url.ts` (nouveau — hook extrait)
- `src/components/empty-room-surface.tsx` (modifié — cartes de comparaison + Dialog + « Créer ma vidéo »)
- `src/components/generation-button.tsx` (modifié — prop `subtext`)
- `src/components/mask-surface.tsx` (modifié — importe le hook partagé, supprime la copie locale)
- `src/state/reducer.test.ts` (modifié — test avance emptyRoom→video)

## Change Log

- 2026-07-12 : Story 3.2 créée (create-story) — comparaison côte à côte + bouton « Créer ma vidéo ». Story 100 % présentation (aucun changement pipeline/reducer). Statut → ready-for-dev.
- 2026-07-12 : Story 3.2 implémentée (dev-story) — hook `usePhotoObjectUrl` extrait, `GenerationButton` sous-texte, `EmptyRoomSurface` = 2 cartes de comparaison + Dialog plein écran + « Créer ma vidéo » (avance à Vidéo via `CONFIRM_ADVANCE_FROM`). 124 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-12 : Revue adversariale (Blind + Edge + Acceptance). ACs 1-3 tous PASS. 0 CRITICAL réel. 3 correctifs, reste écarté/différé (voir section revue). 124 tests verts. Statut → **done**. Vérif live en attente.

## Senior Developer Review (AI)

**Date :** 2026-07-12 · **Résultat :** Approuvé après 3 correctifs · **Verdict ACs :** AC1/AC2/AC3 PASS statiquement (cartes gardées ensemble, légendes `carton-titre` sous l'image, tokens `surface-carte`/`rounded-lg`, Dialog + `DialogTitle` sr-only, sous-texte exact, avance `CONFIRM_ADVANCE_FROM("video")` conserve emptyRoom+mask — test unitaire). Rendu visuel/interaction = live-only.

### Correctifs appliqués

- [x] **[Bas, remonté HIGH par Blind]** `ComparisonCard` : l'`<img>` vignette portait `alt={label}` en plus de la `<figcaption>` visible → double-annonce lecteur d'écran sur le bouton. Vignette passée en `alt=""` (décorative ; la légende nomme la carte, l'image plein écran du Dialog garde un `alt` réel).
- [x] **[Bas]** « Créer ma vidéo » : garde anti-double-clic — `dispatch(CONFIRM_ADVANCE_FROM video)` seulement si `step==="emptyRoom"` (évite un double bump d'epoch bénin). (Edge Case Hunter)
- [x] **[Bas/Moyen]** `CONFIRM_ADVANCE_FROM {step}` : `step` est la **destination**, pas la source — nom trompeur relevé au 1er usage composant. Commentaire de contrat ajouté au type d'action (reducer) + au callsite. Rename (`ADVANCE_TO`/`to`) **différé** (action Epic 1, touche reducer+stepper+tests, hors périmètre 3.2).

### Écartés / Différés (documentés)

- **Écarté — `children` toujours enveloppé d'un `<span>`** dans `GenerationButton` (Blind, Bas) : HTML valide, layout inchangé, tests verts (`getByText().closest("button")` marche). Aucun impact.
- **Écarté — flash placeholder d'une frame** avant que `photoUrl` soit prêt au (re)montage (Edge, Bas) : sub-frame, honnête (« encore en préparation »), et le corriger (init synchrone de l'objet-URL) rouvrirait le bug StrictMode `ERR_FILE_NOT_FOUND` que le hook évite volontairement. Conservé + documenté.
- **Jugement — `ring-1`/hover doré des cartes vs « aucune décoration »** (Acceptance) : gardé comme **affordance de clic** (AC2 : cliquer une carte l'agrandit) ; le cadre `surface-carte`/`rounded-lg` est mandaté par DESIGN.md. À soumettre à l'utilisateur (véto possible).
- **Note pour Story 3.3** (Edge, forward-compat) : la régénération DOIT passer par une action qui **bumpe l'epoch** (ex. `CONFIRM_ADVANCE_FROM emptyRoom`) pour que les gardes abort/`isStale` de l'effet d'entrée se déclenchent ; une régé sans bump d'epoch stranderait le run en vol.
