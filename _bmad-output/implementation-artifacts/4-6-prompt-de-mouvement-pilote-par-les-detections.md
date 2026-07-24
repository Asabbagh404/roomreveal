# Story 4.6: Prompt de mouvement piloté par les détections

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que les meubles de ma Révélation entrent en scène avec des trajectoires propres à chaque objet (glisser depuis un côté, descendre du plafond) plutôt que de morpher sur place,
so that la vidéo gagne en cohérence physique et renforce l'effet « wow » (SM-1).

## Acceptance Criteria

1. **Contrat `local-detect` enrichi** — **Given** le backend local (`DETECT_BACKEND === "local"`), **When** `/detect` trouve des meubles, **Then** le service renvoie une réponse JSON `{ mask: <PNG base64>, instances: [{ label, box: [x0,y0,x1,y1], area }] }` avec les boîtes **normalisées [0,1]** par rapport à l'image de détection (AD-2 : indépendant de la copie 1536) ; le 204 « aucun meuble » (FR-16) est inchangé ; `/point` et `/box` sont intouchées.
2. **Adapter + contrat AD-5 étendu** — `detectLocal` parse le JSON, reconstruit `initialMask` en data URL et expose `DetectResult.instances` (champ **optionnel**) ; le backend fal n'en produit pas (`undefined`) ; comme `categories`, les instances ne sont **jamais** exposées en UI.
3. **État** — **When** `DETECT_SUCCEEDED` est dispatché en mode reveal, **Then** le reducer conserve `generation.detectedInstances` (extension AD-3), remplacées par toute re-détection, détruites avec la Génération — sans aucun effet sur `maskDraft`, l'édition du Masque, ni les parcours existants (mode édition inclus).
4. **Builder de prompt** — `buildRevealMotionPrompt(instances)` (fonction pure, `pipeline/prompts.ts`, AD-6) : top 5 instances par aire nommées individuellement avec direction dérivée de la boîte (cx < 0,33 → « slides in from the left », cx > 0,67 → « slides in from the right », tiers haut sans contact sol → « drops down from above », sinon → « slides in from the back of the room ») ; labels identiques fusionnés ; reste résumé en une phrase ; clause anti-morphing du prompt actuel conservée verbatim.
5. **Adapter vidéo** — `video(...)` reçoit le prompt construit à la place de `REVEAL_MOTION_PROMPT` ; `REVEAL_NEGATIVE_PROMPT` et tout le reste du contrat (FLF strict AD-1, ratio AD-2, queue AD-10, timeout/erreurs AD-8, header 24 h AD-9) sont inchangés.
6. **Fallback strict** — sans instance (backend fal, 204, Génération antérieure, tableau vide), le prompt envoyé est **strictement** `REVEAL_MOTION_PROMPT` — comportement actuel à l'identique, zéro régression.
7. Suites Vitest existantes vertes ; `tsc`, lint, build OK ; `local-detect/README.md` documente le nouveau contrat de `/detect`.

## Tasks / Subtasks

- [ ] Task 1 — Service `local-detect` : instances dans la réponse (AC: 1)
  - [ ] `_detect_boxes` → retourner aussi les labels texte de Grounding DINO (`results[0]` ; clé `"text_labels"` en transformers 5.x — le code note déjà le renommage 5.x pour `threshold` ; vérifier au run, repli `"labels"`)
  - [ ] `/detect` : construire `instances` = par boîte, `{ label, box: [x0/W, y0/H, x1/W, y1/H], area: aire de boîte normalisée }` ; encoder le PNG unioné en base64 ; renvoyer `JSONResponse({ mask, instances })` ; 204 inchangé (boxes vides OU union vide)
  - [ ] `local-detect/README.md` : documenter le contrat JSON
