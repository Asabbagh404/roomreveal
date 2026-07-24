---
title: 'Story 4.6 — Prompt de mouvement piloté par les détections'
type: 'feature'
created: '2026-07-24'
status: 'done'
baseline_revision: 'a383dacaf8ade5b22e085e9625cb4be45582f71c'
final_revision: 'd4c3aece8dd5e94003fc3888eb67f4c2f416c682'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/4-6-prompt-de-mouvement-pilote-par-les-detections.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** En FLF pur, le modèle vidéo ne reçoit que deux frames et un prompt générique — les meubles « morphent » sur place au lieu d'entrer en scène, malgré la calibration des prompts (le modèle ignore ce qu'est « le canapé » dans les pixels).

**Approach:** Le service de détection local renvoie les instances par objet (label + boîte) qu'il calcule déjà ; un builder pur en dérive un prompt de mouvement nommant chaque gros objet avec une trajectoire d'entrée concrète, passé à l'adaptateur vidéo. Sans instances, comportement actuel strictement inchangé.

## Boundaries & Constraints

**Always:**
- AD-1 : ne toucher ni l'ordre du pipeline ni les frames FLF (`first_frame_url`/`last_frame_url`) — le prompt est le seul degré de liberté.
- AD-2 : boîtes normalisées [0,1] relatives à l'image de détection ; jamais de coordonnées pixel dans l'état.
- AD-5/AD-6 : `instances` reste interne au pipeline/état (jamais en UI, comme `categories`) ; le builder vit dans `src/pipeline/prompts.ts`.
- AD-12 : `video` reste passif — le prompt est une entrée construite par `effects.ts` ; signature `video(emptyRoomUrl, photoUrl, motionPrompt, { signal, onPhase })`.
- Fallback = identité stricte : sans instances (fal, 204, état antérieur, tableau vide), le prompt envoyé EST `REVEAL_MOTION_PROMPT` (asserter `toBe`, pas `toContain`).
- Clause anti-morphing du prompt actuel conservée verbatim dans la sortie du builder.
- Immutabilité (reducer pur), code/commentaires en anglais, `REVEAL_NEGATIVE_PROMPT` et le reste du contrat vidéo inchangés.

**Block If:**
- Le champ des labels texte de Grounding DINO est introuvable dans `results[0]` (ni `text_labels` ni `labels`) — ne pas inventer de mapping.
- Étendre le contrat exigerait de modifier le chemin fal `detect.ts` au-delà d'un champ optionnel.

**Never:**
- Implémenter l'approche B (masques/trajectoires, modèle motion-control) — différée, backlog §5.
- Toucher `/point`, `/box`, `_mask_response`, `BOX_THRESHOLD`, le masque unioné (AD-7), `detect.ts` (fal), `components/`.
- Altérer le lazy loading des modèles Python (le port doit se binder avant le download des poids).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Détection locale avec meubles | POST `/detect` image+prompts | JSON `{ mask: <PNG base64>, instances: [{label, box:[x0,y0,x1,y1]∈[0,1], area}] }` | — |
| Aucun meuble | GDINO 0 boîte OU union vide | HTTP 204 (inchangé, FR-16) | — |
| Adapter succès | Réponse JSON du service | `{ initialMask: dataURL, categories: [], instances }` | — |
| JSON malformé / non-ok | Réponse invalide | — | `StepError("detect", retryable)` via catch existant |
| Builder sans instances | `undefined` ou `[]` | retour exact `REVEAL_MOTION_PROMPT` | — |
| Builder > 5 instances | 6+ instances | top 5 par aire nommés + phrase « smaller pieces » | — |
| Direction | cy1 < 0,66 → above ; cx < 0,33 → left ; cx > 0,67 → right ; sinon back | clause par objet, labels identiques fusionnés | — |
| Vidéo avec instances | `state.detectedInstances` non vide | `video` reçoit le prompt construit dans `input.prompt` | — |

</intent-contract>

## Code Map

