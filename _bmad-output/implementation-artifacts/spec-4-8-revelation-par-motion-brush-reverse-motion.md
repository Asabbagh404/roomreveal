---
title: 'Story 4.8 — Révélation par Motion Brush (reverse-motion)'
type: 'feature'
created: '2026-07-24'
status: 'done'
baseline_revision: 'c06eb4623861018fd9ed68767c29b3817bc1ece8'
final_revision: '6bbde989cf3b6da7cc6345ef06f531f29c3f1c5d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/4-8-revelation-par-motion-brush-reverse-motion.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Le FLF pur (veo/kling) morphe et fait apparaître les meubles en fondu quoi qu'on mette dans le prompt (4.6 inclus) — l'interpolation n'a aucune permanence d'objet. Le rendu reste un « rêve fiévreux ».

**Approach:** Ajouter un backend vidéo alternatif (`VIDEO_BACKEND=motion-brush`) qui pilote le mouvement par masque via Kling Motion Brush : génère la vidéo meublé→vide (départ = photo, masques + trajectoires de sortie), puis inverse le MP4 → les meubles entrent et la fin est exactement la photo. Le chemin `flf` (veo) reste le défaut, intouché.

## Boundaries & Constraints

**Always:**
- `VIDEO_BACKEND` (`NEXT_PUBLIC_VIDEO_BACKEND`, défaut `flf`) dans `config.ts` ; `flf` = comportement veo actuel EXACT (zéro régression).
- `image_tail`/`tail_image_url` est mutuellement exclusif avec `dynamic_masks`/`static_mask` — NE JAMAIS l'envoyer sur le chemin motion-brush ; la contrainte de dernière frame vient de l'inversion.
- Trajectoires = SORTIE (centre boîte → bord le plus proche), inverse de `entryDirection` (4.6).
- `@fal-ai/client` uniquement via `pipeline/` (AD-5) ; adaptateur passif AD-12 ; orchestration dans `effects.ts` seul.
- Masques + MP4 inversé repassent par `uploadArtifact` (fal, 24 h, AD-9) ; le reveal final EST une URL fal.
- Tout échec (fal / `/reverse` / upload) → `StepError("video", true)` ; jamais d'erreur brute (AD-8).
- `/detect`, `/point`, `/box`, le lazy loading et `BOX_THRESHOLD` du service — INTOUCHÉS. `video.ts` (flf) INTOUCHÉ.
- Cap à 6 `dynamic_masks` (limite Kling) ; `log()` ce qui est capé (pas de troncature silencieuse).

**Block If:**
- Kling v1.6 pro sur fal n'accepte pas `dynamic_masks`+`static_mask_url` sans `tail_image_url` (contrat introuvable/incompatible).
- L'inversion via `imageio[ffmpeg]` exige une dépendance système non pip-installable dans le venv.

**Never:**
- Toucher au chemin `flf` (`video.ts`), aux prompts 4.6, aux `components/`, au travail composite 4.7 (autre worktree).
- Envoyer `tail_image_url` avec des masques.
- Re-héberger le MP4 hors fal (le reveal doit rester une URL fal).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Masques par instance | POST `/instance-masks` image+prompts | `{ instances:[{label, box[0,1], area, mask b64}], static_mask b64 }` | — |
| Aucun meuble | GDINO 0 boîte / union vide | HTTP 204 | — |
| Inversion vidéo | POST `/reverse` MP4 | MP4 temporellement inversé (`video/mp4`) | — |
| Trajectoire sortie | box + dims | ≥ 2 points {x,y} pixels, centre → bord le plus proche | — |
| Adaptateur nominal | photo + masques | kling(image_url, static_mask_url, dynamic_masks, PAS de tail) → sortie → `/reverse` → upload → `{ reveal }` fal | — |
| > 6 instances | 8 instances | 6 plus grosses en dynamic_masks, reste figé (statique), `log()` le cap | — |
| Échec fal/reverse/upload | erreur réseau/HTTP | — | `StepError("video", true)` sans trace brute |
| Backend flf | `VIDEO_BACKEND=flf` | chemin veo actuel, inchangé | inchangé |

