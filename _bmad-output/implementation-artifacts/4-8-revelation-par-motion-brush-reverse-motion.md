# Story 4.8: Révélation par Motion Brush (reverse-motion)

Status: ready-for-dev

<!-- Approche B différée (epics-deferred-improvements §5), promue le 2026-07-24 après
     constat que le FLF pur (kling puis veo 3.1 lite) morphe/fade quoi qu'on fasse au
     prompt (4.6 inclus). Développée en parallèle de la 4.7 (composite déterministe,
     autre worktree) — les deux sont des backends vidéo alternatifs derrière un flag,
     comparés en live. Recherche 2026-07-24 : voir Design Notes. -->

## Story

As a utilisateur,
I want que les meubles entrent réellement en glissant depuis les bords (mouvement piloté par masque, pas interpolation),
so that la Révélation cesse de ressembler à un « rêve fiévreux » qui morphe et se termine exactement sur ma photo meublée.

## Acceptance Criteria

1. **Backend sélectionnable** — **Given** `NEXT_PUBLIC_VIDEO_BACKEND` (`flf` défaut | `motion-brush`), **When** l'étape Vidéo génère, **Then** `flf` conserve **exactement** le comportement veo 3.1 lite actuel (zéro régression) et `motion-brush` emprunte le nouveau chemin Kling Motion Brush. Le flag vit dans `config.ts` (miroir de `DETECT_BACKEND`).
2. **Masques par instance (service local)** — **Given** le service Grounded-SAM, **When** le nouveau chemin en a besoin, **Then** une route `/instance-masks` renvoie un JSON `{ instances: [{label, box[0,1], area, mask: PNG base64}], static_mask: PNG base64 }` : chaque `mask` est le masque SAM **par objet** (déjà calculé dans `_segment_union` avant l'union), `static_mask` est l'inverse de l'union (la coquille de la pièce = brosse statique Kling). 204 si aucun meuble. `/detect`, `/point`, `/box` **inchangés**.
3. **Adaptateur Motion Brush** — **Given** la photo canonique et les masques par instance, **When** `videoMotionBrush(photoUrl, instanceMasks, staticMaskUrl, opts)` s'exécute, **Then** il uploade chaque masque sur fal (`uploadArtifact`), construit les `dynamic_masks` (un par objet : `mask_url` + `trajectories` = points de **sortie** dérivés de la boîte, direction inverse de l'heuristique 4.6), appelle `MODELS.videoMotionBrush` (`fal-ai/kling-video/v1.5/pro/image-to-video`) avec `image_url` = photo, `static_mask_url`, `dynamic_masks`, `prompt` (meubles glissant hors champ), `duration:"5"` — produisant la vidéo de **sortie** (meublé → vide).
4. **Inversion → reveal** — **Given** la vidéo de sortie générée, **When** l'adaptateur finalise, **Then** il la POST à la route locale `/reverse` (inversion temporelle via `imageio-ffmpeg`, binaire statique pip — aucune dépendance système), ré-uploade le MP4 inversé via `uploadArtifact`, et renvoie `{ reveal }` : les meubles **entrent** et la vidéo se termine sur le **rendu du modèle ré-encodé** — visuellement la photo meublée, mais **pas** pixel-exact (l'inversion est un ré-encodage avec perte). L'invariant strict de dernière frame (AD-1) est donc **approximé** par ce backend, pas tenu au pixel près.
5. **Orchestration** — **Given** `runVideo`, **When** `VIDEO_BACKEND === "motion-brush"`, **Then** la couche effectrice appelle `detectInstanceMasks(photo)` (juste-à-temps, chemin local) puis `videoMotionBrush(...)` sous les mêmes gardes AD-12 (AbortController, epoch, `dead()`) que le chemin flf ; échec → `StepError("video", true)` inchangé.
6. **Amendement de spine documenté** — la première frame du backend motion-brush est **générée par le modèle** (pièce quasi-vide après sortie des meubles), **pas** notre inpaint (`generation.emptyRoom` n'est pas consommée par ce backend) ; la dernière frame est le **rendu du modèle ré-encodé** (visuellement la photo meublée, pas pixel-exact). AD-1 (dernière frame contrainte) **approximé** par ce backend, pas tenu au pixel près ; la contrainte « première frame = Pièce vide exacte » est **relâchée pour ce backend uniquement**, décision pré-acceptée en choisissant l'approche 2. À inscrire dans ARCHITECTURE-SPINE (note d'amendement AD-1/AD-2).
7. Suites Vitest existantes vertes ; `tsc`, lint sans nouvelle erreur ; `py_compile` du service OK ; `local-detect/README.md` documente `/instance-masks` et `/reverse`.

## Tasks / Subtasks

- [ ] Task 1 — Service : masques par instance + inversion vidéo (AC: 2, 4)
  - [ ] `_segment_union` : extraire une variante `_segment_instances` renvoyant la LISTE des masques par boîte (ne pas casser l'union existante de `/detect`)
  - [ ] Route `/instance-masks` : `{ instances:[{label, box[0,1], area, mask b64}], static_mask b64 }` ; 204 si zéro boîte/union vide
  - [ ] Route `/reverse` : `UploadFile` MP4 → MP4 temporellement inversé (`imageio-ffmpeg`) → `Response(media_type="video/mp4")`
  - [ ] `local-detect/requirements.txt` : `imageio[ffmpeg]` ; `local-detect/README.md` : documenter les 2 routes
- [ ] Task 2 — Config + types (AC: 1, 3)
  - [ ] `config.ts` : `VIDEO_BACKEND` (`NEXT_PUBLIC_VIDEO_BACKEND`), `MODELS.videoMotionBrush`, `LOCAL_INSTANCE_MASKS_URL` + `LOCAL_REVERSE_URL`, `videoMotionBrush` dans `FAL_ALLOWED_ENDPOINTS` (+ test allowlist)
  - [ ] `types.ts` : `InstanceMask { label; box; area; mask: string }`, `InstanceMasksResult { instances: InstanceMask[]; staticMask: string }`
- [ ] Task 3 — Adaptateur détection masques par instance (AC: 2)
  - [ ] `detect-local.ts` (ou nouveau `instance-masks.ts`) : `detectInstanceMasks(blob, opts)` — POST `/instance-masks`, parse, dataURLs ; 204 → instances vides ; erreurs → `StepError("detect")` (+ test frontière)
- [ ] Task 4 — Heuristique trajectoire de sortie (pure) (AC: 3)
  - [ ] `motion-trajectory.ts` : `exitTrajectory(box, width, height): {x,y}[]` — centre boîte → bord le plus proche (inverse de `entryDirection` de 4.6), points en pixels image (+ test pur, 4 directions)
- [ ] Task 5 — Adaptateur `videoMotionBrush` (AC: 3, 4)
  - [ ] `video-motion-brush.ts` : upload masques → `dynamic_masks`+`static_mask_url` → kling v1.5 pro (sortie) → fetch → `/reverse` → `uploadArtifact` → `{ reveal }` ; passif AD-12, timeout, header 24 h, `StepError("video")` (+ test : mocks `./client`, `fetch(/reverse)`, `uploadArtifact`)
- [ ] Task 6 — Orchestration + spine (AC: 5, 6)
  - [ ] `effects.ts#runVideo` : branche `VIDEO_BACKEND` — `flf` inchangé ; `motion-brush` = `detectInstanceMasks(photo)` puis `videoMotionBrush` (+ test des 2 branches, gardes `dead()`)
  - [ ] `pipeline/index.ts` : exports ; `ARCHITECTURE-SPINE.md` : note d'amendement AD-1 (première frame relâchée pour ce backend)
- [ ] Task 7 — Vérification (AC: 7)
  - [ ] `npx vitest run` + `tsc` + `npm run lint` (pas de nouvelle erreur) + `py_compile` verts

## Dev Notes

### Contexte & décision (2026-07-24)

- Le FLF pur morphe par nature : l'interpolation encode début/fin en latent et « étale la différence » — pas de permanence d'objet, donc fondu/pop-in. Confirmé sur kling o1 PUIS veo 3.1 lite, prompt générique ET prompt par objet (4.6). Aucun prompt ne corrige ça (recherche web : « garder les deux frames similaires » — or pièce vide→pleine est le pire cas FLF).
- **Approche 2 = Motion Brush** : on pilote le mouvement par masque + trajectoire au lieu de l'interpolation. Contrainte API dure (doc Kling, vérifiée) : `image_tail` (frame de fin) est **mutuellement exclusif** avec `dynamic_masks`/`static_mask`/`camera_control`. On ne peut donc pas contraindre la dernière frame en utilisant les masques → on génère **à l'envers** (départ = photo meublée = frame parfaitement contrainte, meubles sortent) puis on **inverse le MP4** → meubles entrent, fin sur la photo. C'est le prix de la vraie lumière/ombre AI pendant le mouvement.
- L'autre worktree fait la 4.7 (composite déterministe client, garanti propre, 0 $). 4.8 et 4.7 coexistent derrière le flag `VIDEO_BACKEND` — comparaison live, le meilleur gagne. Ne PAS toucher au chemin flf ni au travail composite.

### Contrat Kling v1.5 pro image-to-video (fal, vérifié 2026-07-24)

`image_url` (requis, frame de départ) · `prompt` (requis) · `duration` ("5"|"10") · `tail_image_url` (**exclu** avec masques — NE PAS l'envoyer ici) · `static_mask_url` (zone brosse statique = ne bouge pas) · `dynamic_masks` (liste : `{ mask_url, trajectories: [{x,y}, …] }`, ≤ 6 éléments, points en **pixels image**) · `negative_prompt` · `cfg_scale` (déf 0.5). Sortie `{ video: { url } }`. Prix ~0,10 $/5 s standard (à confirmer live). Note : les champs Motion Brush (`dynamic_masks`+`static_mask_url`) sont portés par **v1.5 pro** (`KlingVideoV15ProImageToVideoInput`) ; v1.6 pro les a **retirés** (son type d'entrée n'a que `tail_image_url`).

### État en place (NE PAS recréer / NE PAS casser)

- **`video.ts`** (veo 3.1 lite) : chemin flf actuel — INTOUCHÉ. `videoMotionBrush` est un fichier séparé.
- **`server.py`** : `_detect_boxes` (GDINO, `text_labels`), `_segment_union` (SAM par boîte → union — la boucle par-boîte existe déjà, l'exposer sans unir), `/detect` (JSON 4.6 `{mask, instances}`), `/point`, `/box`, lazy loading, `BOX_THRESHOLD=0.22` — INTOUCHÉS.
- **`detect-local.ts`** : adaptateur passif (AbortController chaîné, timeout, 204, catch→StepError, logs diagnostics). `detectInstanceMasks` suit le même patron.
- **`effects.ts#runVideo`** (effects.ts:432) : gardes `dead()`/epoch/`onPhase`, upload paresseux photo, seed `queued`. La branche motion-brush réutilise ces gardes. Le chemin flf (buildRevealMotionPrompt + video()) reste tel quel dans la branche `flf`.
- **`uploadArtifact(blob)`** (`client.ts`, exporté par `index.ts`) : blob → URL fal 24 h. Utilisé pour masques + MP4 inversé → AD-9 préservé (le reveal final EST une URL fal).
- **`config.ts`** : `MODELS`, `FAL_ALLOWED_ENDPOINTS`, `TIMEOUTS_MS.video=360000`, `DETECT_BACKEND`/`LOCAL_DETECT_URL` (patron pour les nouvelles constantes).

### Contraintes d'architecture (spine)

- **AD-1** : dernière frame = rendu du modèle ré-encodé (visuellement la photo canonique, pas pixel-exact) — **APPROXIMÉ**, pas tenu au pixel près (l'inversion est un ré-encodage avec perte). Première frame relâchée pour ce backend (AC 6) — amendement à inscrire, décision produit assumée.
- **AD-2** : pas d'`aspect_ratio` forcé ; masques et trajectoires en pixels de l'image canonique/détection ; ratio préservé de bout en bout.
- **AD-5** : `@fal-ai/client` seulement via `pipeline/` ; `videoMotionBrush` référence le modèle par rôle (`config.ts`).
- **AD-8** : tout échec (fal, /reverse, upload) → `StepError("video", true)` ; jamais d'erreur brute en UI.
- **AD-9** : masques + MP4 inversé passent par `uploadArtifact` (fal, 24 h) ; le reveal reste une URL fal — pas de re-hébergement applicatif. La route `/reverse` est un traitement local transitoire (comme la détection locale), pas un stockage.
- **AD-12** : `videoMotionBrush` passif ; orchestration dans `effects.ts` seul ; résultat périmé jeté.
- **AD-14** : phases queue → `WaitPhase` dans l'adaptateur ; `uploading` émis pendant les uploads de masques.
- **AR-LAYERS** : l'UI ne change pas ; le lecteur (4.2) consomme `generation.reveal` quel que soit le backend.

### Pièges connus

- **`image_tail` × masques exclusifs** : NE JAMAIS envoyer `tail_image_url` avec `dynamic_masks`. La contrainte de fin vient de l'inversion, pas de l'API.
- **Sens des trajectoires** : SORTIE (centre → bord) car on génère le meublé→vide puis on inverse. C'est l'inverse de `entryDirection` (4.6). Un test doit fixer ce sens sans ambiguïté.
- **`/reverse` self-contained** : `imageio[ffmpeg]` embarque un ffmpeg statique — pas de dépendance système, pas d'impact sur le lazy loading des modèles (import léger, en tête de module). Lire les frames, inverser, ré-encoder même fps.
- **≤ 6 dynamic_masks** : Kling limite à 6 éléments. Cap aux 6 plus grosses instances par aire ; les autres relèvent de la brosse statique (restent en place au départ → apparaissent au début du reveal inversé). `log()` ce qui est capé (pas de troncature silencieuse).
- **static_mask = inverse union** : la coquille (murs/sol/fenêtres) ne doit pas bouger. Fournie par le service (`static_mask`), pas recalculée côté client.
- **Détection juste-à-temps** : le backend motion-brush appelle `detectInstanceMasks` dans `runVideo` (la détection du parcours renvoie l'union, pas les masques par instance). Assumé — ce backend ne dépend pas du masque édité par l'utilisateur (concern orthogonal).
- **Ne pas re-héberger sans passer par fal** : le MP4 inversé DOIT repasser par `uploadArtifact` pour rester une URL fal 24 h (AD-9) — le lecteur/téléchargement (4.2/4.3) sont inchangés.
- **Coût/latence** : 2 appels (kling + upload×N + reverse) → plus lent et plus cher que le flf ; c'est le compromis « premium ». Documenter le COGS réel en live (NFR-2).

### Testing Requirements

- **Pur (Vitest)** :
  - `motion-trajectory.test.ts` : `exitTrajectory` — 4 directions, points en pixels, ≥ 2 points, sens sortie.
  - `video-motion-brush.test.ts` (mocks `./client` `fal`+`uploadArtifact`, `fetch` pour `/reverse`) : `dynamic_masks`/`static_mask_url` présents dans l'input kling, PAS de `tail_image_url`, cap à 6, `/reverse` POSTé, MP4 inversé ré-uploadé, `{ reveal }` = URL fal ; échecs (kling, reverse, upload) → `StepError("video")` sans trace brute.
  - `detect-local.test.ts` (ou `instance-masks.test.ts`) : parse `/instance-masks`, dataURLs, 204, JSON malformé → `StepError("detect")`.
  - `effects.test.ts` : `runVideo` branche `flf` (inchangée) vs `motion-brush` (appelle detectInstanceMasks + videoMotionBrush) ; gardes `dead()`.
  - `config.test.ts` : `videoMotionBrush` dans l'allowlist.
- **Non testable jsdom → live (GPU + FAL_KEY)** : routes Python (`curl`), rendu Kling réel, qualité de l'inversion, verdict esthétique SM-1 (le morphing a-t-il disparu ?), COGS/latence réels. C'est le vrai juge — comme tout appel fal du projet.
- Régression : suites 1.x–5.x + 4.6 vertes ; `tsc` ; lint (2 erreurs pré-existantes texture-bank tolérées) ; build.

### Project Structure Notes

- **Nouveaux** : `src/pipeline/video-motion-brush.ts` (+test), `src/pipeline/motion-trajectory.ts` (+test), routes `/instance-masks` + `/reverse` dans `server.py`.
- **Modifs** : `local-detect/server.py`, `requirements.txt`, `README.md` ; `src/pipeline/{config.ts (+test), types.ts, detect-local.ts (+test), index.ts}` ; `src/state/effects.ts` (+test) ; `ARCHITECTURE-SPINE.md` (amendement AD-1).
- **Intouchés** : `src/pipeline/video.ts` (flf), `prompts.ts` (4.6), tous `components/`, le travail composite 4.7 (autre worktree).
- Nommage anglais : `videoMotionBrush`, `detectInstanceMasks`, `exitTrajectory`, `InstanceMask`, `VIDEO_BACKEND`.

### References

- [Source: epics-deferred-improvements.md#5 — approche B (promue ici)]
- [Source: recherche web 2026-07-24 : fal kling v1.5 pro (dynamic_masks + static_mask_url), doc API Kling (exclusivité image_tail × masques), guide FLF « garder les frames similaires »]
- [Source: 4-6-*.md — heuristique de direction (inversée ici), patron adaptateur/effets, contrat service local]
- [Source: src/pipeline/video.ts, detect-local.ts, config.ts ; src/state/effects.ts:432 ; local-detect/server.py]
- [Source: ARCHITECTURE-SPINE.md#AD-1,AD-2,AD-5,AD-8,AD-9,AD-12,AD-14]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
