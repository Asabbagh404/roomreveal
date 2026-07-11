---
baseline_commit: 40b833c
---

# Story 2.2: Édition manuelle du Masque au pinceau et à la gomme

Status: done

## Story

As a utilisateur,
I want ajouter ou retirer des zones du Masque au pinceau et à la gomme, avec zoom pour les détails,
so that je corrige un meuble oublié ou une zone en trop exactement où il faut.

## Acceptance Criteria

1. **Given** l'étape Masque avec un Masque affiché **When** l'utilisateur peint avec le pinceau ou efface avec la gomme **Then** la zone est ajoutée/retirée du Masque avec un effet immédiat au trait (FR-6) **And** le curseur est un cercle à la taille de l'outil (UX-DR7).
2. **Given** la barre d'outils du Masque **When** l'utilisateur l'utilise **Then** pinceau et gomme sont mutuellement exclusifs, la taille est réglable au `Slider` (4–128 px), et annuler/rétablir couvre les 20 dernières actions (UX-DR8) **And** les raccourcis `B` (pinceau), `E` (gomme), `[` / `]` (taille), `Ctrl+Z` / `Ctrl+Shift+Z` (annuler/rétablir) fonctionnent sur l'étape Masque (UX-DR8).
3. **Given** le buffer d'édition du Masque **When** l'utilisateur peint, zoome (molette 100–400 %) ou pan (barre espace + drag) **Then** le buffer vit en résolution canonique 1:1 ; zoom et devicePixelRatio sont des transformations d'affichage, jamais de rééchantillonnage du buffer (AR-MASK-VERBATIM, UX-DR7) **And** le Masque est binaire : chaque pixel vaut 0 ou 255, sans anti-aliasing (AR-MASK-VERBATIM).
4. **Given** le brouillon du Masque en cours d'édition **When** les composants sont démontés/remontés (ex. navigation stepper) **Then** le brouillon survit dans `generation.maskDraft` (le canvas n'est qu'une vue), seule la pile d'undo UI locale est perdue (AR-MASK-DUAL).

## Tasks / Subtasks

- [x] Task 1 : Domaine — buffer d'édition binaire dans le reducer (AC: 3, 4)
  - [x] `src/state/types.ts` : ajouter `MaskBuffer { data: Uint8Array; width: number; height: number }` (binaire 0/255, dims canoniques). Étendre `MaskDraft` avec `buffer?: MaskBuffer` (le `detectedMaskUrl` reste — source du seed). Ajouter `width`/`height` (dims canoniques) à `OriginalPhoto` : le buffer et le PNG validé (Story 2.3) DOIVENT être strictement aux dims canoniques (AD-2, AD-7) — la source de vérité des dims est fixée à l'upload, pas re-décodée.
  - [x] `src/lib/resize.ts` : `normalizeUpload` retourne aussi `{ width, height }` (dims canoniques déjà calculées par `computeCanonicalDimensions`). Mettre à jour le mock du test upload-zone et `PHOTO_NORMALIZED`.
  - [x] `src/state/reducer.ts` : action pure `SET_MASK_BUFFER { buffer: MaskBuffer }` → remplace `maskDraft.buffer` immutablement (nouvel objet `maskDraft`, jamais de mutation en place). Sert au seed initial, à chaque trait validé, et à chaque undo/redo. Préserver AD-11/AD-14 : `invalidateDownstream("upload")` et `CONFIRM_ADVANCE_FROM`/`GO_TO_STEP` inchangés (maskDraft entier — url + buffer — est déjà invalidé en amont du step mask). Mettre à jour `reducer.test.ts`.
  - [x] `src/components/upload-zone.tsx` : passer `width`/`height` dans le payload `PHOTO_NORMALIZED`.