</intent-contract>

## Code Map

- `local-detect/server.py` -- routes `/instance-masks` (masques SAM par objet, déjà calculés dans `_segment_union`) + `/reverse` (imageio-ffmpeg) ; `/detect`,`/point`,`/box` intouchés
- `local-detect/requirements.txt` -- `imageio[ffmpeg]` ; `local-detect/README.md` -- documenter les 2 routes
- `src/pipeline/config.ts` (+`.test.ts`) -- `VIDEO_BACKEND`, `MODELS.videoMotionBrush`, `LOCAL_INSTANCE_MASKS_URL`, `LOCAL_REVERSE_URL`, allowlist
- `src/pipeline/types.ts` -- `InstanceMask`, `InstanceMasksResult`
- `src/pipeline/motion-trajectory.ts` (+`.test.ts`) -- `exitTrajectory(box,w,h)` pur
- `src/pipeline/instance-masks.ts` (+`.test.ts`) -- `detectInstanceMasks(blob,opts)` (patron `detect-local.ts`)
- `src/pipeline/video-motion-brush.ts` (+`.test.ts`) -- adaptateur : upload masques → kling sortie → `/reverse` → upload → `{ reveal }`
- `src/pipeline/index.ts` -- exports
- `src/state/effects.ts` (+`.test.ts`) -- `runVideo` branché sur `VIDEO_BACKEND` (effects.ts:432, gardes AD-12 réutilisées)
- `_bmad-output/planning-artifacts/architecture/architecture-flux_test-2026-07-10/ARCHITECTURE-SPINE.md` -- note d'amendement AD-1

## Tasks & Acceptance

**Execution:**
- [x] `local-detect/server.py` -- `/instance-masks` + `/reverse` -- masques par objet déjà calculés ; inversion self-contained
- [x] `local-detect/{requirements.txt,README.md}` -- `imageio[ffmpeg]` + doc des 2 routes
- [x] `src/pipeline/config.ts` (+test) -- flag + modèle + URLs + allowlist
- [x] `src/pipeline/types.ts` -- `InstanceMask`/`InstanceMasksResult`
- [x] `src/pipeline/motion-trajectory.ts` (+test) -- `exitTrajectory` pur, 4 directions
- [x] `src/pipeline/instance-masks.ts` (+test) -- `detectInstanceMasks` (204/erreurs → StepError detect)
- [x] `src/pipeline/video-motion-brush.ts` (+test) -- adaptateur passif complet
- [x] `src/pipeline/index.ts` -- exports
- [x] `src/state/effects.ts` (+test) -- branche `runVideo`
- [x] `ARCHITECTURE-SPINE.md` -- amendement AD-1 (première frame relâchée pour ce backend)

**Acceptance Criteria:**
- Given `VIDEO_BACKEND=flf`, when la vidéo génère, then le chemin veo est strictement inchangé (zéro régression).
- Given `VIDEO_BACKEND=motion-brush`, when `runVideo` s'exécute, then `detectInstanceMasks(photo)` puis `videoMotionBrush(...)` produisent `{ reveal }` (URL fal), avec `dynamic_masks`+`static_mask_url` et SANS `tail_image_url` dans l'input kling, l'appel `/reverse` effectué et le MP4 inversé ré-uploadé.
- Given > 6 instances, when l'adaptateur construit les dynamic_masks, then il cape aux 6 plus grosses et `log()` le nombre écarté.
- Given un échec (fal, reverse ou upload), when il survient, then il devient `StepError("video", true)` sans trace fal brute.
- Given l'architecture, when ce backend produit le reveal, then la dernière frame = photo canonique (AD-1 tenu) et la première frame relâchée est inscrite dans la spine.

## Spec Change Log