- [ ] Task 2 — Adapter + types (AC: 2)
  - [ ] `pipeline/types.ts` : `DetectedInstance { label: string; box: [number, number, number, number]; area: number }` ; `DetectResult.instances?: DetectedInstance[]`
  - [ ] `detect-local.ts` : `res.json()`, `initialMask` = `` `data:image/png;base64,${mask}` `` (plus besoin de `blobToDataUrl` sur ce chemin), passer `instances` ; 204/erreurs inchangés
  - [ ] `detect-local.test.ts` : stubs fetch → JSON ; assertions instances + data URL + 204
- [ ] Task 3 — État (AC: 3)
  - [ ] `reducer.ts` : action `DETECT_SUCCEEDED` + `instances?` ; `generation.detectedInstances` posé au même case (immutabilité, reducer pur) ; vérifier que les invalidations existantes (nouvelle Génération, re-détection) l'écrasent naturellement
  - [ ] `effects.ts#runDetect` : dispatcher `instances: result.instances` (chemin reveal, effects.ts:68) ; ne PAS toucher le chemin auto-detect du mode édition (~effects.ts:379-389, il consomme seulement `initialMask`)
  - [ ] `reducer.test.ts` : instances stockées ; absentes → champ `undefined` ; maskDraft préservé
- [ ] Task 4 — Builder de prompt (AC: 4, 6)
  - [ ] `prompts.ts` : `buildRevealMotionPrompt(instances?: readonly DetectedInstance[]): string` — heuristique AC 4 ; retour exact `REVEAL_MOTION_PROMPT` si `undefined`/vide ; garder le prompt final < ~1500 caractères `[ASSUMPTION limite veo 3.1 lite — vérifier live]`
  - [ ] `prompts.test.ts` (nouveau) : fallback exact, cap top-5, directions (4 quadrants), fusion de labels, clause anti-morphing présente, déterminisme
- [ ] Task 5 — Adapter vidéo + effet (AC: 5, 6)
  - [ ] `video.ts` : signature `video(emptyRoomUrl, photoUrl, motionPrompt, { signal, onPhase })` — le prompt devient une **entrée** (AD-12 : inputs puis options) ; l'adapter reste bête, aucun défaut interne
  - [ ] `effects.ts#runVideo` : `const motionPrompt = buildRevealMotionPrompt(state.detectedInstances)` puis passage à `video(...)`
  - [ ] `video.test.ts` : le prompt passé arrive dans `input.prompt` ; `effects.test.ts` : avec instances → prompt contient les labels ; sans → strictement `REVEAL_MOTION_PROMPT`
- [ ] Task 6 — Vérification (AC: 7)
  - [ ] `npm run test` + `tsc` + lint + build verts ; régression suites 1.x–5.x
  - [ ] Calibration live (GPU + FAL_KEY) : une Génération réelle backend local, comparer le morphing aux samples `resultat/` (protocole SM-1, jugement humain)

## Dev Notes

### Contexte & décision (conversation 2026-07-24)

- Objectif produit : **un seul clip**, mais des meubles qui *entrent* en scène (gauche/droite/plafond) au lieu de morpher. Le découpage par élément est le moyen, pas la fin.
- Design validé : approche A « prompt enrichi ». L'**approche B** (masques + trajectoires vers un modèle à contrôle de mouvement, ex. Wan VACE) est différée — `epics-deferred-improvements.md` §5. Ne PAS l'implémenter ici ; cette story en pose seulement le prérequis (instances par objet).
- La calibration prompt a déjà eu lieu (variantes B/C benchées dans `prompts.ts:127-137`, samples `resultat/`) : le morph persiste avec des prompts *génériques*. L'hypothèse testée ici : des objets **nommés** avec des trajectoires **concrètes** ancrent mieux le modèle FLF. Amélioration probable, pas garantie — le verdict est la calibration live, pas les tests unitaires.
- **⚠ Modèle vidéo swappé le 2026-07-24 (avant cette story)** : kling o1 → **`fal-ai/veo3.1/lite/first-last-frame-to-video`** (Veo 3.1 Lite FLF). Champs : `first_frame_url`/`last_frame_url` (plus `start_image_url`/`end_image_url`), `resolution: "720p"`, `generate_audio: false` (plancher de coût 0,03 $/s), plus de `duration`, `negative_prompt` typé nativement (le `@ts-expect-error` kling a disparu), `aspect_ratio` par défaut `"auto"` (ratio des frames préservé, AR-PIXELS). Le contrat kling documenté en 4.1 est **obsolète** — le code actuel de `video.ts` fait foi.

