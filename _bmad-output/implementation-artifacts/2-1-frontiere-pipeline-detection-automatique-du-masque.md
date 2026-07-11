---
baseline_commit: a806e01
---

# Story 2.1: Frontière pipeline & détection automatique du Masque

Status: in-progress

## Story

As a utilisateur,
I want que mes meubles soient automatiquement repérés et surlignés dès l'entrée dans l'étape Masque,
so that je pars d'un Masque déjà utile plutôt que d'une toile vierge.

## Acceptance Criteria

1. **Given** le proxy fal et le module pipeline **When** ils sont mis en place **Then** `/api/fal/proxy` (`@fal-ai/server-proxy`) garde `FAL_KEY` côté serveur et n'autorise que les endpoints du registre `pipeline/config.ts` (allowlist), et pose le header `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": 86400}` sur chaque requête (AR-PROXY, AR-EPHEMERAL) **And** `src/pipeline/` est le seul importeur de `@fal-ai/client` et expose `uploadArtifact(blob) → URL fal` (AR-PIPELINE) **And** la liste des meubles et le modèle `fal-ai/sam-3/image` vivent respectivement dans `src/pipeline/prompts.ts` et `src/pipeline/config.ts` (AR-PROMPTS, AR-CONFIG, AR-MODELS)
2. **Given** une Photo originale canonique conservée dans l'état **When** l'étape Masque est atteinte **Then** la couche effectrice `state/effects.ts` uploade la photo via `uploadArtifact` (une seule fois, mémoïsée) puis appelle l'adaptateur `detect(photoUrl)` avec un `AbortSignal` et estampille l'appel du jeton d'époque courant (AR-PIPELINE, AR-ASYNC) **And** `detect` retourne `{ initialMask: PNG binaire | null, categories: string[] }` aux dimensions canoniques, la composition des segments SAM (union, seuil, mise aux dimensions) étant faite dans `detect`, jamais en UI (AR-PIPELINE)
3. **Given** une photo de salon meublé standard **When** la détection réussit **Then** les meubles principaux sont couverts par le Masque initial (FR-4), affiché en overlay fuchsia 45 % + contour sur la Photo originale (FR-5, UX-DR7) **And** les catégories détectées ne sont exposées nulle part dans l'UI (décision canonique)
4. **Given** un appel de détection **When** il échoue ou dépasse son délai (60 s) **Then** l'adaptateur produit un `StepError { step: 'detect', retryable: true }` converti en Bandeau d'erreur, dont la relance = re-détection depuis la photo canonique conservée (FR-17, AR-ERRORS)

## Tasks / Subtasks

- [ ] Task 1 : Dépendances & proxy fal (AC: 1)
  - [ ] `npm install @fal-ai/client @fal-ai/server-proxy` (versions spine : client 1.10.x, proxy 1.2.x — accepter la plus récente compatible, noter la version installée).
  - [ ] `src/app/api/fal/proxy/route.ts` : re-exporter le handler App Router (`import { route } from "@fal-ai/server-proxy/nextjs"; export const { GET, POST, PUT } = route;`) **enveloppé** d'un garde d'allowlist : rejeter (403) toute requête dont l'URL cible fal (`x-fal-target-url`) n'est pas dans l'allowlist dérivée de `pipeline/config.ts` ; injecter/forcer `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": 86400}` sur chaque requête forwardée (AR-PROXY, AR-EPHEMERAL). `FAL_KEY` reste lu côté serveur uniquement (le handler lib le lit depuis l'env ; AR-CONFIG / AD-4).
- [ ] Task 2 : Registre modèles & prompts (AC: 1)
  - [ ] `src/pipeline/config.ts` : IDs de modèles **par rôle** (`detect: "fal-ai/sam-3/image"`, avec les rôles inpaint/video posés en constantes pour les epics suivants), timeouts par étape (`detect: 60_000`, `inpaint: 60_000`, `video: 360_000` — AD-8), et l'`ENDPOINT_ALLOWLIST` (les IDs autorisés + endpoints storage/queue) consommée par le proxy. Toute variable d'env lue une seule fois côté serveur (AR-CONFIG).
  - [ ] `src/pipeline/prompts.ts` : la liste des meubles pour SAM 3 (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…) ; prompts pièce-vide/mouvement posés en constantes vides ou TODO pour Epic 3/4 (AR-PROMPTS).
