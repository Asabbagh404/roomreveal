---
baseline_commit: dd44e69
---

# Story 3.1: Génération de la Pièce vide

Status: done

## Story

As a utilisateur,
I want que les meubles surlignés dans mon Masque disparaissent pour révéler la pièce nue,
so that j'obtienne la première frame de ma future Révélation.

## Acceptance Criteria

1. **Given** un Masque validé (URL dans `generation.mask`) et la Photo originale canonique **When** l'étape Pièce vide est atteinte **Then** la couche effectrice appelle l'adaptateur `inpaint(photoUrl, maskUrl)` via le proxy, avec `AbortSignal` et jeton d'époque, et le modèle `fal-ai/flux-pro/v1/fill` (repli éco `fal-ai/flux-2/klein/4b/base/edit`) est référencé **par rôle** dans `pipeline/config.ts` (FR-8, AR-PIPELINE, AR-MODELS, AR-ASYNC).
2. **Given** l'artefact Pièce vide généré **When** il est produit **Then** il vit sur le storage fal avec la rétention 24 h (header `x-fal-object-lifecycle-preference`) et son URL est stockée dans `generation.emptyRoom` (AR-EPHEMERAL, AD-9).
3. **Given** la génération de la Pièce vide en cours **When** elle dure plus de 2 secondes **Then** le Panneau d'attente affiche la phase nommée « Génération de la Pièce vide… » via `WaitPhase` (FR-14, AR-WAITPHASE, AD-14).
4. **Given** une Pièce vide générée **When** elle est produite **Then** les zones du Masque sont remplacées par un rendu plausible (sol, murs) sans meuble résiduel visible, et les zones hors Masque sont visuellement identiques à la Photo originale (FR-8) — la Pièce vide s'affiche sur la surface.
5. **Given** un appel d'inpainting **When** il échoue ou dépasse son délai (60 s) **Then** un `StepError { step: 'inpaint', retryable: true }` produit le Bandeau d'erreur, dont la relance conserve le Masque validé et la Photo originale (FR-17, AR-ERRORS, AD-8) **And** aucune erreur fal native n'atteint l'UI.

## Tasks / Subtasks