### État en place (NE PAS recréer)

- **`local-detect/server.py`** : `_detect_boxes` (GDINO, tous concepts en un prompt, retourne seulement `results[0]["boxes"]` — les labels sont dans le même dict) ; `_segment_union` (SAM par boîte → union bool) ; `/detect` encode le PNG inline (n'utilise PAS `_mask_response`) ; 204 si zéro boîte OU union vide ; CORS ouvert dev ; lazy model loading (ne pas casser — le port doit se binder avant le premier download de poids). `BOX_THRESHOLD = 0.22` calibré — ne pas toucher.
- **`detect-local.ts`** : adapter passif AD-12 complet (AbortController chaîné, `LOCAL_DETECT_TIMEOUT_MS`, 204 → `{ initialMask: null, categories: [] }`, catch → `StepError("detect", true)`). Seul le parsing de la réponse change.
- **`types.ts`** : `DetectResult { initialMask: string | null; categories: string[] }` — `categories` est le précédent exact d'un champ pipeline-interne jamais exposé en UI ; `instances` suit le même statut.
- **`reducer.ts:133` `DETECT_SUCCEEDED`** : pose `maskDraft.detectedMaskUrl`, préserve `buffer`, clear waitPhase/error. Ajouter `detectedInstances` dans CE case ; ne pas créer d'action séparée.
- **`effects.ts`** : `runDetect` (ligne ~48, chemin reveal) dispatche à la ligne 68 ; le mode édition a DEUX autres appels `detectLocal`/`detect` (~306, ~379-389) qui unionnent dans le draft sans passer par `DETECT_SUCCEEDED` — les laisser strictement intacts. `runVideo` (ligne ~426) : y ajouter la construction du prompt ; gardes `dead()`/epoch inchangées.
- **`video.ts`** : adapter veo 3.1 lite complet (FLF strict `first_frame_url`/`last_frame_url`, `resolution: "720p"`, `generate_audio: false`, timeout 6 min, header 24 h, race timeout + `run.catch(() => {})`). SEUL changement : `prompt: motionPrompt` au lieu de la constante importée.
- **`prompts.ts`** : `REVEAL_MOTION_PROMPT` (ligne 115) et `REVEAL_NEGATIVE_PROMPT` (123) — la clause finale « clear directional motion with real trajectories, solid objects physically moving into place, cinematic reveal; no morphing, no materializing on the spot » est la queue à conserver verbatim dans le builder. `FURNITURE_CATEGORIES` (ligne 41) : labels anglais lowercase — les labels GDINO en sortent, donc anglais garanti, cohérent avec la langue du prompt.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-1** : ne toucher NI l'ordre du pipeline NI les frames FLF. Le prompt est le seul degré de liberté de cette story. [Source: ARCHITECTURE-SPINE.md#AD-1]
- **AD-2** : boîtes normalisées [0,1] par rapport à l'image de détection (copie 1536) — jamais de coordonnées pixel dans l'état (la canonique est ≤ 1024, mismatch garanti sinon). [Source: ARCHITECTURE-SPINE.md#AD-2 + amendement]
- **AD-3** : `generation.detectedInstances?: DetectedInstance[]` est une **extension de la forme canonique** — la documenter dans le commentaire du type `Generation`. Serveur toujours sans état. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **AD-5 (+ amendement backend local)** : le contrat `detect` s'étend (champ optionnel), l'interface passive est inchangée ; la composition (union, instances) appartient au pipeline, jamais à l'UI/reducer. `instances` suit le régime de `categories` : interne, jamais en UI. [Source: ARCHITECTURE-SPINE.md#AD-5]
- **AD-6** : le builder vit dans `prompts.ts`, nulle part ailleurs. [Source: ARCHITECTURE-SPINE.md#AD-6]
- **AD-8** : aucun nouveau mode d'échec — un JSON malformé du service local tombe dans le catch existant → `StepError("detect", true)`. [Source: ARCHITECTURE-SPINE.md#AD-8]
- **AD-12** : `video` reste passif ; le prompt est une **entrée** (`(inputs..., { signal, onPhase })`), construit par la couche effectrice. Sens des dépendances : `state/` → `pipeline/` (autorisé) ; l'UI n'importe rien de tout ça. [Source: ARCHITECTURE-SPINE.md#AD-12, Invariants]
- **Conventions** : code/commentaires anglais ; immutabilité (spread, jamais de mutation) ; adaptateurs mockés à la frontière AD-12 dans les tests ; reducer testé pur. [Source: ARCHITECTURE-SPINE.md#Consistency Conventions]

### Spécification du builder (référence d'implémentation)

```
buildRevealMotionPrompt(instances):
  si !instances || instances.length === 0 → return REVEAL_MOTION_PROMPT  // fallback EXACT
  tri aire desc → top 5 ; reste = overflow
  direction(box = [x0,y0,x1,y1]):
    cx = (x0+x1)/2
    si y1 < 0.66            → "drops down from above"        // ne touche pas le sol : hotte, meubles hauts, suspension
    sinon si cx < 0.33      → "slides in from the left"
    sinon si cx > 0.67      → "slides in from the right"
    sinon                   → "slides in from the back of the room"
  fusion : instances top-5 de même label → une clause plurielle naïve ("the cabinets slide in from the left",
           direction = celle de la plus grosse occurrence)
  clauses jointes par ", " ; préfixe "the furniture flies into the empty room: " ;
  si overflow → ajouter "the smaller pieces settle into place last" ;
  suffixe : "; clear directional motion with real trajectories, solid objects physically moving
  into place, cinematic reveal; no morphing, no materializing on the spot"  // verbatim du prompt actuel
```

Déterministe (pas de random), pur (pas d'accès état/horloge). Prompt final attendu bien sous ~1500 caractères `[ASSUMPTION : limite prompt veo 3.1 lite non vérifiée — si la requête 422 sur prompt long, tronquer à top 3]`.

### Pièges connus

- **Labels GDINO, clé et contenu** : transformers 5.x — `post_process_grounded_object_detection` renvoie les labels **texte** sous `"text_labels"` (le code note déjà un renommage 5.x ligne 94) ; repli `"labels"` si absent. GDINO peut renvoyer des labels composés/fusionnés (« kitchen island cabinet ») — les passer tels quels, lowercase, ne pas re-mapper sur `FURNITURE_CATEGORIES`.
- **Ne pas casser le lazy loading** : le base64 s'encode avec `base64.b64encode(...).decode("ascii")` dans `/detect` — aucun import lourd au module.
- **`/point` et `/box` intouchées** : elles renvoient toujours du PNG brut via `_mask_response` — le mode édition (5.6/5.7) en dépend.
- **Chemin data URL** : `data:image/png;base64,${mask}` se construit directement — supprimer l'appel `blobToDataUrl` du chemin `/detect` mais la fonction sert-elle ailleurs ? (non — vérifier avant de la supprimer du fichier).
- **Mode édition** : les appels detect du mode édition (effects.ts ~306/~379) ne dispatchent pas `DETECT_SUCCEEDED` — zéro impact attendu ; le vérifier plutôt que le supposer (grep `DETECT_SUCCEEDED`).
- **Ordre des paramètres de `video`** : `video(emptyRoomUrl, photoUrl, motionPrompt, { signal, onPhase })` — mettre à jour TOUS les call sites (`runVideo`, `video.test.ts`, mock `@/pipeline` dans `effects.test.ts`) sinon `tsc` casse.
- **Fallback = identité stricte** : les tests doivent asserter `toBe(REVEAL_MOTION_PROMPT)` (égalité référentielle/textuelle exacte), pas un `toContain` — c'est l'AC 6.
- **NE PAS toucher** : `REVEAL_NEGATIVE_PROMPT`, `duration`, l'absence d'`aspect_ratio`, le seuil `BOX_THRESHOLD`, le masque unioné lui-même (AD-7 : le Masque part verbatim — les instances sont un à-côté informatif, pas une altération du masque).
- **AGENTS.md** : « This is NOT the Next.js you know » — rien de Next-spécifique ici (pipeline/état purs), mais consulter `node_modules/next/dist/docs/` si un doute apparaît.

### Testing Requirements

- **Pur (Vitest)** — motifs existants à copier :
  - `prompts.test.ts` (nouveau) : fallback exact (`undefined`, `[]`) ; cap top-5 (6 instances → 5 nommées + phrase overflow) ; les 4 directions ; fusion labels identiques ; clause anti-morphing présente ; sortie < 1500 chars sur 15 instances.
  - `detect-local.test.ts` (motif stubs fetch existant) : JSON → data URL + instances ; 204 → `{ initialMask: null }` ; JSON malformé → `StepError("detect")`.
  - `reducer.test.ts` : `DETECT_SUCCEEDED` avec/sans instances ; `maskDraft.buffer` préservé ; re-détection écrase les instances.
  - `effects.test.ts` : `runVideo` — état avec instances → `video` reçoit un prompt contenant les labels ; sans instances → reçoit exactement `REVEAL_MOTION_PROMPT` ; gardes `dead()` inchangées (motif 4.1).
  - `video.test.ts` : `input.prompt` = le motionPrompt passé ; reste du contrat inchangé (motif existant).
- **Non testable jsdom → live** : réponse réelle du service Python (curl documenté dans `local-detect/README.md`), clé `"text_labels"`, et la calibration SM-1 (comparaison `resultat/`). GPU requis pour le service local.
- Régression : suites 1.x–5.x vertes ; `tsc` ; lint ; build.

### Project Structure Notes

- **Nouveaux** : `src/pipeline/prompts.test.ts`.
- **Modifs** : `local-detect/server.py`, `local-detect/README.md`, `src/pipeline/types.ts`, `src/pipeline/detect-local.ts` (+ test), `src/pipeline/prompts.ts`, `src/pipeline/video.ts` (+ test), `src/state/reducer.ts` (+ test), `src/state/effects.ts` (+ test).
- **Intouchés** : `src/pipeline/detect.ts` (fal — `instances` optionnel, aucun changement requis), `config.ts` (aucun nouveau modèle/endpoint), tout `components/`.
- Nommage anglais (glossaire) : `DetectedInstance`, `detectedInstances`, `buildRevealMotionPrompt`, `motionPrompt`.

### References

- [Source: epics.md#Story 4.6 — ACs canoniques]
- [Source: ARCHITECTURE-SPINE.md#AD-1..AD-3, AD-5 (+ amendement local), AD-6, AD-8, AD-12 ; Consistency Conventions]
- [Source: _bmad-output/implementation-artifacts/4-1-generation-de-la-revelation-generation-flf.md — motif runVideo, pièges FLF ; ⚠ son contrat kling o1 est obsolète depuis le swap veo 3.1 lite du 2026-07-24, `src/pipeline/video.ts` fait foi]
- [Source: src/pipeline/video.ts, detect-local.ts, prompts.ts:41,115-137, types.ts ; src/state/effects.ts:48,68,426 ; src/state/reducer.ts:133 ; local-detect/server.py]
- [Source: epics-deferred-improvements.md#5 — approche B différée]
- [Source: conversation 2026-07-24 — design approche A validé ; mémoire session [[roomreveal-bmad-progress]]]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
