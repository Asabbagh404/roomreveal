---
title: 'Story 4.9 — Révélation « timelapse chantier » (movers/ouvriers)'
type: 'feature'
created: '2026-07-25'
status: 'done'
baseline_revision: '034f0d2cc5dcfc846a802821899d43e3b670805a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/4-9-revelation-timelapse-chantier.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Les 3 approches reveal ont échoué en live (FLF pur/4.6 morphe structurellement, composite 4.7 rejeté, Motion Brush 4.8 déforme au lieu de translater) — le reveal « léché » EXPOSE les artefacts d'interpolation.

**Approach:** Les ABSORBER par le format : un prompt « move-in time-lapse » où des déménageurs portent et posent les meubles un par un (mécanisme causal + occlusion + attente spectateur), sur le chemin veo 3.1 FLF EXISTANT, derrière une 3ᵉ valeur du flag `VIDEO_BACKEND` (`timelapse`). Test d'hypothèse ~0,50 € avant tout investissement self-hosted.

## Boundaries & Constraints

**Always:**
- `flf` (défaut) et `motion-brush` strictement inchangés — zéro régression, y compris le prompt/négatif envoyés.
- Même adaptateur `video()` (veo 3.1 lite, FLF strict AD-1 : first = Pièce vide, last = photo) ; le prompt reste un INPUT construit dans `effects.ts` (AD-12), builder pur dans `prompts.ts` (AD-6).
- `REVEAL_NEGATIVE_PROMPT` intact (déjà compatible workers : aucun terme anti-personnes) ; la contrainte caméra statique vit dans le prompt positif.
- Pièce vide REQUISE pour `timelapse` (comme `flf`) — le guard `effects.ts:442` couvre déjà ce cas (`!== "motion-brush"`), le verrouiller par test.
- Pas de `console.log` dans le nouveau code (ne pas répliquer le log diagnostic de prompts.ts:220).

**Block If:** Impossible d'étendre `VIDEO_BACKEND` sans casser le typage des mocks existants (`effects.test.ts:24` union à élargir) autrement que mécaniquement.

**Never:**
- Reprendre `REVEAL_ANTI_MORPHING_TAIL` verbatim (« rush in early / landed before the last frame » contredit le portage un-par-un étalé sur le clip).
- Nouveau modèle, changement de `MODELS`/`FAL_ALLOWED_ENDPOINTS`/`TIMEOUTS_MS`/`video.ts`/Python/`components/`.
- Modifier `duration` ou la résolution veo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Timelapse avec détections | `VIDEO_BACKEND=timelapse`, `detectedInstances` non vide | `video()` reçoit `buildTimelapsePrompt(instances)` : movers + furniture_list (labels top 5 par aire, fusion des doublons) + caméra statique + time-lapse speed | — |
| Timelapse sans détections | `detectedInstances` `undefined` ou `[]` | Prompt générique équivalent SANS segment liste — même cadrage movers/caméra/time-lapse | — |
| Timelapse sans Pièce vide | `emptyRoom === undefined` | `runVideo` retourne sans rien faire (guard existant) | Pas d'erreur peinte |
| flf inchangé | `VIDEO_BACKEND=flf` | `video()` reçoit `buildRevealMotionPrompt(...)` exactement comme aujourd'hui | — |
| motion-brush inchangé | `VIDEO_BACKEND=motion-brush` | Chemin 4.8 intact (detectInstanceMasks → videoMotionBrush, fallback flf sur 204) | — |
| Échec veo sur timelapse | fal rejette / timeout | `StepError("video", true)` — chemin d'erreur flf existant, rien de nouveau | Bandeau standard |

</intent-contract>

## Code Map