- [x] Task 2 : `src/lib/mask-buffer.ts` — opérations binaires pures + tests (AC: 1, 3)
  - [x] `createBlankBuffer(width, height): MaskBuffer` (tout à 0).
  - [x] `paintStroke(buffer, points: {x,y}[], radius, mode: "brush" | "eraser"): MaskBuffer` — rasterise des disques pleins le long des points interpolés (segments entre points consécutifs pour un trait continu sans trous), positionne 255 (brush) ou 0 (eraser). **Immuable** : ne mute jamais `buffer.data` (copie puis écrit). Pixels hors bornes ignorés (clamp). Rayon = taille outil / 2.
  - [x] Invariant binaire garanti par construction : seules les valeurs 0 et 255 sont écrites (jamais d'anti-aliasing — pas de couverture partielle en bordure de disque).
  - [x] Tests : un disque peint met exactement les pixels dans le rayon à 255 ; la gomme les remet à 0 ; buffer d'entrée inchangé (immutabilité) ; tout pixel ∈ {0,255} après N opérations ; points hors bornes n'écrivent rien ; trait à 2 points relie sans trou.

- [x] Task 3 : `src/lib/mask-history.ts` — pile annuler/rétablir 20 actions + tests (AC: 2, 4)
  - [x] `createHistory(initial: MaskBuffer): History` ; `push(history, buffer): History` (ajoute un état, plafonne à 20, jette le plus ancien au-delà, vide la pile redo) ; `undo(history)` / `redo(history)` → `{ history, buffer }` ; `canUndo`/`canRedo`. Structure **immuable** (nouveaux objets). État courant = sommet ; undo décale un curseur.
  - [x] Tests : push au-delà de 20 conserve les 20 derniers ; undo puis push vide le redo ; undo/redo restaurent le bon buffer ; canUndo/canRedo aux bornes ; l'historique est UI-local (pas dans le reducer — assumé perdu à la navigation, AC 4).

- [x] Task 4 : `src/lib/mask-tools.ts` — bornes & pas outils, purs + tests (AC: 2, 3)
  - [x] Constantes : `MIN_BRUSH = 4`, `MAX_BRUSH = 128`, `MIN_ZOOM = 1` (100 %), `MAX_ZOOM = 4` (400 %), pas de taille (`[`/`]`) et pas de zoom molette.
  - [x] `clampBrush(size)`, `stepBrush(size, dir)` (respecte les bornes), `clampZoom(z)`, `screenToBuffer({ clientX, clientY, rect, zoom, pan, bufferWidth, bufferHeight })` : mappe un point écran vers coord buffer canonique (annule le fit container, le zoom et le pan — devicePixelRatio géré à l'affichage, jamais dans le buffer). Pur, testable sans canvas.
  - [x] Tests : clamps aux bornes ; `stepBrush` monte/descend et sature ; `screenToBuffer` correct à zoom 1 sans pan, à zoom 2, avec pan non nul (cas de référence calculés à la main).

- [x] Task 5 : `src/lib/mask-raster.ts` — seed du buffer depuis le masque détecté (browser-only) (AC: 3)
  - [x] `rasterizeMaskUrl(url, width, height): Promise<Uint8Array>` : décode l'image du masque (URL fal, dims détection ~1536), la dessine sur un canvas offscreen aux **dims canoniques** (réduction 1536→canonique, AD-2 amendement), lit l'`ImageData`, **seuille** chaque pixel en binaire (alpha ou luminance > seuil → 255, sinon 0). Aucune valeur intermédiaire (AD-7). `crossOrigin = "anonymous"` sur l'`Image` (masque cross-origin fal — CORS validé en Story 2.1).
  - [x] ⚠️ Non testable en jsdom (pas de canvas/décodage image). Fonction minimale, typée, **vérifiée en live** (Task 8). Tagger `[LIVE-VERIFY]`.

- [x] Task 6 : `src/components/ui/slider.tsx` — composant shadcn Slider (AC: 2)
  - [x] Ajouter le Slider shadcn (radix `@radix-ui/react-slider`) au registre `ui/` (cohérent avec button/dialog/progress/tooltip existants ; style `radix-nova`, dark-only). Vérifier la dépendance radix (installer si absente).

- [x] Task 7 : `src/components/mask-surface.tsx` — éditeur canvas complet (AC: 1, 2, 3, 4)
  - [x] **Seed** : à l'entrée Masque, après `DETECT_SUCCEEDED`, si `maskDraft.buffer` absent : construire le buffer initial via `rasterizeMaskUrl(detectedMaskUrl, w, h)` (ou `createBlankBuffer` si `detectedMaskUrl === null`, cas préparé pour Story 2.4) puis `dispatch(SET_MASK_BUFFER)`. Garder l'orchestration async avec garde d'époque (AD-12) — réutiliser le motif `isStale`/`AbortController` déjà en place dans `mask-surface`.
  - [x] **Rendu** : `<canvas>` (via `devicePixelRatio` pour la netteté — DPR est une transfo d'affichage, jamais du buffer, AD-7) affichant la Photo originale plein cadre `rounded-lg` + overlay du buffer (fuchsia `masque-overlay` à 45 % + contour `masque-contour`, dérivé du buffer, pas d'une URL). Curseur = cercle à la taille de l'outil qui suit la souris (UX-DR7 / DESIGN).
  - [x] **Peinture** : pointer-down/move/up. Pendant le trait, peindre sur le canvas de vue (effet immédiat, FR-6) en accumulant les points ; au pointer-up, calculer le buffer final via `paintStroke`, `push` dans l'historique local, `dispatch(SET_MASK_BUFFER)`. Un seul dispatch par trait (pas par mousemove).
  - [x] **Barre d'outils** (flottante sous le canvas, `surface-elevee`) : boutons-icônes pinceau/gomme mutuellement exclusifs (actif = `or-lumineux`), `Slider` taille 4–128, boutons annuler/rétablir en ghost (désactivés aux bornes via `canUndo`/`canRedo`). Icônes lucide.
  - [x] **Zoom/pan** : molette → zoom 100–400 % centré curseur (`clampZoom`) ; barre espace + drag → pan. Transfos d'affichage uniquement (CSS transform ou transform du contexte canvas), jamais de rééchantillonnage du buffer (AC 3).
  - [x] **Raccourcis** (étape Masque uniquement, retirés au démontage) : `B`/`E` outil, `[`/`]` taille (`stepBrush`), `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo. Ne pas capturer quand le focus est dans un champ éditable ; `preventDefault` sur les combinaisons gérées.
  - [x] **Dual-life (AC 4)** : le buffer courant vit dans `generation.maskDraft.buffer` (reducer) ; le canvas se ré-hydrate depuis ce buffer au montage ; l'historique undo est un `useState`/`useRef` local, assumé perdu à la navigation. Aucun état pipeline local (AD-3).

- [x] Task 8 : Vérification live (FAL_KEY) + qualité (AC: 1, 2, 3, 4)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (logique pure couverte ≥ 80 %).
  - [x] Live (dev, StrictMode) : upload → détection → le masque détecté seed le buffer (overlay fuchsia identique à 2.1) → peindre ajoute au trait, gommer retire, curseur cercle correct → Slider + `[`/`]` changent la taille → `B`/`E` bascule → undo/redo (≥ 20) → zoom molette 100–400 % + pan espace, le trait reste net et aligné (pas de rééchantillonnage) → naviguer Upload↔Masque : le buffer survit, l'undo est réinitialisé.
  - [x] Capturer une note de vérification live dans les Completion Notes + Change Log.

## Dev Notes

### ⚠️ Limite de testabilité (canvas / jsdom)

Le cœur de cette story est du canvas (peinture, décodage image, zoom/pan, DPR, curseur) que **jsdom ne peut pas exécuter** (`HTMLCanvasElement.getContext` renvoie `null`). Discipline imposée : **extraire toute la logique pure en `lib/`** (buffer binaire, historique, bornes outils, mapping de coordonnées) et la tester exhaustivement en Vitest ; le composant `mask-surface.tsx` et `mask-raster.ts` restent minces et sont **vérifiés en live** avec `FAL_KEY` (dispo). Ne PAS mocker un faux canvas pour simuler la peinture — cela testerait le mock, pas le code. Suivre AR-TESTS.

### État en place (NE PAS recréer)

- **Domaine** : `state/types.ts` (`MaskDraft { detectedMaskUrl: string|null }`, `OriginalPhoto { blob, falUrl?, detectionBlob, detectionFalUrl? }`, `Generation`), `reducer.ts` (`PHOTO_NORMALIZED`, `DETECTION_UPLOADED`, `DETECT_SUCCEEDED` seed `maskDraft`, `GO_TO_STEP`, `CONFIRM_ADVANCE_FROM`, `SET_WAIT_PHASE` monotone, `SET_ERROR`, `CLEAR_ERROR`), `generation-context.tsx` (`useGeneration`, provider avec seed `initialState` pour tests), `step-error.ts`.
- **Effets** : `state/effects.ts` (`runDetect`, garde `dead()=abort||stale`, époque AD-12).
- **UI Masque** : `components/mask-surface.tsx` **existe** (Story 2.1 : lance la détection à l'entrée Masque + overlay fuchsia via CSS `mask-image` sur une URL). Cette story **remplace l'affichage CSS transitoire par l'éditeur canvas** — GARDER le déclenchement de détection (deps `[step, epoch, maskDraft, error, originalPhoto]`, hors `waitPhase` — la boucle d'abandon corrigée en 2.1 NE DOIT PAS réapparaître) et l'`epochRef` synchronisé en effet. Bug corrigé récemment : object URL de la photo créé/révoqué dans le MÊME `useEffect` (pas de `useMemo`) — conserver ce motif.
- **lib** : `resize.ts` (`normalizeUpload → {canonical, detection}`, `computeCanonicalDimensions`), `validate-upload.ts`, `env.ts`, `utils.ts` (`cn`).
- **pipeline** : `client.ts` (`uploadArtifact`), `detect.ts`, `config.ts`, `prompts.ts` — inchangés cette story (l'encodage PNG + upload du masque validé = Story 2.3).
- **ui** : `button`, `dialog`, `progress`, `tooltip`. **Pas de `slider`** → à ajouter (Task 6).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-7 / AR-MASK-VERBATIM** : Masque **binaire**, chaque pixel 0 ou 255, **aucune valeur intermédiaire — dessin sans anti-aliasing**, jamais de binarisation différée à l'export : « ce que l'utilisateur voit est exactement ce qui part ». Le buffer d'édition vit en **résolution canonique 1:1** pendant toute l'édition ; **zoom et devicePixelRatio sont des transformations d'affichage, jamais de rééchantillonnage du buffer**. [Source: ARCHITECTURE-SPINE.md#AD-7]
- **AD-13 / AR-MASK-DUAL** : deux formes du Masque. (1) **Brouillon** = buffer binaire aux dims canoniques, tenu dans le reducer (`generation.maskDraft`), **survit au démontage** ; le canvas est une **vue**, jamais le propriétaire ; **la pile d'undo est UI locale, assumée perdue à la navigation**. (2) Artefact validé = PNG uploadé (Story 2.3). Le retour arrière ré-affiche le brouillon depuis le reducer, jamais depuis une URL fal. [Source: ARCHITECTURE-SPINE.md#AD-13]
- **AD-2 (amendement 2026-07-11)** : le masque SAM (dims ~1536) est **réduit aux dimensions canoniques au chargement dans le buffer d'édition** — c'est le travail de cette story. Le pipeline aval reste ≤ 1024. [Source: ARCHITECTURE-SPINE.md#AD-2 ; [[sam3-detection-resolution]]]
- **AD-3** : le brouillon du Masque **est** de l'état pipeline (dans le reducer), **pas de l'état d'interaction UI**. Aucun composant ne tient d'état pipeline local. Seuls l'historique undo, l'outil courant, la taille, le zoom et le pan sont de l'état UI local. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **AR-LAYERS** : `components/ → state/ → pipeline/`. `lib/` est une feuille (pas d'import de state/pipeline). La logique buffer/historique/coords vit en `lib/` (pure) ; l'orchestration (seed async, dispatch) vit dans le composant/effets. [Source: 2-1 Dev Notes]
- **AD-12** : le seed du buffer depuis une URL est async → garde d'époque (`isStale`) + abort au démontage, comme `runDetect`. Un résultat périmé n'est jamais dispatché. [Source: ARCHITECTURE-SPINE.md, effects.ts]

### Contraintes UX (font foi)

- **Canvas du Masque** : Photo originale plein cadre `rounded-lg`, overlay `masque-overlay` (fuchsia) **45 %** + contour `masque-contour` 1,5 px, **aucune étiquette de catégorie**. **Le curseur est un cercle à la taille de l'outil.** [Source: DESIGN.md#Canvas du Masque]
- **Barre d'outils** : flottante sous le canvas, fond `surface-elevee`. Deux boutons-icônes (pinceau, gomme) : actif = fond `or-lumineux` / icône `or-lumineux-foreground` ; inactif = icône `texte-secondaire`. `Slider` shadcn pour la taille. Boutons annuler/rétablir en **ghost**. [Source: DESIGN.md#Barre d'outils du Masque]
- **Interactions** : pinceau = ajouter, gomme = retirer, **effet immédiat au trait** (FR-6). Zoom molette **100–400 % centré curseur** ; pan **barre espace + drag**. Mutuellement exclusifs. Historique **20 actions**. [Source: EXPERIENCE.md#Canvas du Masque, Interaction Primitives]
- **Raccourcis (étape Masque uniquement, tous bonus — l'app est complète à la souris seule, NFR-3)** : `B` pinceau, `E` gomme, `[`/`]` taille, `Ctrl+Z`/`Ctrl+Shift+Z` annuler/rétablir. [Source: EXPERIENCE.md#Interaction Primitives]
- **Bannis** : hover-only sans équivalent clic, interaction pendant laquelle l'UI se fige. [Source: EXPERIENCE.md]

### Pièges connus

- **Ne pas rééchantillonner le buffer** : zoom/pan/DPR sont des transfos d'affichage. Le buffer reste aux dims canoniques ; on mappe les coords écran→buffer (`screenToBuffer`), on ne redimensionne jamais `buffer.data`. Un trait à zoom 400 % écrit dans le buffer canonique, pas dans un buffer agrandi. (AD-7)
- **Pas d'anti-aliasing** : dessiner les disques du masque en écrivant directement 0/255 dans le `Uint8Array` (pas via `ctx.arc` + `fill` qui lisse les bords). Le canvas de vue peut lisser l'affichage ; le **buffer** ne lisse jamais.
- **Un seul dispatch par trait** : peindre sur la vue pendant le mousemove ; committer le buffer (`SET_MASK_BUFFER`) uniquement au pointer-up (sinon flood de re-renders du contexte).
- **Boucle d'abandon (régression 2.1)** : ne pas remettre `waitPhase` dans les deps de l'effet de détection. Le nouvel effet de seed du buffer doit avoir ses propres deps et sa propre garde d'époque.
- **StrictMode dev** : double-montage → le seed async doit être idempotent (si `maskDraft.buffer` existe déjà, ne pas re-seeder) et abortable. Le bug object-URL (create+revoke dans le même effet) est déjà corrigé — ne pas régresser.
- **Historique local vs reducer** : ne PAS mettre la pile undo dans le reducer (AD-13 : elle est UI-locale, perdue à la nav). Seul le buffer courant est dans le reducer.
- **Immutabilité** : `paintStroke`/history renvoient de nouveaux objets ; `SET_MASK_BUFFER` remplace `maskDraft` par un nouvel objet. Jamais de mutation en place d'un `Uint8Array` déjà référencé par l'état (sinon undo casse).
- **`crossOrigin="anonymous"`** sur l'`Image` du masque, sinon `getImageData` lève un `SecurityError` (canvas tainted). CORS fal validé en 2.1.
- **Cas `detectedMaskUrl === null`** : seeder un buffer vierge (préparé ici) ; le bandeau fallback + pinceau pré-activé complets = Story 2.4. Ne pas traiter comme une erreur.

### Testing Requirements

- **Pur (Vitest, obligatoire, ≥ 80 %)** : `mask-buffer` (disque/trait/immutabilité/binaire/clamp bornes), `mask-history` (cap 20, undo/redo, invalidation redo), `mask-tools` (clamps taille/zoom, `stepBrush`, `screenToBuffer` cas de référence), reducer (`SET_MASK_BUFFER` pur + immutable), `resize` (dims retournées).
- **Non testable jsdom → live** : `mask-raster` (décodage + seuillage), rendu canvas, pointer/zoom/pan/DPR, curseur, raccourcis. Vérif live FAL_KEY (Task 8).
- **Régression** : suite 2.1 verte (détection, overlay, effets, import-boundary). `tsc` + `lint` + `build` verts.

### Project Structure Notes

- Nouveaux `lib/` (feuilles pures) : `mask-buffer.ts`, `mask-history.ts`, `mask-tools.ts`, `mask-raster.ts` (+ `.test.ts` sauf raster). Nouveau `ui/slider.tsx`. Modifs : `state/types.ts`, `state/reducer.ts` (+ test), `lib/resize.ts` (+ test), `components/upload-zone.tsx` (+ test mock), `components/mask-surface.tsx`.
- Respecte « many small files » et AR-LAYERS (lib feuille, orchestration en composant/state).

### References

- [Source: epics.md#Story 2.2]
- [Source: ARCHITECTURE-SPINE.md#AD-2 (amendement), AD-3, AD-7, AD-13, AD-12, AR-LAYERS]
- [Source: DESIGN.md#Canvas du Masque, Barre d'outils du Masque, masque-overlay/contour]
- [Source: EXPERIENCE.md#Canvas du Masque, Interaction Primitives, Flow 1]
- [Source: prd.md#FR-6, FR-7, FR-15, NFR-3]
- [Source: 2-1-...#Dev Notes, Senior Developer Review — boucle d'abandon, object-URL, CORS]
- [Source: mémoire [[sam3-detection-resolution]], [[roomreveal-bmad-progress]]]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Bug live corrigé avant la story (StrictMode) : object URL de la photo créé dans `useMemo` puis révoqué en cleanup → blob révoqué au remontage (`net::ERR_FILE_NOT_FOUND`). Corrigé : create+revoke dans le MÊME `useEffect` (`usePhotoObjectUrl`). Motif conservé dans le nouvel éditeur.
- `MaskBuffer` défini en `lib/mask-buffer.ts` (feuille) et re-exporté par `state/types.ts` pour ne pas coupler `lib/ → state/` (AR-LAYERS).
- `resize.ts` : `encodeAtLongSide` renvoie désormais `{blob,width,height}` pour propager les dims canoniques exactes (buffer 1:1, AD-7).

### Completion Notes List

- **Logique pure extraite et testée (jsdom-safe)** : `mask-buffer` (disque/trait binaire, immutabilité, clamp bornes), `mask-history` (undo/redo cap 20), `mask-tools` (clamps taille 4–128 / zoom 100–400 %, `screenToBuffer` inverse de la transfo d'affichage), reducer `SET_MASK_BUFFER`, `resize` dims. **94 tests verts** (+22 vs 2.1), `tsc`/`lint`/`build` verts.
- **Buffer binaire canonique dans le reducer** (`generation.maskDraft.buffer`, AD-13). Dessin direct 0/255 sans anti-aliasing (AD-7). Zoom/pan/DPR = transfos d'affichage (CSS transform + backing store DPR), jamais de rééchantillonnage du buffer.
- **Seed** : `mask-raster.rasterizeMaskUrl` réduit le masque détecté (~1536) aux dims canoniques + seuillage binaire (AD-2 amendement). `crossOrigin="anonymous"` (CORS fal). Garde `alive` (AD-12) ; blank si `detectedMaskUrl===null` (préparé Story 2.4).
- **Éditeur** (`mask-surface.tsx`) : peinture pointer (1 dispatch/trait au pointer-up ; feedback live sur le canvas de vue), curseur cercle via ref (pas de re-render/mousemove), zoom molette centré curseur, pan espace+drag, raccourcis B/E/[/]/Ctrl+Z/Ctrl+Shift+Z (retirés au démontage, ignorés sur les contrôles éditables). Barre d'outils flottante `surface-elevee`, outil actif `or-lumineux`, undo/redo ghost.
- **Non testable jsdom → vérif live requise** (`mask-raster`, rendu canvas, pointer/zoom/pan/DPR, curseur, raccourcis).

### File List

- `src/lib/mask-buffer.ts` `.test.ts`, `mask-history.ts` `.test.ts`, `mask-tools.ts` `.test.ts`, `mask-raster.ts` (nouveaux)
- `src/lib/resize.ts` `.test.ts` (modifié — dims canoniques retournées)
- `src/state/types.ts` (modifié — `MaskBuffer` re-export, `MaskDraft.buffer`, `OriginalPhoto.width/height`), `reducer.ts` `.test.ts` (modifié — `SET_MASK_BUFFER`)
- `src/state/effects.test.ts`, `src/components/stepper.test.tsx` (modifiés — fixtures dims)
- `src/components/mask-surface.tsx` (réécrit — éditeur canvas), `mask-toolbar.tsx`, `ui/slider.tsx` (nouveaux), `upload-zone.tsx` `.test.tsx` (modifiés — dims)

## Change Log

- 2026-07-11 : Story 2.2 implémentée — buffer binaire canonique dans le reducer (AD-13), lib pures (buffer/history/tools/raster), éditeur canvas pinceau/gomme + zoom/pan/undo-redo/raccourcis, Slider shadcn. 94 tests, `tsc`/`lint`/`build` verts. Statut → review. Vérif live (FAL_KEY) en attente.
- 2026-07-11 : Revue adversariale 3 couches (Blind + Edge + Auditor). 0 CRITICAL confirmé, ACs tous PASS. 9 correctifs appliqués (voir ci-dessous). 96 tests verts. Vérif live en attente.
- 2026-07-11 : **Vérification live (FAL_KEY, Playwright sur serveur dev v16.2.10, StrictMode)**. Détection réelle → seed du buffer (masque SAM 1536 réduit à 1024, overlay fuchsia + contour rendus, 0 erreur blob). Buffer overlay backing store = **1024×768 exact** (dims canoniques, aucun rééchantillonnage). Pinceau ajoute (+19 064 px), gomme retire (−464 px), **buffer strictement binaire** (0 pixel non-0/255 à tout instant). Undo restaure **exactement** le seed (41 560 px) + états activé/désactivé corrects ; raccourci `E` → gomme. Buffer **survit au fast-refresh** (double-vie reducer, AD-13). **Correctif supplémentaire trouvé en live** : `setPointerCapture` peut lever `NotFoundError` et faisait avorter tout le trait → enveloppé d'un `try/catch` (capture = optimisation). Statut → **done**. 96 tests, `tsc`/`lint`/`build` verts.

## Senior Developer Review (AI)

**Date :** 2026-07-11 · **Résultat :** Approuvé après corrections (vérif live en attente) · **Verdict ACs :** AC1–AC4 PASS statiquement ; parts canvas (rendu, pointeur/zoom/pan/DPR, curseur, raccourcis, seed raster) vérifiables uniquement en navigateur.

### Action Items corrigés

- [x] **[Haut]** Raccourcis pendant un trait en cours corrompaient l'historique (Ctrl+Z / B/E mid-drag commit sur une base décalée) → `onKeyDown` ignore les raccourcis si `paintingRef.current` (Edge).
- [x] **[Haut]** Refs `zoom`/`pan` en retard d'un render (synchronisées via `useEffect`) → zoom erratique en rafale molette + peinture mal mappée juste après un zoom. Refs mises à jour **synchroniquement** dans `onWheel` et le pan de `onPointerMove` (Blind H-1).
- [x] **[Haut/Critique]** Division par zéro → coord `NaN` empoisonnant `pan` de façon permanente. Gardes ajoutées (`toBufferPoint`, `onWheel`, `updateCursor` : dims/rect nuls) + rejet des coords non finies (Edge).
- [x] **[Haut]** Fuite de capture de pointeur sur `pointercancel` (tactile) → `onPointerCancel={endStroke}` ajouté (Blind H-2).
- [x] **[Haut]** Point unique (tap) sans feedback visuel immédiat (trait de longueur nulle) → dessin explicite d'un disque (`arc`+`fill`) quand `from === to` (Blind H-3).
- [x] **[Moyen]** `DETECT_SUCCEEDED` écrasait un buffer déjà édité sur re-dispatch parasite → préserve `state.maskDraft?.buffer` (Blind/Edge).
- [x] **[Moyen]** Drapeau pan `Espace` bloqué si keyup manqué / Espace sur un bouton focalisé → reset sur `window blur` + `BUTTON` ajouté à `isEditableTarget` (Edge).
- [x] **[Moyen]** `mask-history.push` mutait un tableau local (règle immutabilité) → réécrit en spread (Blind).
- [x] **[Moyen]** Seed sans garde d'époque explicite (incohérence AD-12) → garde `epochRef.current !== startEpoch` avant dispatch (Blind).
- [x] **[Bas]** Tests ajoutés : rayon fractionnaire (taille impaire) invariant binaire ; borne exacte historique 20 vs 21 (Edge coverage).
- [x] **[Haut]** (trouvé en vérif live) `setPointerCapture` levant `NotFoundError` faisait avorter le trait entier → `try/catch` (capture = optimisation, la peinture fonctionne sans).

### Écartés / Différés (documentés)

- **Seed raster en échec → buffer vierge** : sur échec `rasterizeMaskUrl` (CORS/décodage transitoire du masque détecté), repli sur un buffer vierge éditable (Parcours praticable, peinture manuelle possible). Un retry dédié est **différé** (rare — URL fal fraîche 24 h, CORS validé en 2.1) plutôt que de complexifier le flux de retry `detect`.
- **Contour du masque** : rendu en `drop-shadow` 1,5 px (halo), pas en tracé de contour vectoriel exact — **cohérent avec l'affichage de la Story 2.1**, accepté.
- **DPR « crispness »** : le backing store de l'overlay est aux dims canoniques (buffer), mis à l'échelle en CSS ; l'invariant AD-7 (pas de rééchantillonnage du buffer) tient. Le rendu HiDPI ultra-net (backing store = css×dpr) n'est pas implémenté — nicety différée.
- **`drawOverlay` O(largeur·hauteur)** par changement de buffer : acceptable aux dims canoniques (≤ 1024) ; optimisation (dirty-rect) non nécessaire en v1.
- Findings Blind auto-rétractés (1/4/5/6/11/13/14) et `setUrl(null)` : non-bugs confirmés.