- `local-detect/server.py` -- `/detect` : ajouter labels (via `results[0]`, clé `text_labels` transformers 5.x, repli `labels`) + réponse JSON base64 ; `_detect_boxes` retourne aujourd'hui seulement les boîtes
- `local-detect/README.md` -- documenter le nouveau contrat `/detect`
- `src/pipeline/types.ts` -- +`DetectedInstance`, `DetectResult.instances?`
- `src/pipeline/detect-local.ts` (+`.test.ts`) -- parser JSON, dataURL directe `data:image/png;base64,…`, passer `instances`
- `src/pipeline/prompts.ts` (+`prompts.test.ts` NOUVEAU) -- `buildRevealMotionPrompt` ; `REVEAL_MOTION_PROMPT:115`, queue anti-morphing à réutiliser
- `src/pipeline/video.ts` (+`.test.ts`) -- adapter veo 3.1 lite ; `prompt: motionPrompt` en 3ᵉ paramètre
- `src/state/types.ts:133` -- `Generation.detectedInstances?`
- `src/state/reducer.ts:133` (+`.test.ts`) -- case `DETECT_SUCCEEDED` : stocker les instances (préserver `maskDraft.buffer`)
- `src/state/effects.ts` (+`.test.ts`, mock `@/pipeline` ligne 20) -- `runDetect` ~l.68 dispatch instances ; `runVideo` ~l.426 construit le prompt ; NE PAS toucher les appels detect du mode édition (~l.306/379)

## Tasks & Acceptance

**Execution:**
- [x] `local-detect/server.py` -- `/detect` renvoie JSON `{mask, instances}` (boîtes normalisées, aire de boîte) -- la donnée par objet existe déjà, seul le contrat change
- [x] `local-detect/README.md` -- contrat documenté -- vérité pour le service GPU
- [x] `src/pipeline/types.ts` -- `DetectedInstance` + champ optionnel -- extension AD-5 sans toucher le chemin fal
- [x] `src/pipeline/detect-local.ts` + test -- nouveau parsing (204/erreurs inchangés) -- adapter la frontière
- [x] `src/pipeline/prompts.ts` + `prompts.test.ts` -- builder pur déterministe < ~1500 chars -- cœur de la feature
- [x] `src/pipeline/video.ts` + test -- paramètre `motionPrompt` requis, tous call sites mis à jour -- AD-12
- [x] `src/state/types.ts` + `reducer.ts` + test -- stockage des instances -- transport détection → vidéo
- [x] `src/state/effects.ts` + test -- dispatch instances (reveal) + construction du prompt dans `runVideo` -- orchestration AD-12

**Acceptance Criteria:**
- Given le backend local et des meubles détectés, when `/detect` répond, then l'adaptateur expose `initialMask` (dataURL) et `instances` (labels + boîtes [0,1]) sans changement pour `/point`, `/box` ni le 204.
- Given des instances en état, when `runVideo` lance l'adaptateur, then `input.prompt` contient les labels des 5 plus grosses instances avec leur direction et la clause anti-morphing verbatim.
- Given aucune instance, when la vidéo est générée, then le prompt est strictement `REVEAL_MOTION_PROMPT` (zéro régression, backend fal inclus).
- Given le mode édition, when ses appels detect tournent, then aucun comportement ne change (ils ne consomment que `initialMask`).

## Spec Change Log

## Review Triage Log