- `src/pipeline/config.ts:107-114` -- `VIDEO_BACKEND` ternaire binaire → union 3 valeurs `"flf" | "motion-brush" | "timelapse"` (parse whitelist, défaut `flf`)
- `src/pipeline/prompts.ts` -- ajouter `buildTimelapsePrompt(instances?)` + constante fallback ; patron = `buildRevealMotionPrompt` (tri aire desc, top 5, fusion labels, pluriel naïf, labels GDINO tels quels) SANS le tail anti-morphing et SANS console.log
- `src/state/effects.ts:432-521` -- `runVideo` : sélection du builder par backend (`timelapse` → `buildTimelapsePrompt(state.detectedInstances)`, sinon `buildRevealMotionPrompt`) ; branche motion-brush et gardes intactes
- `src/pipeline/index.ts` -- exporter `buildTimelapsePrompt`
- `src/pipeline/prompts.test.ts` -- tests builder (fallback, liste, fusion, clauses obligatoires, déterminisme, ≠ REVEAL_MOTION_PROMPT)
- `src/state/effects.test.ts:22-30,624-830` -- élargir l'union du mock `videoBackend` + describe `timelapse` (prompt passé à `video()`, Pièce vide requise, flf/motion-brush non régressés)

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/config.ts` -- étendre `VIDEO_BACKEND` à 3 valeurs, défaut `flf` -- le flag est le seul interrupteur du test live
- [x] `src/pipeline/prompts.ts` -- `buildTimelapsePrompt` pur + fallback générique, JSDoc rationale (absorber vs cacher) + `[À calibrer live]` -- cœur de l'hypothèse
- [x] `src/pipeline/index.ts` -- export -- effects.ts importe depuis `@/pipeline`
- [x] `src/state/effects.ts` -- sélection du builder par backend dans `runVideo` -- seul point d'orchestration (AD-12)
- [x] `src/pipeline/prompts.test.ts` -- cas de la matrice I/O côté builder -- fige le contrat du prompt
- [x] `src/state/effects.test.ts` -- branche `timelapse` + régression `flf`/`motion-brush` -- verrouille zéro régression

**Acceptance Criteria:**
- Given `VIDEO_BACKEND=timelapse` et des instances, when `runVideo` s'exécute, then `video(emptyRoomUrl, photoUrl, prompt, opts)` est appelé avec un prompt contenant « time-lapse », « movers » (ou workers), « static camera » et les labels détectés ; mêmes gardes `dead()`/upload paresseux/seed `queued` que flf.
- Given `VIDEO_BACKEND=timelapse` sans instances, when la vidéo génère, then le prompt générique timelapse est envoyé (jamais `REVEAL_MOTION_PROMPT`).
- Given `VIDEO_BACKEND=flf` ou `motion-brush`, when la vidéo génère, then le comportement actuel est bit-à-bit identique (prompts, adaptateurs, fallbacks).
- Given l'implémentation vérifiée, when l'utilisateur lance UNE génération live `timelapse`, then le verdict SM-1 (~0,50 €) est consigné dans le Dev Agent Record de la story + `deferred-work.md` (bon → candidat défaut ; mauvais → clôture piste fal). [Étape humaine, hors périmètre du run auto]

## Spec Change Log

## Review Triage Log

### 2026-07-25 — Review pass (Blind Hunter + Edge Case Hunter)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 2, low 6)
- defer: 2: (medium 1, low 1)
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` Fallback silencieux sur flag mal tapé : `console.warn` sur toute valeur `NEXT_PUBLIC_VIDEO_BACKEND` non vide hors whitelist — un typo aurait fait bencher le MAUVAIS backend (verdict SM-1 faussé, seule différence observable = l'esthétique).
  - `[medium]` `[patch]` Pluriel naïf « shelfs » : helper `pluralize` (-f/-fe → -ves) dans le NOUVEAU builder seul (« shelf » est une vraie entrée FURNITURE_CATEGORIES) ; le builder 4.6 garde son « shelfs » (flf zéro régression, commenté).
  - `[low]` `[patch]` Gardes AC 1 non testées sous `timelapse` : tests ajoutés — upload paresseux + seed `queued`, échec veo → `StepError("video")`.
  - `[low]` `[patch]` `detectedInstances: []` non testé à l'orchestration : test ajouté (prompt === constante générique).
  - `[low]` `[patch]` Union backend dupliquée : `export type VideoBackend` dans config.ts, consommée par le mock d'effects.test.ts (import type, erased — le mock `@/pipeline` n'est pas affecté).
  - `[low]` `[patch]` JSDoc `runVideo` périmée (2 backends de retard) : réécrite pour décrire les 3 branches.
  - `[low]` `[patch]` Tension négatif partagé × esthétique time-lapse (ghosting des humains) non documentée : note de calibration dans la JSDoc du builder — premier bouton à tourner si les movers sortent déformés en live.
  - `[low]` `[patch]` Labels vides/blancs : filtrés du top 5 ; tout-blanc → fallback générique (+ tests).
  - defer: (1) le négatif dédié timelapse exigerait que le négatif devienne un input de `video()` — bouton de calibration post-verdict live ; (2) `console.log({ prompt })` de prompts.ts:220 (diagnostic 4.6) tire à chaque reveal flf en prod — dette pré-existante. reject: séparateur du fallback vs Design Notes (raffinement de formulation explicitement permis) ; double `vi.importActual` (cache module, cosmétique) ; sensibilité à la casse incohérente du helper de test (cosmétique).