- [ ] Task 3 : Frontière pipeline — client + uploadArtifact + detect (AC: 1, 2, 3, 4)
  - [ ] `src/pipeline/client.ts` (ou dans `index.ts`) : configure `fal.config({ proxyUrl: "/api/fal/proxy" })` ; **seul** importeur de `@fal-ai/client` (AR-PIPELINE / AD-5).
  - [ ] `uploadArtifact(blob: Blob): Promise<string>` : `fal.storage.upload(blob, { lifecycle: { expiresIn: 86400 } })` → URL fal (AR-EPHEMERAL).
  - [ ] Adaptateur `detect(photoUrl: string, { signal, onPhase }): Promise<DetectResult>` — fonction asynchrone **passive** (AD-12) : appelle `fal.subscribe(config.models.detect, { input: { image_url, ... prompts }, abortSignal: signal, onQueueUpdate })` en mappant les statuts queue → `onPhase(WaitPhase)` (`queued`/`generating`) ; compose les N segments SAM (union → masque binaire unique aux dimensions canoniques) **dans l'adaptateur** ; retourne `{ initialMask: string | null, categories: string[] }` (`initialMask` = URL du PNG binaire uploadé, ou `null` si aucun segment — cas FR-16). Rejet = `StepError { step: 'detect', retryable, userMessage }` (AD-8) ; timeout 60 s converti en `StepError`. ⚠️ `@fal-ai/client` n'est JAMAIS importé hors de `src/pipeline/`.
  - [ ] Types : `DetectResult` dans `pipeline/` (ou types domaine si partagé). Le contrat `initialMask: PNG binaire | null` : représenter par une URL fal (string) — cohérent avec `generation.maskDraft`/`mask` en aval (la forme buffer d'édition sera dérivée en Story 2.2).
- [ ] Task 4 : Couche effectrice `state/effects.ts` (AC: 2, 4)
  - [ ] `src/state/effects.ts` (AD-12) : SEULE couche appelant les adaptateurs. Un `AbortController` par étape + jeton d'époque ; un résultat dont le jeton ≠ époque courante est jeté sans dispatch. `runDetect(state, dispatch)` : upload mémoïsé (`uploadArtifact(originalPhoto.blob)` une seule fois → stocke `falUrl` dans l'état via une action `PHOTO_UPLOADED`), puis `detect(photoUrl, { signal, onPhase: p => dispatch(SET_WAIT_PHASE) })`, puis dispatch du résultat (`DETECT_SUCCEEDED { initialMask, }`) ou `SET_ERROR`. Reducer reste PUR (effets ici seulement).
  - [ ] **Reducer** : ajouter les actions minimales nécessaires (`PHOTO_UPLOADED { falUrl }`, `DETECT_SUCCEEDED { mask?: initialMask }`) — étendre `generationReducer` proprement, en préservant la pureté et les invariants AD-11/AD-14. Mettre à jour les tests reducer.