### 2026-07-24 — Patch (pas de loopback bad_spec)
- Modèle Motion Brush corrigé dans Code Map/Design Notes : `fal-ai/kling-video/v1.6/pro` → `v1.5/pro`. Déclencheur : la revue a montré (types `@fal-ai/client`) que v1.6 pro ne déclare PAS `dynamic_masks`/`static_mask_url` — ils vivent sur v1.5 pro & v1 standard. État mauvais évité : envoyer les masques à un endpoint qui les ignore → dégradation silencieuse en image-to-video prompt-only (le morphing même que la story élimine). KEEP : cœur du design (motion brush + reverse + service + chaîne d'adaptateur) validé, seul le constant/ID était faux — patch chirurgical, pas de re-dérivation.
- Honnêteté dernière frame (AD-1) : « exactement la photo / garantie par construction » → « rendu du modèle ré-encodé, visuellement la photo, PAS pixel-exact ; AD-1 approximé, pas tenu au pixel près ». Reflété dans ARCHITECTURE-SPINE + AC 4/6.

## Review Triage Log

### 2026-07-24 — Review pass (Blind Hunter + Edge Case Hunter)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 2, medium 3, low 3)
- defer: 3: (medium 2, low 1)
- reject: 3
- addressed_findings:
  - `[high]` `[patch]` Mauvais modèle Kling : `videoMotionBrush` v1.6 pro → **v1.5 pro** (seul tier ≤ pro portant `dynamic_masks`/`static_mask_url`, confirmé dans les types fal) ; cast, allowlist, comment, tests, spec/story/spine alignés.
  - `[high]` `[patch]` Décalage d'espace-pixels : détection motion-brush sur le blob **canonique** (≤1024) au lieu de la copie détection (≤1536) → masques + trajectoires + `image_url` dans le même espace.
  - `[medium]` `[patch]` `/reverse` robustesse : frames vides / corps indécodable → 422 (plus de 500 avec fuite ffmpeg) ; fps fallback `or 24.0` + contrôle numérique/positif.
  - `[medium]` `[patch]` Gardes adaptateur : `fetch(exitUrl).ok` vérifié avant `.blob()` ; `staticMask` vide → `StepError("video")` (pas de data URL invalide uploadée).
  - `[medium]` `[patch]` Garde `runVideo` : motion-brush n'exige que `photo` (pas `emptyRoom` qu'il ne consomme pas) ; flf exige toujours les deux, garde défensive avant le fallback flf.
  - `[low]` `[patch]` Bascule backend non silencieuse : `console.warn` sur le fallback flf (204 / instances toutes invalides) + `console.info` côté `instance-masks.ts`.
  - `[low]` `[patch]` Aire négative clampée (`max(0,…)`) pour une boîte GDINO inversée → tri largest-first correct.
  - `[low]` `[patch]` Honnêteté dernière frame (voir Spec Change Log) — wording spine/spec/story.
  - defer: double-détection motion-brush (re-run `/instance-masks` alors que le parcours a déjà détecté) ; durée 5 s fixe (objets loin du bord peuvent ne pas sortir → entrée partielle au reveal) ; cap OOM `/reverse` sur gros MP4 au-delà de la garde de base. reject: conflation timeout/abort (convention `video.ts` existante) ; `createImageBitmap` en SSR (chemin client only) ; `zip strict`→500 (contenu en `StepError("detect")`).


## Design Notes

Reverse-motion : Kling `image_tail` exclusif avec les masques (doc API vérifiée) ; les champs Motion Brush (`dynamic_masks`+`static_mask_url`) sont portés par **v1.5 pro**, pas v1.6 pro (qui n'a que `tail_image_url`). Donc départ = photo meublée (frame parfaite), meubles SORTENT via `dynamic_masks`, puis inversion du MP4 → entrée + fin sur le **rendu du modèle ré-encodé** (visuellement la photo, **pas** pixel-exact : l'inversion est un ré-encodage avec perte — l'invariant strict de dernière frame AD-1 est **approximé**, pas tenu au pixel près). `static_mask_url` = coquille de la pièce (inverse de l'union, fournie par le service). Trajectoires = pixels image, centre boîte → bord le plus proche (≥ 2 points). Amendement AD-1 : première frame = modèle (quasi-vide), pas l'inpaint — assumé pour ce backend. AD-9 : masques + MP4 inversé via `uploadArtifact` → reveal = URL fal ; `/reverse` est un traitement local transitoire (comme la détection locale). Adaptateur `videoMotionBrush` fait toute la chaîne (upload→kling→reverse→upload) et renvoie `{ reveal }`, passif AD-12 comme `detectLocal` (qui appelle déjà un service local).