## Design Notes

Prompt de départ (le dev affine la formulation, pas la structure — clauses obligatoires : cadrage move-in time-lapse, movers humains qui portent/posent puis sortent du cadre, caméra statique explicite, realistic human motion at time-lapse speed) :

> "Construction move-in time-lapse in a finished empty room, completely static camera on a fixed tripod, no camera movement, no pan, no zoom. Movers and decorators in work clothes walk in and out of the frame carrying furniture, placing each piece one by one at time-lapse speed — the {furniture_list} — adjusting positions until the room is fully furnished and styled, then they exit the frame leaving the finished interior. Realistic human motion at time-lapse speed, natural daylight."

Sans instances : même texte sans « — the {furniture_list} — ». Pattern de référence prouvé (vidéos virales « room transformation », movers + FLF Veo3, 02/2026). Le négatif partagé reste souhaitable tel quel (« fading in », « slow floating » restent des défauts même avec movers).

## Verification

**Commands:**
- `npx vitest run` -- expected: suites existantes + nouvelles vertes, zéro régression
- `npx tsc --noEmit` -- expected: vide
- `npm run lint` -- expected: pas de NOUVELLE erreur (2 pré-existantes texture-bank tolérées)

**Manual checks (if no CLI):**
- Live (FAL_KEY, utilisateur) : `.env` → `NEXT_PUBLIC_VIDEO_BACKEND=timelapse`, une génération complète, verdict SM-1 consigné — c'est l'objet même de la story.

## Auto Run Result

**Statut final : done** (run bmad-dev-auto du 2026-07-25)

**Résumé** : 3ᵉ backend vidéo `timelapse` derrière `NEXT_PUBLIC_VIDEO_BACKEND` — même adaptateur veo 3.1 FLF, prompt « construction move-in time-lapse » (movers portent les meubles un par un, caméra statique, furniture_list dérivée des détections 4.6). Pivot : absorber le morphing par le format au lieu de le cacher, après l'échec live des 3 approches précédentes.

**Fichiers modifiés** :
- `src/pipeline/config.ts` — `VIDEO_BACKEND` 3 valeurs + `export type VideoBackend` + warn sur valeur inconnue
- `src/pipeline/prompts.ts` — `buildTimelapsePrompt` pur + `REVEAL_TIMELAPSE_PROMPT` + `pluralize` (-f→-ves) + filtre labels vides
- `src/pipeline/index.ts` — export
- `src/state/effects.ts` — sélection du builder par backend dans `runVideo` + JSDoc 3 branches
- `src/pipeline/prompts.test.ts`, `src/state/effects.test.ts` — 20 tests nouveaux (builder + orchestration + gardes + régression)

**Revue** : 8 patches appliqués (2 medium, 6 low), 2 defers (négatif timelapse dédié ; console.log 4.6 en prod), 3 rejects. 0 intent_gap, 0 bad_spec.

**Vérification** : `npx vitest run` 35 fichiers / **371 tests verts** ; `npx tsc --noEmit` vide ; `npm run lint` 2 erreurs pré-existantes tolérées uniquement.

**Risques résiduels** : le verdict est LIVE (AC 4, étape humaine) — `.env` `NEXT_PUBLIC_VIDEO_BACKEND=timelapse`, une génération ~0,50 €, verdict SM-1 à consigner. Boutons de calibration si movers déformés : négatif dédié (defer #1), formulation du prompt (`[À calibrer live]`).