- [ ] Task 5 : Câblage UI — lancement à l'entrée Masque + overlay (AC: 2, 3)
  - [ ] Déclencher `runDetect` quand `step === 'mask'` et qu'aucune détection n'a encore tourné pour l'époque courante (effet React dans la surface Masque ou un hook `useMaskStep`). Le Panneau d'attente (déjà en place) affiche « Détection des meubles… » via `WaitPhase`.
  - [ ] Surface Masque minimale : afficher la Photo originale plein cadre + overlay fuchsia 45 % + contour (`masque-overlay`/`masque-contour`) quand un masque initial existe (FR-5, UX-DR7). Aucune catégorie affichée. (L'édition pinceau/gomme = Story 2.2 ; ici, affichage seul.)
- [ ] Task 6 : Tests (AC: 1, 2, 4)
  - [ ] `src/pipeline/detect.test.ts` : `@fal-ai/client` mocké **dans pipeline/** — succès (compose segments → initialMask non nul + categories), aucun segment (→ `initialMask: null`), échec/timeout (→ `StepError { step: 'detect' }`). Vérifie que `categories` n'est pas exposé au-delà du retour.
  - [ ] `src/state/effects.test.ts` : adaptateurs mockés à la frontière `(inputs, { signal, onPhase })` (AR-TESTS) — upload mémoïsé une seule fois ; résultat périmé (époque changée) jeté sans dispatch ; `onPhase` → `SET_WAIT_PHASE` ; erreur → `SET_ERROR`.
  - [ ] `src/state/reducer.test.ts` : nouvelles actions `PHOTO_UPLOADED`, `DETECT_SUCCEEDED` (pures).
  - [ ] Config proxy : test léger que l'allowlist rejette une cible hors registre (si extractible sans réseau) ou test unitaire de la fonction de garde d'allowlist.
  - [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Dev Notes

### ⚠️ Limite de vérification (fal live)

`FAL_KEY` et un appel fal réel ne sont pas disponibles en développement autonome. Conformément à **AR-TESTS**, les adaptateurs se mockent à leur frontière et `@fal-ai/client` n'est jamais mocké hors de `pipeline/` — tout le chemin (proxy, config, uploadArtifact, detect, effects, reducer, overlay) est donc **construit et testé avec mocks**, `build`/`tsc`/`lint`/tests verts. La vérification « détection réelle sur vraie photo » (FR-4 qualitatif, SM-1) reste à faire manuellement avec une `FAL_KEY` — à noter dans les Completion Notes.

### État en place (Epic 1 — NE PAS recréer)

- `src/state/` : `types.ts` (Step, WaitPhase, StepError, PipelineStep, PIPELINE_STEP_TO_PARCOURS, OriginalPhoto `{blob, falUrl?}`, MaskDraft, Generation), `reducer.ts` (PHOTO_NORMALIZED, GO_TO_STEP, CONFIRM_ADVANCE_FROM, SET_WAIT_PHASE monotone, SET_ERROR, CLEAR_ERROR), `generation-context.tsx` (`useGeneration`, provider avec `initialState` seed pour tests).
- `src/components/` : `wait-panel.tsx` (lit `waitPhase`, « Détection des meubles… » déjà mappé pour `step==='mask'` via `waitPhaseLabel`), `error-banner.tsx` (variante error/neutral), `generation-button.tsx`, `parcours-scene.tsx` (overlays + `StepSurface` avec placeholder pour mask/emptyRoom/video → y brancher la surface Masque).
- `src/lib/` : `resize.ts` (photo canonique), `validate-upload.ts`, `env.ts` (`serverEnv.falKey` derrière `server-only`). `src/app/api/fal/proxy/` existe (vide, `.gitkeep`).
- `originalPhoto.falUrl` est déjà prévu dans le type — le remplir via `PHOTO_UPLOADED`.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-4 / AR-PROXY** : `FAL_KEY` uniquement serveur ; tout appel API fal passe par `/api/fal/proxy` ; allowlist des endpoints du registre `config.ts` ; GET publics du storage fal autorisés en direct (affichage images). Réseau privé en démo (AR-DEPLOY).
- **AD-5 / AR-PIPELINE** : `src/pipeline/` = SEUL importeur de `@fal-ai/client` (upload compris). Expose `uploadArtifact` + adaptateurs `detect`/`inpaint`/`video` derrière l'interface passive `(inputs, {signal,onPhase}) → Promise` (AD-12), erreurs normalisées `StepError` (AD-8). `detect(photoUrl)` retourne `{ initialMask: PNG|null, categories }` ; `initialMask===null` = cas FR-16 canonique ; `categories` jamais en UI.
- **AD-6 / AR-PROMPTS** : prompts modèles centralisés dans `pipeline/prompts.ts`.
- **AD-9 / AR-EPHEMERAL** : header `X-Fal-Object-Lifecycle-Preference {"expiration_duration_seconds":86400}` sur chaque requête (upload + génération). Via `fal.storage.upload(blob,{lifecycle:{expiresIn:86400}})` côté appel ET forcé par le proxy (belt-and-suspenders).
- **AD-10 / AR-QUEUE** : jobs via `fal.subscribe` (queue + polling) depuis le navigateur via le proxy ; statuts queue → phases nommées du Panneau d'attente.
- **AD-12 / AR-ASYNC** : adaptateurs passifs `(inputs,{signal,onPhase})→Promise` ; orchestration UNIQUEMENT dans `state/effects.ts` (un AbortController/étape + jeton d'époque) ; résultat périmé jeté sans dispatch ; reducer pur.
- **AD-8 / AR-ERRORS** : `StepError {step:'detect'|'inpaint'|'video', retryable, userMessage}` ; timeout détecté par l'adaptateur (detect 60 s) ; l'UI ne voit jamais d'erreur fal native ; « aucun meuble » n'est pas une erreur.
- **AR-LAYERS** : `components/ → state/ → pipeline/ → api/fal/proxy`. L'UI n'importe jamais `pipeline/` directement pour les appels — elle dispatche des intentions ; `effects.ts` (couche state) appelle `pipeline/`. `lib/` reste feuille.
- **AD-2** : dimensions canoniques partagées ; le masque de détection est aux dimensions canoniques (composition faite dans `detect`).
- **Nommage** : anglais côté code ; UI français (glossaire) ; pas de jargon en UI (« segmentation », « SAM », « timeout »).

### Contraintes UX (font foi)

- **Canvas du Masque (UX-DR7)** : Photo originale plein cadre `rounded-lg`, overlay `masque-overlay` (fuchsia) à **45 %** + contour `masque-contour`, aucune étiquette de catégorie. (Zoom/pan/curseur = Story 2.2.)
- **Microcopie attente** : « Détection des meubles… » (déjà dans `waitPhaseLabel` pour `mask`). Pas de durée annoncée pour la détection (chargement moyen 2–30 s).
- **Erreur détection** : Bandeau d'erreur, une seule action « Relancer la détection » (déjà mappé dans `error-banner` via `PIPELINE_STEP_TO_PARCOURS.detect`).

### Pièges connus

- **Ne jamais importer `@fal-ai/client` hors de `pipeline/`** (contrainte de test AR-TESTS + AD-5). Les tests effects/reducer mockent la frontière adaptateur, pas le client fal.
- **Mémoïsation upload** : uploader la photo canonique une seule fois par Génération (stocker `falUrl`) ; une relance de détection réutilise l'URL, ne ré-uploade pas.
- **Jeton d'époque** : toute invalidation (AD-11) incrémente `epoch` ; `effects.ts` compare l'époque au retour ; jeter les résultats périmés.
- **`fal.subscribe` abort** : passer `abortSignal` ; après abort, ignorer le résultat (le job distant peut survivre — AD-12).
- **initialMask null** : NE PAS lever d'erreur ; c'est le cas FR-16 (Story 2.4). Pour cette story, le retour null est simplement stocké (aucun overlay), la surface Masque se construit ; le fallback complet est Story 2.4.
- **Prod build** : le proxy est une route serveur ; vérifier que `build` la génère sans exiger `FAL_KEY` au build (lecture lazy à la requête).

### Testing Requirements

- `detect` : `@fal-ai/client` mocké dans `pipeline/` — succès/null/erreur/timeout.
- `effects.ts` : adaptateurs mockés à la frontière — upload mémoïsé, époque périmée jetée, onPhase→dispatch, erreur→SET_ERROR.
- `reducer` : nouvelles actions pures.
- Garde d'allowlist du proxy : test unitaire pur si extractible.
- `npm test` + `tsc` + `lint` + `build` verts. Vérif fal live différée (voir limite ci-dessus).

### References

- [Source: epics.md#Story 2.1]
- [Source: ARCHITECTURE-SPINE.md#AD-4, AD-5, AD-6, AD-8, AD-9, AD-10, AD-12, Stack, AR-*]
- [Source: DESIGN.md#Components (Canvas du Masque), Colors (masque-overlay/contour)]
- [Source: EXPERIENCE.md#Component Patterns (Canvas du Masque), Attente & Progression]
- [Source: prd.md#FR-4, FR-5, FR-17]
- [Source: fal docs (Context7 /fal-ai/fal-js) — server-proxy nextjs `route`, `fal.config({proxyUrl})`, `fal.storage.upload(blob,{lifecycle:{expiresIn}})`, `fal.subscribe` onQueueUpdate]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