- [x] Task 1 : `src/pipeline/inpaint.ts` — adaptateur d'inpainting (AC: 1, 5)
  - [x] `inpaint(photoUrl: string, maskUrl: string, { signal, onPhase }: AdapterOptions): Promise<InpaintResult>` — fonction async **passive** (AD-12), calquée **exactement** sur `detect.ts` : `AbortController` interne chaîné au `signal` du caller (pour que le timeout aborte réellement le job fal, pas seulement gagne la course) ; `timeoutPromise` sur `TIMEOUTS_MS.inpaint` (60 s) → `reject(makeStepError("inpaint", true))` ; `Promise.race([run, timeoutPromise])` ; `run.catch(() => {})` pour avaler un rejet tardif ; `finally` : `clearTimeout` + `removeEventListener`.
  - [x] `fal.subscribe(MODELS.inpaint, { input: { image_url: photoUrl, mask_url: maskUrl, prompt: EMPTY_ROOM_PROMPT, output_format: "jpeg", safety_tolerance: "6" }, abortSignal, headers: { "x-fal-object-lifecycle-preference": …86400 }, onQueueUpdate })`. `onQueueUpdate` mappe `IN_QUEUE→"queued"`, `IN_PROGRESS→"generating"`, `COMPLETED→"finalizing"` via `onPhase` (motif identique à `detect`).
  - [x] `@fal-ai/client` atteint **uniquement** via `./client` (AD-5). `MODELS.inpaint`, `TIMEOUTS_MS.inpaint`, `ARTIFACT_EXPIRES_IN_SECONDS` importés de `./config`. `EMPTY_ROOM_PROMPT` de `./prompts`.
  - [x] Sortie : lire `result.data.images[0].url` (schéma FLUX Fill vérifié — voir Dev Notes). URL vide/absente ⇒ échec ⇒ `throw makeStepError("inpaint", true)` (jamais de succès sans image). `catch` global → `throw makeStepError("inpaint", true)` (jamais d'erreur fal native, AD-8). Marquer le mapping de champ `[ASSUMPTION — calibrer au live]` comme dans `detect.ts` (le contrat app `{ emptyRoom }` ne change pas).
- [x] Task 2 : Contrat & registre pipeline (AC: 1)
  - [x] `src/pipeline/types.ts` : ajouter `InpaintResult { emptyRoom: string }` (URL fal de la Pièce vide, dims canoniques par construction — flux fill préserve les dimensions de l'entrée). Documenter.
  - [x] `src/pipeline/config.ts` : `MODELS.inpaint` **existe déjà** (`fal-ai/flux-pro/v1/fill`) et `TIMEOUTS_MS.inpaint` (60 000) **aussi** — NE PAS recréer. **Ajouter `inpaint` à `FAL_ALLOWED_ENDPOINTS`** : `` `${MODELS.inpaint}/**` `` et `` `${MODELS.inpaint}` `` (sinon le proxy **refuse** l'appel — c'est la cause d'échec n°1). Mettre à jour le commentaire (« inpaint (Epic 3) » n'est plus en attente).
  - [x] `src/pipeline/index.ts` : exporter `inpaint` et le type `InpaintResult`.
  - [x] `src/pipeline/prompts.ts` : renseigner `EMPTY_ROOM_PROMPT` (vide aujourd'hui). Concept anglais décrivant le **résultat voulu** dans les zones masquées, p. ex. `"empty room, bare floor and walls, no furniture, consistent lighting and perspective, photorealistic interior"`. `[À calibrer au live]` — noter que le prompt ne décrit QUE le remplissage des zones blanches du masque.
- [x] Task 3 : `src/state/effects.ts` — `runInpaint` (AC: 1, 2, 3, 5)
  - [x] `runInpaint(state, dispatch, { signal, isStale }): Promise<void>` (AD-12), calqué sur `runDetect` : garde d'entrée `photo = state.originalPhoto` et `mask = state.mask` ; si l'un est `undefined` → `return`. `dead() = () => signal.aborted || isStale()`. `onPhase = (phase) => { if (!dead()) dispatch(SET_WAIT_PHASE) }`.
  - [x] **Upload paresseux de la photo canonique** : la photo canonique n'est PAS encore uploadée (`runDetect` n'uploade que la copie détection ≤1536). Si `photo.falUrl === undefined` : `dispatch(SET_WAIT_PHASE "uploading")` → `photoUrl = await uploadArtifact(photo.blob)` → `if (dead()) return` → `dispatch(PHOTO_UPLOADED { falUrl: photoUrl })`. Sinon réutiliser `photo.falUrl` (mémoïsé, motif `DETECTION_UPLOADED`/`runDetect`).
  - [x] `result = await inpaint(photoUrl, state.mask, { signal, onPhase })` → `if (dead()) return` (superseded/annulé : on jette) → `dispatch(INPAINT_SUCCEEDED { emptyRoomUrl: result.emptyRoom })`.
  - [x] `catch (err)` : `if (dead()) return` (un run annulé ne peint jamais d'erreur) ; sinon `dispatch(SET_ERROR { error: isStepError(err) ? err : makeStepError("inpaint", true) })` (motif `runDetect`). **SEULE couche appelant `pipeline/`** (AR-LAYERS).
- [x] Task 4 : `src/state/reducer.ts` — action `INPAINT_SUCCEEDED` (AC: 2, 4)
  - [x] Ajouter `{ type: "INPAINT_SUCCEEDED"; emptyRoomUrl: string }` à `GenerationAction`.
  - [x] Cas reducer **pur** : pose `emptyRoom = action.emptyRoomUrl`, `waitPhase: undefined`, `error: undefined`. **N'avance PAS** l'étape (on reste sur `emptyRoom` ; « Créer ma vidéo » viendra en 3.2). **Ne bump PAS** l'epoch (aucune invalidation). Motif `DETECT_SUCCEEDED` (résultat de génération, pas une transition). Voir Dev Notes « Retour arrière » pour la justification de l'absence de garde sur `step`.
- [x] Task 5 : `src/components/empty-room-surface.tsx` (nouveau) — surface Pièce vide (AC: 3, 4)
  - [x] Composant client. Déclenche `runInpaint` **à l'entrée** via `useEffect`, motif **exact** de l'effet de détection de `mask-surface.tsx` : `if (state.step !== "emptyRoom") return; if (state.mask === undefined) return; if (state.emptyRoom !== undefined) return; if (state.error !== undefined) return;` puis `AbortController` local + `epochRef` (`isStale: () => epochRef.current !== startEpoch`), `return () => controller.abort()` (le démontage/back-nav aborte → `dead()` via `signal.aborted`). Deps : `[state.step, state.epoch, state.mask, state.emptyRoom, state.error]` (+ `eslint-disable exhaustive-deps` comme mask-surface). `epochRef` synchronisé par un `useEffect` sur `state.epoch`.
  - [x] Rendu : quand `state.emptyRoom` défini, afficher l'image (Pièce vide) dans une carte `max-w-3xl` (motif visuel `mask-surface`, `<img>` avec `eslint-disable no-img-element`, `alt="Pièce vide"`). Tant qu'elle n'est pas prête, ne rien afficher de bloquant : le `WaitPanel` global (via `waitPhase`) et l'`ErrorBanner` global (via `error`) sont rendus par `parcours-scene.tsx` (NE PAS les dupliquer ici). La comparaison côte à côte + « Créer ma vidéo » arrivent en Story 3.2 — hors périmètre ici.
- [x] Task 6 : `src/components/parcours-scene.tsx` — câblage de l'étape (AC: 3, 4, 5)
  - [x] Dans `StepSurface`, ajouter `if (state.step === "emptyRoom") return <EmptyRoomSurface />;` avant le placeholder « Cette étape arrive bientôt » (qui ne sert plus que pour `video`). Vérifier que l'`ErrorBanner` global (relance) fonctionne : `onRetry` déjà câblé sur `CLEAR_ERROR` → l'effet d'entrée de `EmptyRoomSurface` **relance `runInpaint`** (car `emptyRoom` toujours `undefined` et `error` repasse à `undefined`). C'est la relance limitée à l'étape (AR-ERRORS) : Masque + Photo conservés (jamais touchés par `SET_ERROR`/`CLEAR_ERROR`).
- [x] Task 7 : Vérification (AC: 1–5)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (aucune régression Epics 1–2).
  - [x] **Live (FAL_KEY)** : Masque validé → l'étape Pièce vide déclenche l'inpaint (proxy 200), `WaitPanel` « Génération de la Pièce vide… » au-delà de 2 s, puis la Pièce vide s'affiche ; `generation.emptyRoom` posé (URL fal). Vérifier zones masquées vidées / zones hors masque intactes (AC4, jugement visuel). **Erreur** : simuler un échec (couper le proxy / modèle invalide) → `ErrorBanner` « Relancer la pièce vide », relance → nouvel appel, Masque conservé. Vérifier **0 erreur fal native** en console.

## Dev Notes

### État en place (NE PAS recréer)

- **Domaine** : `state/types.ts` — `Generation.emptyRoom?: string`, `Generation.mask?: string`, `originalPhoto: { blob, falUrl?, detectionBlob, detectionFalUrl?, width, height }` **existent déjà**. `WaitPhase = "uploading" | "queued" | "generating" | "finalizing"` et `PipelineStep` incluant `"inpaint"` **existent**. `PIPELINE_STEP_TO_PARCOURS.inpaint = "emptyRoom"` **existe** (routage d'erreur).
- **Reducer** : `PHOTO_UPLOADED { falUrl }` **existe déjà** (mémoïse `originalPhoto.falUrl`) — c'est l'action pour l'upload paresseux de la photo canonique. `MASK_VALIDATED` a déjà posé `mask` + avancé `step="emptyRoom"` + `invalidateDownstream("mask")`. `SET_WAIT_PHASE` (monotone AD-14), `SET_ERROR` (préserve l'amont AD-8), `CLEAR_ERROR`, `GO_TO_STEP` (back-only, efface waitPhase/error). `invalidateDownstream("mask")` efface **déjà** `emptyRoom` — donc une régénération / re-validation du masque nettoie la Pièce vide (base des stories 3.2/3.3).
- **pipeline** : `detect.ts` = **le motif à copier** (AbortController chaîné, timeout→StepError, race, onQueueUpdate→onPhase, header 24 h, `finally` cleanup, `catch`→StepError). `client.ts` expose `fal` (seul importeur `@fal-ai/client`, AD-5) + `uploadArtifact(blob)→URL`. `config.ts` : `MODELS`, `TIMEOUTS_MS`, `ARTIFACT_EXPIRES_IN_SECONDS`, `FAL_ALLOWED_ENDPOINTS`. `types.ts` : `AdapterOptions { signal, onPhase }`, `DetectResult`. `prompts.ts` : `EMPTY_ROOM_PROMPT` (vide, à renseigner).
- **effects** : `runDetect` (branche upload paresseux + backend) et `runValidateMask` cohabitent ; `RunContext { signal, isStale }`, `dead()`, `onPhase`. `runInpaint` s'ajoute à côté, **même signature et mêmes gardes**.
- **UI** : `wait-copy.ts` renvoie **déjà** « Génération de la Pièce vide… » pour `step === "emptyRoom"` (queued/generating) — AUCUNE modif. `WaitPanel` (remonté par `key={epoch}`) et `ErrorBanner` (variant `error`, label « Relancer la pièce vide » déjà mappé dans `RETRY_LABEL.inpaint`) sont rendus par `parcours-scene.tsx` en overlays transverses. `mask-surface.tsx` = motif de composant (effet d'entrée AD-12, `usePhotoObjectUrl`, `epochRef`).

### Contrat du modèle `fal-ai/flux-pro/v1/fill` (FLUX.1 [pro] Fill)

Vérifié sur la page API fal 2026-07-12 :

- **Entrée** (requis) : `prompt` (string — décrit le remplissage des zones masquées), `image_url` (string — doit matcher les dims du masque), `mask_url` (string — doit matcher les dims de l'image). **Optionnel** : `seed`, `num_images` (déf. 1), `output_format` (`"jpeg"|"png"`, déf. `"jpeg"`), `safety_tolerance` (`"1"`–`"6"`, `1` = plus strict, déf. `"2"`), `enhance_prompt` (bool), `sync_mode` (bool).
- **Sémantique du masque (FLUX Fill)** : **le blanc = la zone régénérée (inpaintée)**, le noir = zone conservée. C'est **exactement** notre convention AD-7 (blanc = zone à effacer = les meubles à faire disparaître, remplacés par un rendu de pièce vide). ✅ Aucun besoin d'inverser le masque.
- **Sortie** : `{ images: [{ url, width, height, content_type }], prompt, seed, has_nsfw_concepts, timings }` → prendre `images[0].url`.
- **`safety_tolerance`** : mettre `"6"` (le plus permissif) — un intérieur meublé/vide ne doit jamais être bloqué par un faux positif NSFW sur une v1 interne. Le mapping exact reste `[ASSUMPTION — calibrer au live]` (comme `detect.ts`) ; ne changer que le mapping de champ si la réponse live diffère, jamais le contrat `{ emptyRoom }`.
- **Repli éco** : `fal-ai/flux-2/klein/4b/base/edit` — juste posé par rôle dans `MODELS` ; NE PAS l'implémenter ici (référence documentaire, non câblé).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-5 / AR-PIPELINE** : `src/pipeline/` est le **seul** importeur de `@fal-ai/client`. Les 3 adaptateurs partagent l'interface passive `(inputs, { signal, onPhase }) → Promise<Output>`, erreurs normalisées AD-8. `inpaint(photoUrl, maskUrl)` ne consomme que des **URLs fal** ; seul `uploadArtifact` accepte un `Blob`. Modèles référencés **par rôle** dans `config.ts`. [Source: ARCHITECTURE-SPINE.md#AD-5]
- **AD-8 / AR-ERRORS** : tout échec d'adaptateur → `StepError { step:"inpaint", retryable:true, userMessage }` (français, glossaire). Le **timeout est détecté par l'adaptateur seul** (`TIMEOUTS_MS.inpaint` = 60 s), converti en `StepError { retryable:true }`. L'UI ne voit jamais d'erreur fal native. Relance limitée à l'étape ; artefacts amont (Masque, Photo) conservés. [Source: ARCHITECTURE-SPINE.md#AD-8]
- **AD-9 / AR-EPHEMERAL** : header `x-fal-object-lifecycle-preference: {"expiration_duration_seconds": 86400}` sur **chaque** requête fal (uploads ET générations). L'app ne recopie rien ; l'URL de la Pièce vide est périssable. [Source: ARCHITECTURE-SPINE.md#AD-9]
- **AD-11 / AR-INVALIDATION** : `emptyRoom` appartient à l'étape `emptyRoom`. `INPAINT_SUCCEEDED` **ne bump pas** l'epoch et n'invalide rien (c'est une production, pas une transition). L'invalidation de la Pièce vide se produit en amont (`MASK_VALIDATED`/`CONFIRM_ADVANCE_FROM`/régénération 3.3 via `invalidateDownstream`). [Source: ARCHITECTURE-SPINE.md#AD-11]
- **AD-12 / AR-ASYNC** : orchestration dans `effects.ts` seul ; `AbortController` par étape + jeton d'époque ; un résultat dont l'époque a bougé (ou dont le signal est aborté) est **jeté sans dispatch**. Le job fal distant peut survivre à l'abort — son résultat est ignoré. Reducer pur. [Source: ARCHITECTURE-SPINE.md#AD-12]
- **AD-14 / AR-WAITPHASE** : `WaitPhase` unique dans le domaine ; seule la traduction française vit dans `wait-copy.ts` (déjà en place pour emptyRoom). Monotonie par tentative garantie par le reducer. [Source: ARCHITECTURE-SPINE.md#AD-14]
- **AR-LAYERS** : `components/ → state/ → pipeline/`, `lib/` feuille. `EmptyRoomSurface` **dispatche une intention** (déclenche `runInpaint`) ; il **n'importe jamais** `pipeline/` directement (ni `inpaint`, ni `uploadArtifact`). [Source: 2-1/2-3 Dev Notes]

### Contraintes UX (font foi)

- Avance **silencieuse** : arriver sur Pièce vide déclenche l'inpaint automatiquement (pas de bouton « générer » — la validation du Masque EST l'intention). [Source: EXPERIENCE.md]
- Le seuil « > 2 s → phase nommée » (AC3) est un pur affichage : dès que `waitPhase` passe `queued`/`generating`, le `WaitPanel` s'affiche ; le seuil UX doux « 3 min 30 » (`LONG_WAIT_MS`) est déjà géré par `WaitPanel` sur temps écoulé, sans effet sur le job. [Source: wait-copy.ts, EXPERIENCE.md]
- Bandeau d'erreur : **une seule action**, « Relancer la pièce vide » (déjà dans `RETRY_LABEL.inpaint`), jamais de trace technique. [Source: error-banner.tsx, DESIGN.md UX-DR12]

### Pièges connus

- **Allowlist du proxy** : ⚠️ **CAUSE D'ÉCHEC N°1** — sans ajouter `inpaint` à `FAL_ALLOWED_ENDPOINTS` (Task 2), le proxy renvoie un refus et l'inpaint échoue systématiquement. Ajouter les DEUX formes (`/**` et exact) comme pour `detect`.
- **Upload de la photo canonique** : elle n'est PAS déjà sur fal (`runDetect` n'uploade que la copie détection ≤1536 px). `runInpaint` doit l'uploader (`photo.blob`, ≤1024 canonique) et mémoïser via `PHOTO_UPLOADED`. NE PAS réutiliser `detectionFalUrl` (mauvaises dimensions — le masque est aux dims canoniques ; flux fill exige `image_url` et `mask_url` de **mêmes dimensions**). Utiliser `photo.falUrl`.
- **Cohérence des dimensions** : masque (canonique, AD-7) et photo canonique (`blob`, ≤1024) partagent les dims (AD-2). flux fill **préserve** les dims de l'entrée → la Pièce vide est canonique par construction → compatible frames FLF (Epic 4). Ne jamais envoyer `detectionBlob`.
- **Backend local** : `DETECT_BACKEND=local` ne concerne QUE la détection. L'inpaint est **toujours fal** et consomme `generation.mask` (URL fal posée par `runValidateMask`, qui uploade même en mode local). FAL_KEY/proxy requis. Rien de spécial à faire.
- **Retour arrière pendant la génération** : `GO_TO_STEP` (back-nav) ne bump pas l'epoch, MAIS démonte `EmptyRoomSurface` → le cleanup `controller.abort()` rend `dead()` vrai via `signal.aborted` → le résultat inpaint est jeté (pas de dispatch). C'est pourquoi `INPAINT_SUCCEEDED` n'a **pas besoin** de garde `step` (symétrie avec `DETECT_SUCCEEDED`). Si un résultat arrivait quand même après un back-nav, poser `emptyRoom` est inoffensif (artefact amont préservé, invalidé à la ré-avance). Documenter ce raisonnement en commentaire.
- **Double déclenchement** : l'effet d'entrée se garde sur `state.emptyRoom !== undefined` ET `state.error !== undefined` → il ne relance pas en boucle. La relance après erreur passe par `CLEAR_ERROR` (l'utilisateur clique « Relancer »), qui remet `error` à `undefined` → l'effet redéclenche (car `emptyRoom` toujours `undefined`). Exclure `waitPhase` des deps de l'effet (piège de la boucle d'abort corrigé en 2.1).
- **Ne pas avancer** : `INPAINT_SUCCEEDED` reste sur `emptyRoom`. L'avance vers `video` sera « Créer ma vidéo » (Story 3.2/Epic 4), pas ici.
- **Prompt vide** : `EMPTY_ROOM_PROMPT` est `""` aujourd'hui → flux fill **exige** un `prompt`. Le renseigner (Task 2) sinon le résultat sera dégradé/refusé.

### Testing Requirements

- **Pur (Vitest)** :
  - reducer `INPAINT_SUCCEEDED` : pose `emptyRoom`, `waitPhase`/`error` à `undefined`, `epoch` **inchangé**, `mask`/`maskDraft`/`originalPhoto` **préservés** ; `PHOTO_UPLOADED` mémoïse `falUrl` (déjà couvert, re-vérifier).
  - effects `runInpaint` (frontière `inpaint`/`uploadArtifact` mockée, motif `effects.test.ts` existant) : chemin nominal (upload paresseux si `falUrl` absent → `PHOTO_UPLOADED` → `inpaint` → `INPAINT_SUCCEEDED`) ; `falUrl` déjà présent → pas de ré-upload ; `mask`/`photo` absent → no-op ; `dead()` (aborté / stale) → **aucun dispatch** ; `inpaint` throw → `SET_ERROR` avec `StepError` inpaint ; StepError passé tel quel (pas ré-emballé).
  - Ajouter `MODELS.inpaint`/`TIMEOUTS_MS.inpaint`/`detectLocal`/`inpaint` aux mocks de `effects.test.ts` si nécessaire (motif : `vi.fn()` non typé pour accepter le spread, cf. 2.3).
- **Non testable jsdom → live (FAL_KEY)** : `inpaint.ts` (appel fal réel), rendu de `EmptyRoomSurface` (image), qualité du déclutter (AC4, jugement visuel), bandeau d'erreur + relance. `fal.subscribe` n'est pas exécuté en unit (mocké à la frontière).
- Régression : suites 1.x/2.x vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Nouveaux** : `src/pipeline/inpaint.ts`, `src/components/empty-room-surface.tsx`.
- **Modifs** : `src/pipeline/config.ts` (allowlist), `src/pipeline/index.ts` (exports), `src/pipeline/types.ts` (`InpaintResult`), `src/pipeline/prompts.ts` (`EMPTY_ROOM_PROMPT`), `src/state/effects.ts` (+ test — `runInpaint`), `src/state/reducer.ts` (+ test — `INPAINT_SUCCEEDED`), `src/components/parcours-scene.tsx` (câblage étape).
- Nommage anglais (glossaire : `emptyRoom`). Le composant suit `mask-surface.tsx` (`empty-room-surface.tsx`), pas le hint FR `piece-vide` de la spine — cohérence avec le code existant.
- ⚠️ AGENTS.md : « This is NOT the Next.js you know » — lire `node_modules/next/dist/docs/` avant tout code Next spécifique (composant client, etc.).

### References

- [Source: epics.md#Story 3.1]
- [Source: ARCHITECTURE-SPINE.md#AD-5, AD-8, AD-9, AD-11, AD-12, AD-14 ; ligne 164 (modèle inpainting) ; ligne 205 (composant piece-vide + pipeline/inpaint)]
- [Source: prd.md#FR-8, FR-14, FR-17, SM-2]
- [Source: EXPERIENCE.md / DESIGN.md#Panneau d'attente, Bandeau d'erreur, UX-DR11/DR12]
- [Source: src/pipeline/detect.ts (motif adaptateur), src/state/effects.ts#runDetect (motif effet), src/components/mask-surface.tsx (motif effet d'entrée AD-12)]
- [Source: fal.ai/models/fal-ai/flux-pro/v1/fill/api — schéma vérifié 2026-07-12]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- `next lint` n'existe plus dans cette version (Next 16.2.10) — le script projet est `eslint` (`npm run lint`). Utilisé celui-ci.

### Completion Notes List

- **`pipeline/inpaint.ts`** (nouveau) : adaptateur passif calqué **exactement** sur `detect.ts` (AbortController chaîné au signal, `timeoutPromise` sur `TIMEOUTS_MS.inpaint` = 60 s → `StepError("inpaint")`, `Promise.race`, `run.catch(()=>{})`, `finally` cleanup). `fal.subscribe(MODELS.inpaint, { input: { image_url, mask_url, prompt: EMPTY_ROOM_PROMPT, output_format:"jpeg", safety_tolerance:"6" }, header lifecycle 24 h, onQueueUpdate→onPhase })`. Sortie : `images[0].url` → `{ emptyRoom }` ; URL vide/absente ⇒ `throw StepError` (jamais de succès sans image). `catch` → `StepError("inpaint", true)` (jamais d'erreur fal native, AD-8). Masque FLUX Fill : blanc = zone régénérée = notre AD-7, **aucune inversion**.
- **`pipeline/types.ts`** : `InpaintResult { emptyRoom: string }`. **`pipeline/config.ts`** : `inpaint` ajouté à `FAL_ALLOWED_ENDPOINTS` (`/**` + exact) — sinon le proxy refuse (piège n°1). `MODELS.inpaint`/`TIMEOUTS_MS.inpaint` existaient déjà. **`pipeline/index.ts`** : export `inpaint` + `InpaintResult`. **`pipeline/prompts.ts`** : `EMPTY_ROOM_PROMPT` renseigné (concept anglais, à calibrer au live).
- **`state/effects.ts`** : `runInpaint(state, dispatch, {signal, isStale})` — garde photo+mask ; **upload paresseux de la photo canonique** (`photo.blob` ≤1024, PAS `detectionBlob`) → `PHOTO_UPLOADED` (mémoïsé, réutilisé par la régénération 3.3) ; `inpaint(photoUrl, maskUrl)` → garde `dead()` → `INPAINT_SUCCEEDED`. Échec → `SET_ERROR` (StepError inpaint, contrairement à `runValidateMask` qui lève). SEULE couche appelant `pipeline/`.
- **`state/reducer.ts`** : `INPAINT_SUCCEEDED { emptyRoomUrl }` (pur) — pose `emptyRoom`, `waitPhase`/`error` à `undefined`, **n'avance pas** l'étape, **ne bump pas** l'epoch (production, pas invalidation). Pas de garde `step` (back-nav aborte via l'effet ; symétrie `DETECT_SUCCEEDED`).
- **`components/empty-room-surface.tsx`** (nouveau) : effet d'entrée déclenchant `runInpaint` (AbortController + epochRef, deps hors `waitPhase`, cleanup abort). Affiche l'image `emptyRoom` (URL fal directe) ou un placeholder pendant la génération ; `WaitPanel`/`ErrorBanner` restent des overlays de `ParcoursScene`. Relance = `CLEAR_ERROR` (bouton ErrorBanner) → l'effet redéclenche car `emptyRoom` toujours absent. **`components/parcours-scene.tsx`** : `step==="emptyRoom"` → `<EmptyRoomSurface />`.
- **Tests** : `inpaint.test.ts` (6, frontière `./client` mockée — URL sortie, input photo/mask, phases, no-image→StepError, url vide→StepError, erreur fal→StepError sans trace). `effects.test.ts` +8 (`runInpaint` : upload paresseux, mémoïsation, no-op mask/photo absents, stale, aborté, SET_ERROR, phases). `reducer.test.ts` +1 (`INPAINT_SUCCEEDED`). `config.test.ts` mis à jour (inpaint désormais autorisé, video fermé).
- **123 tests verts** (+14), `tsc`/`lint`/`build` OK. Composant + qualité du déclutter + bandeau d'erreur → **vérif live (FAL_KEY) en attente**.

### File List

- `src/pipeline/inpaint.ts` (nouveau)
- `src/pipeline/inpaint.test.ts` (nouveau)
- `src/pipeline/types.ts` (modifié — `InpaintResult`)
- `src/pipeline/config.ts` (modifié — `inpaint` dans `FAL_ALLOWED_ENDPOINTS`)
- `src/pipeline/config.test.ts` (modifié — assertion allowlist inpaint)
- `src/pipeline/index.ts` (modifié — exports `inpaint`/`InpaintResult`)
- `src/pipeline/prompts.ts` (modifié — `EMPTY_ROOM_PROMPT`)
- `src/state/effects.ts` (modifié — `runInpaint`)
- `src/state/effects.test.ts` (modifié — mock `inpaint` + suite `runInpaint`)
- `src/state/reducer.ts` (modifié — action `INPAINT_SUCCEEDED`)
- `src/state/reducer.test.ts` (modifié — test `INPAINT_SUCCEEDED`)
- `src/components/empty-room-surface.tsx` (nouveau)
- `src/components/parcours-scene.tsx` (modifié — câblage étape emptyRoom)

## Change Log

- 2026-07-12 : Story 3.1 créée (create-story) — contexte exhaustif pour la génération de la Pièce vide (premier inpaint fal, `flux-pro/v1/fill`). Statut → ready-for-dev.
- 2026-07-12 : Story 3.1 implémentée (dev-story, TDD) — adaptateur `inpaint` (`flux-pro/v1/fill`, motif `detect`), `runInpaint` effect (upload paresseux photo canonique + AD-12), `INPAINT_SUCCEEDED` reducer, `EmptyRoomSurface` + câblage `ParcoursScene`, allowlist proxy. 123 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-12 : Revue adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor, en parallèle). ACs 1–5 tous PASS statiquement (3 clauses live-only correctement scopées). 0 CRITICAL réel après recalibrage. 2 correctifs, 5 écartés/différés (voir section revue). 123 tests verts. Statut → **done**. Vérif live (FAL_KEY) en attente.

## Senior Developer Review (AI)

**Date :** 2026-07-12 · **Résultat :** Approuvé après 2 correctifs · **Verdict ACs :** AC1–AC5 PASS statiquement ; rétention fal 24 h, qualité visuelle du déclutter et check console d'échec réel = vérifiables uniquement en live (FAL_KEY), correctement scopés par la story.

### Correctifs appliqués

- [x] **[Moyen]** `empty-room-surface.tsx` : l'`<img>` en `h-full w-full` dans un conteneur sans hauteur explicite pouvait s'effondrer à hauteur nulle (image invisible) + layout shift au chargement → `h-auto w-full` (hauteur pilotée par le ratio naturel). (Blind Hunter, recalibré Bas→Moyen)
- [x] **[Bas]** `empty-room-surface.tsx` : commentaire explicitant pourquoi `state.originalPhoto` est **intentionnellement** hors des deps de l'effet (il change à `PHOTO_UPLOADED` en cours de run ; l'inclure rejouerait l'effet et rejouerait l'inpaint = abort-loop corrigé en 2.1). La divergence avec `mask-surface` est délibérée et plus sûre ici. (Edge Case Hunter)

### Écartés / Différés (documentés)

- **Différé — signal d'abort dans `uploadArtifact`** (Edge Case Hunter, annoncé CRITICAL/HIGH → recalibré **Bas**) : en StrictMode dev le double-montage duplique l'**upload storage** de la photo canonique, et un back-nav pendant l'upload laisse celui-ci se terminer (non abortable). **Pas de double *génération*** : le run A abandonne au `dead()` **avant** d'appeler `inpaint()` (son signal est aborté au cleanup) — seul l'upload storage (quasi gratuit, expire 24 h) est gaspillé. Motif **pré-existant identique** dans `runDetect` (Epic 2, live-vérifié). Le vrai correctif = threader un `AbortSignal` dans `uploadArtifact`/`fal.storage.upload`, ce qui touche `client.ts` + 3 appelants (detect/validate/inpaint) → **amélioration transverse hors périmètre 3.1**, à traiter globalement (dépend aussi du support d'un signal par `fal.storage.upload`).
- **Écarté — `safety_tolerance` en nombre** (Blind Hunter) : l'OpenAPI fal de `flux-pro/v1/fill` définit `safety_tolerance` comme **enum de chaînes** `"1"`–`"6"` (défaut `"2"`) — `"6"` (string) est **correct**, vérifié 2026-07-12.
- **Écarté — assertion de dimensions dans l'adaptateur** (Edge Case Hunter) : l'invariant masque↔photo canonique est garanti **en amont** (le masque est encodé aux dimensions canoniques dans `mask-encode`, assertion `data.length === width*height` en 2.3) ; aucun check local bon marché (comparer exigerait de décoder l'URL fal du masque) → sur-ingénierie.
- **Écarté — raisonnement micro/macrotask du commentaire `INPAINT_SUCCEEDED`** (Blind Hunter) : même si la garde d'abort se déclenchait tard, l'argument de repli tient (poser `emptyRoom` sur une autre étape est inoffensif : artefact amont préservé, ré-invalidé à la prochaine avance). Commentaire adéquat.
- **Repli éco `flux-2/klein/4b/base/edit`** (Acceptance Auditor, transparence) : non enregistré dans `MODELS` — explicitement documentaire/non câblé par les Dev Notes de la story ; pas une lacune.