### 2026-07-24 — Review pass (Blind Hunter + Edge Case Hunter)
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 1, medium 2, low 7)
- defer: 1: (medium 1)
- reject: 5
- addressed_findings:
  - `[high]` `[patch]` Suite rouge par dérive concurrente : une calibration live (12:00, recalibration veo de REVEAL_MOTION_PROMPT/NEGATIVE + préfixe du builder changé en « the furniture move into ») a cassé le test du préfixe — calibration conservée intégralement, grammaire corrigée (« moves »), test aligné.
  - `[medium]` `[patch]` `instances` non validées à la frontière (explosion différée possible à l'étape vidéo, mal attribuée en StepError video) — `sanitizeInstances` dans detect-local.ts : entrées malformées filtrées, dégradation en `undefined` (fallback prompt) + tests.
  - `[medium]` `[patch]` Labels GDINO non-str (« tensor(0) ») possibles via le repli `labels` — garde serveur : RuntimeError si labels inutilisables.
  - `[low]` `[patch]` `zip` silencieusement tronquant si boxes/labels divergent — `strict=True`.
  - `[low]` `[patch]` Boîtes GDINO hors cadre violant le contrat [0,1] — clamp `_norm`.
  - `[low]` `[patch]` `mask: ""` acceptée → data URL invalide en aval — garde + test.
  - `[low]` `[patch]` Pluriel naïf « utensilss » — garde `endsWith("s")` + test.
  - `[low]` `[patch]` Instances périmées après nouvelle photo — `PHOTO_NORMALIZED` purge `detectedInstances` + test.
  - `[low]` `[patch]` État mutable par référence — `detectedInstances` typé `readonly`.
  - `[low]` `[patch]` Test effects simulant des instances côté fal (contredit types.ts) — reformulé « backend-agnostic » + commentaire.

## Design Notes

Heuristique du builder (référence) : tri aire desc → top 5 ; `y1 < 0.66` → "drops down from above" ; sinon `cx < 0.33` → "from the left", `cx > 0.67` → "from the right", sinon "from the back of the room" ; labels identiques fusionnés (pluriel naïf, direction de la plus grosse occurrence) ; préfixe "the furniture flies into the empty room: " ; overflow → "the smaller pieces settle into place last" ; suffixe = queue anti-morphing actuelle verbatim. Labels GDINO passés tels quels (anglais, lowercase, parfois composés — ne pas re-mapper).

## Verification

**Commands:**
- `npx vitest run` -- expected: 290+ tests verts (nouvelles suites incluses), zéro régression
- `npx tsc --noEmit` -- expected: sortie vide
- `npm run lint` -- expected: pas de NOUVELLE erreur (2 erreurs pré-existantes connues : mask-canvas.tsx:203, editor-surface.tsx:305 — chantier texture-bank, ne pas corriger ici)

**Manual checks (if no CLI):**
- Service GPU : `curl -F image=@photo.jpg -F 'prompts=["cabinet","refrigerator"]' localhost:8000/detect` → JSON avec `instances` non vide et labels plausibles (nécessite le venv local ; hors périmètre CI).

## Auto Run Result

**Résumé.** Story 4.6 implémentée de bout en bout : `/detect` (service local Grounded-SAM) renvoie désormais un JSON `{ mask: PNG base64, instances: [{label, box [0,1] clampée, area}] }` ; `detectLocal` valide les instances à la frontière (dégradation en `undefined` si malformées) ; `buildRevealMotionPrompt` (pur, `prompts.ts`) nomme les 5 plus grosses instances avec leur trajectoire d'entrée et la queue anti-morphing verbatim ; `video()` prend le prompt en 3ᵉ paramètre ; le reducer transporte `detectedInstances` (readonly, purgé sur nouvelle photo) ; `runVideo` construit le prompt. Fallback strict : sans instances, le prompt EST `REVEAL_MOTION_PROMPT`.

**Fichiers modifiés.** `local-detect/server.py` (labels + JSON, gardes str/strict/clamp) · `local-detect/README.md` (contrat) · `src/pipeline/types.ts` (`DetectedInstance`) · `detect-local.ts` (+test — parsing JSON + sanitize) · `prompts.ts` (+test — builder, garde pluriel) · `video.ts` (+test — param `motionPrompt`) · `index.ts` (export) · `src/state/types.ts` (champ readonly) · `reducer.ts` (+test — stockage + purge PHOTO_NORMALIZED) · `effects.ts` (+test — dispatch instances, construction du prompt).

**Revue.** Blind Hunter + Edge Case Hunter → 10 patchs appliqués (1 high, 2 medium, 7 low — détail au Review Triage Log), 1 defer (`deferred-work.md` : désync masque édité ↔ instances nommées), 5 rejets (skew de version du service mono-repo, `area` redondant, params positionnels, +33 % base64, garde prompt-vide).

**Vérification.** `npx vitest run` : 321/321 verts (32 fichiers ; 290 → 321). `npx tsc --noEmit` : vide. `npm run lint` : uniquement les 2 erreurs pré-existantes du chantier texture-bank (`mask-canvas.tsx:203`, `editor-surface.tsx:305`), zéro nouvelle. `py_compile server.py` : OK. Calibration live (GPU + FAL_KEY, comparaison `resultat/`, protocole SM-1) : reste à faire à la main — c'est le verdict produit.

**Risques résiduels.** (1) L'arbre a été modifié par une session concurrente PENDANT le run (recalibration veo de `REVEAL_MOTION_PROMPT`/`REVEAL_NEGATIVE_PROMPT` à 12:00, conservée et committée avec la story — d'où `followup_review_recommended: true`) ; un `console.log` de calibration laissé dans le builder par cette session a été conservé (convention v1 « console + dashboard fal »). (2) La clé `text_labels` du service ne se vérifie qu'au premier run GPU réel. (3) L'efficacité anti-morphing du prompt enrichi n'est pas garantie — hypothèse à valider en live ; si elle plafonne, l'approche B est au backlog (§5).
