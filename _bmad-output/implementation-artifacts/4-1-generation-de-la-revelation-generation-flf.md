---
baseline_commit: db5829d
---

# Story 4.1: Génération de la Révélation (Génération FLF)

Status: done

## Story

As a utilisateur,
I want lancer la génération de ma vidéo où les meubles atterrissent exactement à leur place,
so that j'obtienne la Révélation cinématique qui fait tout l'intérêt du produit.

## Acceptance Criteria

1. **Given** une Pièce vide (`generation.emptyRoom`) et la Photo originale canonique **When** l'utilisateur clique « Créer ma vidéo » (avance à l'étape Vidéo, Story 3.2) **Then** la couche effectrice appelle l'adaptateur `video(emptyRoomUrl, photoUrl)` via la queue fal (`fal.subscribe`) avec `AbortSignal` et jeton d'époque, en mode **FLF strict** : **première frame contrainte = Pièce vide (`start_image_url`), dernière frame contrainte = Photo originale (`end_image_url`)** (FR-10, AD-1, AR-PIPELINE, AR-QUEUE, AR-ASYNC) **And** le modèle `fal-ai/kling-video/o1/image-to-video` est référencé **par rôle** dans `pipeline/config.ts` (replis `wan/v2.7` `end_image_url` obligatoire / `wan-flf2v` — non câblés, documentaires) **And** le prompt de mouvement du preset « mix côtés + plafond » vit dans `pipeline/prompts.ts` (`REVEAL_MOTION_PROMPT`, AR-PROMPTS).
2. **Given** une Révélation générée **When** elle est produite **Then** l'URL du MP4 est stockée dans `generation.reveal` (storage fal, rétention 24 h) ; sa dernière frame ≈ Photo originale, sa première ≈ Pièce vide, les meubles apparaissent **en mouvement** (jamais fondu/apparition instantanée) ; ~5 s, ratio de la photo canonique préservé (jamais de crop 16:9 forcé), ≤ 1080p (FR-10, AD-1, AR-PIXELS) — *clauses visuelles = vérif live*.
3. **Given** la Génération FLF en cours (1–3 min) **When** l'utilisateur attend **Then** le Panneau d'attente affiche les phases nommées via `WaitPhase` (« Génération de la Révélation » pour l'étape video ; « Envoi de vos images » si un upload a lieu ; « Finalisation »), le temps écoulé, l'annonce « 1 à 3 minutes », et à 3 min 30 s le message « plus long que prévu » (FR-14, UX-DR11, AD-14).
4. **Given** un appel vidéo qui échoue ou dépasse son délai (~6 min) **When** l'erreur survient **Then** un `StepError { step: 'video', retryable: true }` produit le Bandeau d'erreur « La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. » ; la relance ne repart jamais du début du Parcours et conserve emptyRoom + mask (FR-17, AR-ERRORS, AD-8) **And** aucune erreur fal native n'atteint l'UI.

## Tasks / Subtasks

- [x] Task 1 : `src/pipeline/video.ts` — adaptateur FLF (AC: 1, 4)
  - [x] `video(emptyRoomUrl: string, photoUrl: string, { signal, onPhase }: AdapterOptions): Promise<VideoResult>` — fonction async **passive** (AD-12), calquée **exactement** sur `inpaint.ts`/`detect.ts` : `AbortController` interne chaîné au `signal` ; `timeoutPromise` sur `TIMEOUTS_MS.video` (360 000 = 6 min) → `reject(makeStepError("video", true))` ; `Promise.race`, `run.catch(()=>{})`, `finally` cleanup.
  - [x] `fal.subscribe(MODELS.video, { input: { start_image_url: emptyRoomUrl, end_image_url: photoUrl, prompt: REVEAL_MOTION_PROMPT, duration: "5" }, abortSignal, headers: { "x-fal-object-lifecycle-preference": …86400 }, onQueueUpdate } )`. **FLF strict (AD-1)** : `start_image_url` = Pièce vide (1re frame), `end_image_url` = Photo originale (dernière frame) — `end_image_url` **toujours fourni** (obligatoire, jamais optionnel). `onQueueUpdate` mappe `IN_QUEUE→"queued"`, `IN_PROGRESS→"generating"`, `COMPLETED→"finalizing"` via `onPhase`.
  - [x] `@fal-ai/client` via `./client` uniquement (AD-5). Sortie : `result.data.video.url` → `{ reveal: url }`. URL vide/absente ⇒ `throw makeStepError("video", true)`. `catch` global → `throw makeStepError("video", true)` (jamais d'erreur fal native, AD-8). Marquer `[ASSUMPTION — calibrer au live]` le mapping de champ (comme detect/inpaint) ; contrat app `{ reveal }` stable.
  - [x] NE PAS passer d'`aspect_ratio` (le schéma kling o1 n'en a pas → le modèle infère le ratio des frames d'entrée = ratio canonique, AR-PIXELS ; pas de crop 16:9). `duration: "5"`.
- [x] Task 2 : Contrat & registre pipeline (AC: 1)
  - [x] `src/pipeline/types.ts` : `VideoResult { reveal: string }` (URL fal du MP4). Documenter.
  - [x] `src/pipeline/config.ts` : `MODELS.video` **existe déjà** (`fal-ai/kling-video/o1/image-to-video`) et `TIMEOUTS_MS.video` (360 000) **aussi** — NE PAS recréer. **Ajouter `video` à `FAL_ALLOWED_ENDPOINTS`** (`` `${MODELS.video}/**` `` + exact) sinon le proxy refuse. Mettre à jour le commentaire (video n'est plus « fermé »).
  - [x] `src/pipeline/index.ts` : exporter `video` + type `VideoResult`.
  - [x] `src/pipeline/prompts.ts` : renseigner `REVEAL_MOTION_PROMPT` (vide aujourd'hui). Preset « mix côtés + plafond » : décrire les meubles qui **flottent et se posent** depuis les côtés et le plafond, révélation cinématique fluide, **jamais** de fondu/apparition. Anglais. `[À calibrer au live]`. Kling o1 permet `@Image1` (start) / `@Image2` (end) dans le prompt — utilisable mais optionnel.
  - [x] `src/pipeline/config.test.ts` : mettre à jour l'assertion allowlist (video désormais autorisé).
- [x] Task 3 : `src/state/effects.ts` — `runVideo` (AC: 1, 3, 4)
  - [x] `runVideo(state, dispatch, { signal, isStale }): Promise<void>` (AD-12), calqué sur `runInpaint` : garde `photo = state.originalPhoto` et `emptyRoomUrl = state.emptyRoom` ; si l'un `undefined` → return. `dead()`, `onPhase`.
  - [x] `photoUrl = photo.falUrl` ; **normalement déjà défini** (uploadé par `runInpaint` en 3.1). Par sécurité, upload paresseux si `undefined` (SET_WAIT_PHASE "uploading" → `uploadArtifact(photo.blob)` → `dead()` → `PHOTO_UPLOADED`), comme `runInpaint`.
  - [x] `result = await video(emptyRoomUrl, photoUrl, { signal, onPhase })` → `if (dead()) return` → `dispatch(VIDEO_SUCCEEDED { revealUrl: result.reveal })`. `catch` : `if (dead()) return` sinon `dispatch(SET_ERROR { error: isStepError(err) ? err : makeStepError("video", true) })`. SEULE couche appelant `pipeline/` (AR-LAYERS).
- [x] Task 4 : `src/state/reducer.ts` — action `VIDEO_SUCCEEDED` (AC: 2)
  - [x] Ajouter `{ type: "VIDEO_SUCCEEDED"; revealUrl: string }` à `GenerationAction`.
  - [x] Cas reducer **pur** : pose `reveal = action.revealUrl`, `waitPhase: undefined`, `error: undefined`. **N'avance pas** (dernière étape), **ne bump pas** l'epoch (production, pas invalidation). Motif **exact** `INPAINT_SUCCEEDED`. Pas de garde `step` (back-nav aborte via l'effet ; symétrie).
- [x] Task 5 : `src/components/video-surface.tsx` (nouveau) — surface Vidéo (AC: 1, 3)
  - [x] Composant client, motif **exact** de `empty-room-surface.tsx` (3.1). Effet d'entrée déclenchant `runVideo` : `if (state.step !== "video") return; if (state.emptyRoom === undefined) return; if (state.reveal !== undefined) return; if (state.error !== undefined) return;` + `AbortController` + `epochRef` (`isStale`), `return () => controller.abort()`. Deps `[state.step, state.epoch, state.emptyRoom, state.reveal, state.error]` (+ `eslint-disable exhaustive-deps` ; `originalPhoto` volontairement hors deps — même raison qu'en 3.1). `epochRef` synchronisé par un effet sur `state.epoch`.
  - [x] Rendu **minimal** (le lecteur poli — autoplay, lueur or, contrôles, Espace — est **Story 4.2**, hors périmètre) : quand `state.reveal` défini, afficher `<video src={reveal} controls className="…max-w-3xl rounded-lg…" />` (chargement direct de l'URL fal publique, AD-4 permet les GET non authentifiés). Sinon placeholder `aspect-[4/3]` (comme 3.1). `WaitPanel`/`ErrorBanner` restent des overlays de `ParcoursScene`.
- [x] Task 6 : `src/components/parcours-scene.tsx` — câblage étape video (AC: 1, 4)
  - [x] Remplacer le placeholder `« Cette étape arrive bientôt »` (fall-through) par `if (state.step === "video") return <VideoSurface />;`. Vérifier que l'`ErrorBanner` global (relance video, `RETRY_LABEL.video = "Relancer la vidéo"` déjà mappé) → `onRetry` = `CLEAR_ERROR` → l'effet d'entrée relance `runVideo` (reveal toujours absent, error repasse à `undefined`) — relance limitée à l'étape (AR-ERRORS ; emptyRoom + mask conservés, jamais touchés par SET_ERROR/CLEAR_ERROR).
- [x] Task 7 : Vérification (AC: 1–4)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (aucune régression Epics 1–3).
  - [x] **Live (FAL_KEY)** : Pièce vide → « Créer ma vidéo » → étape Vidéo (stepper 4/4) → inpaint… non : `runVideo` déclenché → proxy (POST submit + GET polling 202→200), WaitPanel « Génération de la Révélation… » + « 1 à 3 minutes », puis le MP4 s'affiche (`<video>`). Vérifier : `generation.reveal` posé (URL fal), requête kling reçoit **`start_image_url` = emptyRoom** et **`end_image_url` = photo canonique** (FLF strict), sortie MP4 **au ratio de la photo** (pas de 16:9 forcé — tester une 4:3), dernière frame ≈ photo / première ≈ pièce vide, meubles **en mouvement**. **Erreur** : simuler un échec → Bandeau « Relancer la vidéo », relance sans repartir du début. 0 erreur fal native en console.

## Dev Notes

### État en place (NE PAS recréer)

- **Domaine** : `Generation.reveal?: string`, `emptyRoom?: string`, `originalPhoto.falUrl?` **existent**. `WaitPhase` (uploading/queued/generating/finalizing), `PipelineStep` inclut `"video"`, `PIPELINE_STEP_TO_PARCOURS.video = "video"`, `step-error.ts` a **déjà** le message video (« La vidéo n'a pas abouti… »). Rien à créer côté taxonomie.
- **Reducer** : `INPAINT_SUCCEEDED` = **le motif exact** à copier pour `VIDEO_SUCCEEDED` (pose l'artefact, clear waitPhase/error, pas d'avance, pas de bump). `PHOTO_UPLOADED` mémoïse `falUrl`. `CONFIRM_ADVANCE_FROM("video")` (bouton « Créer ma vidéo » de 3.2) a **déjà** amené le step à `"video"` + bumpé l'epoch. `REGENERATE_EMPTY_ROOM` (3.3) invalide `reveal` + bump epoch → une régé de Pièce vide détruit bien la Révélation (AC déjà couvert amont).
- **pipeline** : `inpaint.ts` = motif adaptateur (abort chaîné, timeout→StepError, race, onQueueUpdate→onPhase, header 24 h, catch→StepError). `client.ts` (`fal`, `uploadArtifact`). `config.ts` (`MODELS.video`, `TIMEOUTS_MS.video`=360 000, `ARTIFACT_EXPIRES_IN_SECONDS`, `FAL_ALLOWED_ENDPOINTS`). `types.ts` (`AdapterOptions`, `DetectResult`, `InpaintResult`). `prompts.ts` (`REVEAL_MOTION_PROMPT` vide).
- **effects** : `runDetect`/`runInpaint`/`runValidateMask` — `runVideo` s'ajoute, **même signature/gardes** que `runInpaint` (upload paresseux + `dead()` + `onPhase`).
- **UI** : `wait-copy.ts` renvoie **déjà** « Génération de la Révélation » pour `step==="video"` (queued/generating) et gère `LONG_WAIT_MS` (3 min 30). `WaitPanel` (keyé par epoch) + `ErrorBanner` (`RETRY_LABEL.video` = « Relancer la vidéo ») = overlays de `ParcoursScene`. `empty-room-surface.tsx` (3.1) = **motif exact** du composant (effet d'entrée AD-12, epochRef, placeholder). `parcours-scene.tsx` : `video` tombe encore sur le placeholder « Cette étape arrive bientôt » → à remplacer.
- **Contrat kling o1** (vérifié fal 2026-07-12) : entrée `start_image_url` (requis, 1re frame), `end_image_url` (optionnel côté fal — **rendu obligatoire** par l'adaptateur, AD-1), `prompt` (requis), `duration` (enum "3"–"10", déf "5"), `negative_prompt` (déf « blur, distort, and low quality »), `cfg_scale` (déf 0.5). **Pas d'`aspect_ratio`** → ratio inféré des frames (AR-PIXELS OK). Sortie `{ video: { url, file_size, file_name, content_type } }`.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-1 / FLF strict** : ordre fixe Détection→Inpainting→FLF ; **1re frame = Pièce vide, dernière frame = Photo originale strictement intouchée**. Mode FLF **dédié** (start ET end contraints) — jamais d'image-to-video simple ni de « tail image » indicatif. `end_image_url` toujours fourni. [Source: ARCHITECTURE-SPINE.md#AD-1, ligne 165]
- **AD-2 / AR-PIXELS** : la Révélation conserve le **ratio de la photo canonique** de bout en bout — **jamais de crop 16:9 forcé** (une 4:3 donne une vidéo 4:3). Résolution ≤ 1080p, framerate natif du modèle (≥ 24 fps, **pas de transcodage**). Ne pas envoyer d'`aspect_ratio`. [Source: ARCHITECTURE-SPINE.md#AD-2 amendement, Deferred ligne 221]
- **AD-5 / AR-PIPELINE** : `video(emptyRoomUrl, photoUrl)` ne consomme que des **URLs fal** (emptyRoom = sortie inpaint ; photo = `originalPhoto.falUrl` mémoïsé). Modèle par rôle. `@fal-ai/client` via `pipeline/` seul. [Source: ARCHITECTURE-SPINE.md#AD-5, ligne 80]
- **AD-8 / AR-ERRORS** : échec/timeout (6 min, détecté par l'adaptateur) → `StepError { step:"video", retryable:true }` (message FR existant) → Bandeau, relance limitée à l'étape Vidéo, amont conservé, jamais d'erreur fal native. [Source: ARCHITECTURE-SPINE.md#AD-8]
- **AD-9 / AR-EPHEMERAL** : header rétention 24 h sur la requête vidéo. Le MP4 vit sur fal ; jamais re-hébergé (le download 4.3 = fetch client→Blob→objectURL). [Source: ARCHITECTURE-SPINE.md#AD-9]
- **AD-10 / AR-QUEUE** : appel long via `fal.subscribe` (queue + polling) depuis le navigateur via le proxy ; les statuts queue alimentent les phases. Pas de webhook/orchestration serveur. [Source: ARCHITECTURE-SPINE.md#AD-10, ligne 111]
- **AD-12 / AR-ASYNC** : orchestration dans `effects.ts` seul ; `AbortController` + epoch ; résultat périmé jeté sans dispatch. **L'effet vidéo DOIT keyer abort/`isStale` sur `state.epoch`** (comme detect/inpaint) pour qu'une régé de Pièce vide (3.3, bump epoch) l'avorte (note de la revue 3.3). Reducer pur. [Source: ARCHITECTURE-SPINE.md#AD-12, 3-3 review]
- **AD-14 / AR-WAITPHASE** : `WaitPhase` unique ; traduction FR dans `wait-copy.ts` (déjà OK pour video). Monotonie par tentative. [Source: ARCHITECTURE-SPINE.md#AD-14]
- **AR-LAYERS** : `VideoSurface` dispatche l'intention (déclenche `runVideo` au montage) ; n'importe jamais `pipeline/`.

### Contraintes UX (font foi)

- L'entrée sur l'étape Vidéo lance la génération **automatiquement** (le clic « Créer ma vidéo » de 3.2 EST l'intention ; pas de second bouton). [Source: EXPERIENCE.md:138]
- Annonce « 1 à 3 minutes » (déjà sur le bouton 3.2 + dans le WaitPanel). Phases nommées, temps écoulé, message doux à 3 min 30 (`LONG_WAIT_MS`, déjà géré par `WaitPanel`). [Source: EXPERIENCE.md, UX-DR11]
- **Périmètre 4.1 = génération seulement.** Le Lecteur (autoplay, lueur or, lecture/pause, Espace, pas de confetti) est **Story 4.2** — rendu minimal ici (`<video controls>`). [Source: epics.md#4.2]

### Pièges connus

- **Allowlist proxy** : ⚠️ ajouter `video` à `FAL_ALLOWED_ENDPOINTS` (cause d'échec n°1, comme inpaint en 3.1).
- **FLF strict** : `start_image_url` = **emptyRoom**, `end_image_url` = **photo** — NE PAS inverser (sinon la vidéo se meuble→vide au lieu de vide→meublé). `end_image_url` **toujours** fourni (AD-1) même si fal le dit optionnel.
- **Pas d'`aspect_ratio`** : ne rien passer → ratio des frames préservé. Si une sortie 16:9 forcée est observée en live sur une 4:3, c'est un critère d'échec du modèle (AD-2) → repli wan-flf2v (documenté, non câblé ici) — noter, ne pas bricoler un crop.
- **`emptyRoom` et `photo` sont déjà des URLs fal** : `emptyRoom` = sortie bria eraser ; `photo.falUrl` = upload mémoïsé (3.1). Aucun ré-upload attendu (l'upload paresseux est un garde-fou). Ne PAS ré-encoder/ré-uploader la Pièce vide.
- **Effet d'entrée** : exclure `waitPhase` des deps (boucle d'abort 2.1). Garder sur `reveal`/`error` pour ne pas boucler ; relance via `CLEAR_ERROR`.
- **Ne pas construire le lecteur ici** (4.2) : `<video controls>` minimal suffit pour prouver la génération.
- **Timeout 6 min** : long — le WaitPanel doit rester monté (keyé par epoch, inchangé pendant l'attente). Ne pas ajouter de chrono d'échec UI (l'adaptateur seul gère le timeout).

### Testing Requirements

- **Pur (Vitest)** :
  - `pipeline/video.test.ts` (frontière `./client` mockée, motif `inpaint.test.ts`) : sortie `video.url`→`reveal` ; input `start_image_url`=emptyRoom + `end_image_url`=photo + `duration` ; phases queue→onPhase ; pas de video/url→StepError ; url vide→StepError ; rejet→StepError video sans trace native.
  - `state/reducer.test.ts` : `VIDEO_SUCCEEDED` (pose reveal, waitPhase/error undefined, epoch inchangé, step reste video, emptyRoom/mask/originalPhoto conservés).
  - `state/effects.test.ts` : `runVideo` (mock `video`+`uploadArtifact`) — nominal (falUrl présent → pas d'upload → VIDEO_SUCCEEDED) ; falUrl absent → upload paresseux → PHOTO_UPLOADED ; emptyRoom/photo absent → no-op ; dead (stale/aborté) → pas de dispatch ; échec → SET_ERROR video ; phases. Ajouter `video` au mock `@/pipeline` (motif `inpaint`).
  - `pipeline/config.test.ts` : video désormais dans l'allowlist.
- **Non testable jsdom → live (FAL_KEY)** : `video.ts` (appel kling réel), rendu `<video>`, FLF (frames), ratio préservé, mouvement, bandeau/relance. `fal.subscribe` mocké en unit.
- Régression : suites 1.x/2.x/3.x vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Nouveaux** : `src/pipeline/video.ts` (+ `.test.ts`), `src/components/video-surface.tsx`.
- **Modifs** : `src/pipeline/config.ts` (allowlist) + `.test.ts`, `src/pipeline/index.ts`, `src/pipeline/types.ts` (`VideoResult`), `src/pipeline/prompts.ts` (`REVEAL_MOTION_PROMPT`), `src/state/effects.ts` (+ test — `runVideo`), `src/state/reducer.ts` (+ test — `VIDEO_SUCCEEDED`), `src/components/parcours-scene.tsx` (câblage video).
- Nommage anglais (glossaire : `reveal`). Composant nommé d'après l'étape (`video-surface.tsx`, comme `empty-room-surface.tsx`). Le lecteur `reveal-player` viendra en 4.2.
- ⚠️ AGENTS.md : « This is NOT the Next.js you know » — `<video>` dans un composant client, rien de spécial mais rester prudent.

### References

- [Source: epics.md#Story 4.1]
- [Source: ARCHITECTURE-SPINE.md#AD-1, AD-2 (AR-PIXELS), AD-5, AD-8, AD-9, AD-10 (AR-QUEUE), AD-12, AD-14 ; ligne 165 (modèle vidéo), 206, 221 (framerate deferred)]
- [Source: prd.md#FR-10, FR-14, FR-17 ; EXPERIENCE.md#Attente longue vidéo, UX-DR11 ; SM-1, NFR-1]
- [Source: src/pipeline/inpaint.ts (motif adaptateur), src/state/effects.ts#runInpaint (motif effet), src/components/empty-room-surface.tsx (motif surface + effet d'entrée), src/state/reducer.ts#INPAINT_SUCCEEDED]
- [Source: fal.ai/models/fal-ai/kling-video/o1/image-to-video — schéma vérifié 2026-07-12 ; [[roomreveal-bmad-progress]]]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Faux échec `import-boundary.test.ts` dû au cwd du shell dérivé (le test lit `process.cwd()`/src) — rétabli le cwd projet ; 139 tests verts.

### Completion Notes List

- **`pipeline/video.ts`** (nouveau) : adaptateur FLF calqué sur `inpaint`/`detect` (AbortController chaîné, `timeoutPromise` sur `TIMEOUTS_MS.video`=360 000, race, `run.catch`, `finally`). `fal.subscribe(MODELS.video, { input: { start_image_url: emptyRoomUrl, end_image_url: photoUrl, prompt: REVEAL_MOTION_PROMPT, duration:"5" }, header 24h, onQueueUpdate→onPhase })`. **FLF strict AD-1** : emptyRoom=1re frame, photo=dernière frame, `end_image_url` toujours fourni. **Pas d'`aspect_ratio`** (ratio des frames préservé, AR-PIXELS). Sortie `data.video.url`→`{ reveal }` ; vide/absent ou rejet → `StepError("video")` (jamais d'erreur fal native, AD-8).
- **`pipeline`** : `VideoResult { reveal }` (types.ts) ; `video` ajouté à `FAL_ALLOWED_ENDPOINTS` (config.ts, cause d'échec n°1) ; export `video`/`VideoResult` (index.ts) ; `REVEAL_MOTION_PROMPT` renseigné (preset « mix côtés + plafond » : meubles qui flottent et se posent, pas de fondu ; à calibrer live). `config.test` mis à jour (3 modèles autorisés).
- **`state/effects.ts`** `runVideo` : garde emptyRoom+photo ; upload paresseux de la photo (filet — normalement déjà sur fal via 3.1) ; `video(emptyRoomUrl, photoUrl)` → garde `dead()` → `VIDEO_SUCCEEDED`. Échec → `SET_ERROR` video. Keye abort/`isStale` sur l'epoch (une régé 3.3 l'avorte).
- **`state/reducer.ts`** `VIDEO_SUCCEEDED` (pur) : pose `reveal`, clear waitPhase/error, pas d'avance, pas de bump (motif `INPAINT_SUCCEEDED`).
- **`components/video-surface.tsx`** (nouveau) : effet d'entrée déclenchant `runVideo` (motif 3.1, deps hors `waitPhase`/`originalPhoto`, cleanup abort) ; rendu **minimal** `<video controls>` de `reveal` ou placeholder (le lecteur poli = 4.2). **`parcours-scene.tsx`** : `step==="video"` → `<VideoSurface />` (remplace le placeholder ; les 4 surfaces sont désormais implémentées).
- **Tests** : `video.test.ts` (8) ; `effects.test.ts` +5 (`runVideo`) ; `reducer.test.ts` +1 (`VIDEO_SUCCEEDED`) ; `config.test` maj. **139 tests verts** (+13), `tsc`/`lint`/`build` OK. Appel kling réel + FLF (frames) + ratio + mouvement + `<video>` + bandeau/relance = **vérif live (FAL_KEY) en attente**.

### File List

- `src/pipeline/video.ts` (nouveau)
- `src/pipeline/video.test.ts` (nouveau)
- `src/pipeline/types.ts` (modifié — `VideoResult`)
- `src/pipeline/config.ts` (modifié — `video` dans `FAL_ALLOWED_ENDPOINTS`)
- `src/pipeline/config.test.ts` (modifié — allowlist 3 modèles)
- `src/pipeline/index.ts` (modifié — exports `video`/`VideoResult`)
- `src/pipeline/prompts.ts` (modifié — `REVEAL_MOTION_PROMPT`)
- `src/state/effects.ts` (modifié — `runVideo`)
- `src/state/effects.test.ts` (modifié — mock `video` + suite `runVideo`)
- `src/state/reducer.ts` (modifié — action `VIDEO_SUCCEEDED`)
- `src/state/reducer.test.ts` (modifié — test `VIDEO_SUCCEEDED`)
- `src/components/video-surface.tsx` (nouveau)
- `src/components/parcours-scene.tsx` (modifié — câblage étape video)

## Change Log

- 2026-07-12 : Story 4.1 créée (create-story) — génération de la Révélation FLF (premier appel vidéo fal, kling o1 : `start_image_url`=Pièce vide, `end_image_url`=Photo originale). Adaptateur `video`, `runVideo`, `VIDEO_SUCCEEDED`, `video-surface` (rendu minimal ; lecteur = 4.2). Statut → ready-for-dev.
- 2026-07-12 : Story 4.1 implémentée (dev-story) — adaptateur `video` (kling o1 FLF strict), `runVideo` effect, `VIDEO_SUCCEEDED` reducer, `VideoSurface` + câblage, allowlist proxy, `REVEAL_MOTION_PROMPT`. 139 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-12 : Revue adversariale (Blind + Edge + Acceptance). ACs 1-4 tous PASS (message d'erreur exact, FLF non inversé, modèle par rôle, header 24h sur l'appel vidéo, « 1 à 3 min » gated video). 0 CRITICAL. 2 correctifs, reste noté. 139 tests verts. Statut → **done**. Vérif live en attente.

## Senior Developer Review (AI)

**Date :** 2026-07-12 · **Résultat :** Approuvé après 2 correctifs · **Verdict ACs :** AC1-AC4 PASS statiquement (FLF strict start=emptyRoom/end=photo, modèle par rôle, header rétention 24 h sur la requête vidéo, message d'erreur FR exact, « 1 à 3 minutes » gated video). Qualité visuelle (frames/mouvement/ratio/résolution) = live-only (correctement scopée).

### Correctifs appliqués

- [x] **[Moyen]** Dead-air du WaitPanel à l'entrée Vidéo : `runVideo` n'émettait aucune phase avant le 1er `onQueueUpdate` de fal → sur un job long (6 min) l'utilisateur voyait le placeholder sans panneau/chrono/« 1 à 3 min » (viole UX-DR11, affaiblit AC3). Correctif : **seed `SET_WAIT_PHASE "queued"` avant l'appel `video()`** (monotonie AD-14 accepte les phases réelles ensuite). (Edge Case Hunter)
- [x] **[Moyen]** Placeholder `aspect-[4/3]` codé en dur ≠ ratio réel → saut de layout quand le MP4 arrive après plusieurs minutes. Correctif : conteneur `VideoSurface` cadré au **ratio canonique** (`aspectRatio` depuis `originalPhoto.width/height`) ; placeholder et `<video>` partagent la même forme (le reveal préserve le ratio canonique, AR-PIXELS). (Blind Hunter)

### Écartés / Différés (documentés)

- **Écarté — test « dead après upload avant appel video »** (Blind, Bas) : la garde `dead()` est prouvée par les tests `runDetect`/stale ; motif structurellement identique. Pas de test ajouté (cohérent avec runInpaint).
- **Écarté — `VideoSurface` en `return` catch-all** de `StepSurface` (Blind, Bas) : les 4 étapes du `Step` union sont couvertes (upload/mask/emptyRoom/video) ; exhaustif par le typage. Pas de garde `if` explicite ajoutée.
- **Note — `finalizing` peint rarement** (Edge, Bas) : `COMPLETED`→`finalizing` suivi immédiatement de `VIDEO_SUCCEEDED` (waitPhase→undefined) → le panneau saute de generating au lecteur. Cosmétique, sans impact.
- **Note — « plus long que prévu » non gated par étape** (Acceptance) : fonctionnellement video-only (detect/inpaint timeout à 60 s < seuil 210 s). Correct en pratique.
- **Note — expiry 24 h de l'URL emptyRoom** (Edge, Bas) : session ouverte >24 h entre inpaint et vidéo → 404 de la 1re frame → échec **retryable** correct (mais la relance re-fetch la même URL expirée → l'utilisateur doit régénérer la Pièce vide). Acceptable v1.
- **Framerate exact 24 fps** (spine Deferred) : kling o1 sort son natif (~30 fps) sans transcodage (AD-2) — à trancher produit si le 24 fps exact devient une exigence.