## Verification

**Commands:**
- `npx vitest run` -- expected: suites existantes + nouvelles vertes, zéro régression (baseline 321)
- `npx tsc --noEmit` -- expected: vide
- `npm run lint` -- expected: pas de NOUVELLE erreur (2 pré-existantes texture-bank tolérées : mask-canvas.tsx, editor-surface.tsx)
- `python3 -m py_compile local-detect/server.py` -- expected: OK

**Manual checks (if no CLI):**
- Live (GPU + FAL_KEY) : `curl -F image=@photo.jpg localhost:8000/instance-masks` → JSON masques+static ; génération Kling réelle + inversion → le morphing a-t-il disparu ? (verdict SM-1, jugement humain) ; COGS/latence réels vs flf.

## Auto Run Result

Status: done (worktree `feat/reveal-motion-brush`)

**Résumé.** Second backend vidéo `motion-brush` derrière `VIDEO_BACKEND` (défaut `flf` = veo, inchangé). Service local : `/instance-masks` (masques SAM par objet + `static_mask` inverse-union) et `/reverse` (inversion temporelle imageio-ffmpeg). Adaptateur `videoMotionBrush` : upload masques → Kling **v1.5 pro** (`image_url`+`static_mask_url`+`dynamic_masks` avec trajectoires de sortie, sans `tail_image_url`) → `/reverse` → ré-upload fal → `{ reveal }`. `runVideo` branché ; helper pur `exitTrajectory`. AD-1 relâché pour ce backend (première frame = modèle ; dernière frame = rendu réencodé ≈ photo, pas pixel-exact).

**Fichiers.** Nouveaux : `video-motion-brush.ts` (+test), `motion-trajectory.ts` (+test), `instance-masks.ts` (+test) ; routes `/instance-masks`+`/reverse` (server.py). Modifs : `config.ts` (+test), `types.ts`, `index.ts`, `effects.ts` (+test), `requirements.txt`, `README.md`, `ARCHITECTURE-SPINE.md` (amendement AD-1).

**Revue (Blind Hunter + Edge Case Hunter).** 8 patchs appliqués (2 high, 3 medium, 3 low) — headline : mauvais modèle Kling (v1.6 pro n'a PAS les champs Motion Brush → **v1.5 pro**, vérifié dans les types fal) et alignement d'espace-pixels (détection sur le blob canonique). 3 defer (`deferred-work.md` : double-détection, durée 5 s fixe, cap OOM `/reverse`), 3 reject. Détail : Review Triage Log + Spec Change Log.

**Vérification.** `npx vitest run` : **350 verts** (35 fichiers). `tsc --noEmit` : vide. `npm run lint` : seulement les 2 erreurs pré-existantes texture-bank (hors périmètre). `py_compile server.py` : OK. **Aucune vérification live** (pas de GPU/FAL_KEY dans ce run) — c'est le juge décisif : le vrai test « le morphing a-t-il disparu ? » (SM-1) et la validité réelle du contrat Kling Motion Brush v1.5 pro restent à faire à la main. D'où `followup_review_recommended: true` (feature à fort risque API-dépendant, non testable hors-ligne).

**Risques résiduels.** (1) Le contrat Kling v1.5 pro Motion Brush n'est pas prouvé en réel — les types fal confirment les champs, mais le comportement (masques respectés, qualité de sortie) est live-only. (2) Reverse-motion : la dernière frame est un réencodage ≈ photo, pas pixel-exact (AD-1 approximé). (3) Coût/latence > flf (2 appels + upload×N + reverse). (4) À comparer en live à la 4.7 (composite déterministe, autre worktree) — le meilleur des deux devient le défaut de `VIDEO_BACKEND`.
