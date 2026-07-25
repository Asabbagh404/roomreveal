# Story 4.9: Révélation « timelapse chantier » (movers/ouvriers)

Status: ready-for-dev

<!-- Ajoutée le 2026-07-25 (worktree reveal-motion-brush). Pivot après le verdict live
     3/3 : le FLF pur morphe (4.1/4.6), le composite déterministe est rejeté (« éclaté »,
     4.7 autre worktree), le Motion Brush déforme au lieu de translater (4.8, même avec
     trajectoires hors-cadre — commit 90fed3e). Insight : au lieu de CACHER le morphing,
     l'ABSORBER par le format « timelapse de chantier » — des déménageurs portent les
     meubles un par un à vitesse timelapse (mécanisme causal + occlusion + attente
     spectateur). Pattern de référence : vidéos virales « room transformation »
     (Nano Banana + Veo3, Ritesh Kanjee 02/2026) — clip vide→meublé animé par des movers.
     Objectif : valider l'hypothèse à ~0,50 € sur fal AVANT tout investissement dans la
     stack self-hosted « RoomLapse » (brief ComfyUI/Wan 2.2 en réserve). -->

## Story

As a utilisateur,
I want que ma Révélation ressemble à un timelapse d'emménagement — des déménageurs apportent et posent chaque meuble un par un —,
so that les artefacts d'interpolation deviennent invisibles (le chaos = « le travail avance ») et la vidéo gagne l'effet « wow » viral (SM-1).

## Acceptance Criteria

1. **Backend sélectionnable, zéro régression** — **Given** `NEXT_PUBLIC_VIDEO_BACKEND` étendu à trois valeurs (`flf` défaut | `motion-brush` | `timelapse`), **When** l'étape Vidéo génère, **Then** `flf` et `motion-brush` conservent EXACTEMENT leur comportement actuel, et `timelapse` emprunte le MÊME adaptateur `video()` (veo 3.1 lite, FLF strict AD-1 : first = Pièce vide, last = photo intouchée) avec un prompt différent. Aucun nouveau modèle, aucun changement de `MODELS`/`FAL_ALLOWED_ENDPOINTS`/`TIMEOUTS_MS`.
2. **Builder de prompt pur** — **Given** `pipeline/prompts.ts` (AD-6), **When** on ajoute `buildTimelapsePrompt(instances?: readonly DetectedInstance[]): string`, **Then** la fonction est pure et déterministe : avec instances, les labels des ~5 plus grosses par aire forment une `furniture_list` nommée dans le prompt (« carry in and place each piece one by one — the {list} — ») ; sans instances (fal backend, 204, `undefined`, `[]`), un prompt générique équivalent sans liste. Le prompt contient obligatoirement : (a) le cadrage « construction/moving time-lapse », (b) le mécanisme causal humain (« movers/workers in work clothes carry in and place… then exit the frame »), (c) la contrainte caméra statique en clair (« completely static camera, fixed tripod, no camera movement, no pan, no zoom »), (d) « realistic human motion at time-lapse speed ». La clause `REVEAL_ANTI_MORPHING_TAIL` n'est PAS reprise verbatim (elle interdit le mouvement lent/progressif — contraire au portage pièce par pièce) ; le anti-morphing passe par le mécanisme causal.
3. **Négatif compatible** — **Given** `REVEAL_NEGATIVE_PROMPT` (importé en dur par `video.ts`), **When** le chemin timelapse l'utilise tel quel, **Then** vérifier qu'aucun terme n'interdit les personnes (c'est le cas aujourd'hui : morphing/fading/floating seulement — compatible workers). NE PAS le modifier (le flf par défaut le partage) ; la contrainte caméra vit dans le prompt positif (AC 2c).
4. **Orchestration minimale** — **Given** `effects.ts#runVideo`, **When** `VIDEO_BACKEND === "timelapse"`, **Then** la branche suit le chemin flf existant à un détail près : `motionPrompt = buildTimelapsePrompt(state.detectedInstances)` au lieu de `buildRevealMotionPrompt(...)`. Mêmes gardes (`dead()`, epoch, upload paresseux photo, seed `queued`), même exigence `emptyRoomUrl` définie (le guard ligne ~442 doit traiter `timelapse` comme `flf` : Pièce vide REQUISE), même `StepError("video", true)` en échec.
5. **Tests** — `prompts.test.ts` : builder avec/sans instances (fallback générique ≠ `REVEAL_MOTION_PROMPT` mais même mécanique), présence des clauses obligatoires (camera statique, movers, time-lapse), fusion/nommage des labels, pureté/déterminisme. `effects.test.ts` : la branche `timelapse` appelle `video()` avec le prompt timelapse et exige la Pièce vide ; les branches `flf` et `motion-brush` inchangées (régression). Suites Vitest existantes vertes ; `tsc`, lint sans nouvelle erreur.
6. **Verdict live documenté** — après implémentation, UNE génération live (~0,50 €) avec `NEXT_PUBLIC_VIDEO_BACKEND=timelapse` ; le verdict (le framing chantier absorbe-t-il le morphing ?) est consigné dans le Dev Agent Record + `deferred-work.md` : s'il est bon → candidat défaut + feu vert éventuel RoomLapse self-hosted ; s'il est mauvais → clore la piste vidéo générative sur fal.

## Tasks / Subtasks

- [ ] Task 1 — Config (AC: 1)
  - [ ] `config.ts` : `VIDEO_BACKEND` devient `"flf" | "motion-brush" | "timelapse"` (parse `NEXT_PUBLIC_VIDEO_BACKEND`, défaut `flf` inchangé) ; commentaire pivot 4.9
  - [ ] `config.test.ts` : les trois valeurs parse correctement, défaut `flf`
- [ ] Task 2 — Builder de prompt (AC: 2, 3)
  - [ ] `prompts.ts` : `buildTimelapsePrompt(instances?)` pur + constante générique fallback ; JSDoc avec le rationale (absorber vs cacher le morphing) et `[À calibrer live]`
  - [ ] `prompts.test.ts` : cas AC 5
- [ ] Task 3 — Orchestration (AC: 4)
  - [ ] `effects.ts#runVideo` : guard Pièce vide couvre `timelapse` ; sélection du builder par backend ; RIEN d'autre ne bouge
  - [ ] `effects.test.ts` : branche timelapse + régression flf/motion-brush
- [ ] Task 4 — Vérification (AC: 5)
  - [ ] `npx vitest run` + `npx tsc --noEmit` + lint verts ; commit
- [ ] Task 5 — Live (AC: 6) [utilisateur dans la boucle]
  - [ ] `.env` : `NEXT_PUBLIC_VIDEO_BACKEND=timelapse` ; une génération complète ; verdict consigné

## Dev Notes

### Contexte & décision (2026-07-25)

- **Verdict 3/3 des approches reveal** : (1) FLF pur/prompt 4.6 → morphing structurel (kling o1 ET veo 3.1 lite) ; (2) composite déterministe 4.7 (autre worktree) → rejeté « éclaté » ; (3) Motion Brush 4.8 → Kling v1.5 pro DÉFORME les meubles au lieu de les translater, même avec trajectoires hors-cadre (commit 90fed3e) — l'outil n'est pas conçu pour évacuer de gros objets.
- **Insight du pivot** : le morphing FLF est incorrigible techniquement sur fal, mais le format « timelapse chantier » le rend ACCEPTABLE : (a) mécanisme causal — des humains portent les objets, le modèle a une histoire physique pour les introduire au lieu de les faire pousser du néant ; (b) vitesse timelapse + occlusion par les ouvriers masquent les artefacts ; (c) attente du spectateur — dans un chantier, le chaos visuel = progression. Notre reveal « léché » EXPOSAIT le morphing ; ce format l'ABSORBE.
- **Pattern de référence prouvé** : vidéos virales « room transformation » (Ritesh Kanjee, Medium 02/2026) — cascade keyframes + clips FLF Veo3 dont le clip vide→meublé est animé par « movers carry in furniture ». Notre test = ce clip exact, avec notre veo 3.1 lite déjà branché.
- **Ceci est un TEST D'HYPOTHÈSE à ~0,50 €**, pas un engagement : si le live est bon, il débloque potentiellement le brief « RoomLapse » (timelapse complet gros œuvre→meublé, self-hosted ComfyUI/Wan 2.2 — projet séparé, PAS dans ce repo). Si mauvais, on clôt la piste générative fal proprement.

### État en place (NE PAS recréer / NE PAS casser)

- **`video.ts`** (veo 3.1 lite FLF) : INTOUCHÉ. Le prompt est déjà un INPUT (`motionPrompt`) depuis la 4.6 — l'adaptateur est passif, aucun changement de signature nécessaire. `REVEAL_NEGATIVE_PROMPT` y est importé en dur : le laisser (AC 3).
- **`prompts.ts`** : `buildRevealMotionPrompt` (4.6) est le patron à suivre — tri par aire desc, top 5, fusion des labels identiques, pluriel naïf, labels GDINO en anglais tels quels. `REVEAL_ANTI_MORPHING_TAIL` reste privé au chemin 4.6. ⚠️ Un `console.log({ prompt })` traîne ligne 220 (diagnostic 4.6) — ne pas le répliquer dans le nouveau builder.
- **`effects.ts#runVideo`** (effects.ts:432) : gardes `dead()`/epoch, upload paresseux photo, seed `queued`, branche motion-brush avec fallback flf sur 204. La ligne 442 (`if (VIDEO_BACKEND !== "motion-brush" && emptyRoomUrl === undefined) return;`) couvre déjà `timelapse` correctement (timelapse ≠ motion-brush → Pièce vide requise) — VÉRIFIER par test plutôt que réécrire.
- **`config.ts:113`** : `VIDEO_BACKEND` en ternaire binaire — à étendre proprement (pattern : parse la valeur, whitelist, défaut `flf`).
- **`generation.detectedInstances`** (reducer, 4.6) : rempli par le backend local uniquement ; `undefined` sur fal/204 — le builder DOIT avoir un fallback générique solide (AC 2), car le test live peut tourner avec ou sans détection locale.
- **Worktree** : `feat/reveal-motion-brush`, tout le travail 4.8 committé (90fed3e). La 4.9 s'empile dessus — le backend motion-brush reste en place derrière son flag (mort mais documenté).

### Prompt de départ proposé (le dev peut affiner la formulation, pas la structure)

Avec instances (liste = labels top 5 fusionnés) :

> "Construction move-in time-lapse in a finished empty room, completely static camera on a fixed tripod, no camera movement, no pan, no zoom. Movers and decorators in work clothes walk in and out of the frame carrying furniture, placing each piece one by one at time-lapse speed — the {furniture_list} — adjusting positions until the room is fully furnished and styled, then they exit the frame leaving the finished interior. Realistic human motion at time-lapse speed, natural daylight."

Sans instances : même texte sans le segment « — the {list} — ». Négatif : `REVEAL_NEGATIVE_PROMPT` tel quel (aucun terme anti-personnes ; « slow floating/drifting » et « fading in » restent souhaitables même avec des movers).

### Pièges connus

- **Ne PAS reprendre `REVEAL_ANTI_MORPHING_TAIL`** : « rush in early / landed well before the last frame » contredit le portage un-par-un étalé sur le clip. Le timelapse VEUT de l'activité jusqu'au bout.
- **Ne pas toucher `REVEAL_NEGATIVE_PROMPT`** : partagé avec le flf par défaut (zéro régression). Si le live montre du mouvement caméra, l'amendement du négatif sera une story de calibration séparée.
- **veo 3.1 lite ~5 s** : le portage « one by one » sera nécessairement stylisé/rapide — c'est voulu (timelapse). Ne pas chercher à rallonger `duration` dans cette story.
- **`console.log` interdit en prod** (règles projet) : ni dans le builder, ni dans la branche effects.
- **Le test live est l'AC final** : comme tout le projet, jsdom ne juge pas l'esthétique. Prévoir le verdict AVANT de déclarer la story done — c'est précisément l'objet de la story.

### Testing Requirements

- **Pur (Vitest)** : `prompts.test.ts` (builder : fallback sans instances, liste avec instances, fusion labels, clauses obligatoires présentes — « static camera », « time-lapse », « movers » —, déterminisme) ; `config.test.ts` (3 valeurs backend + défaut) ; `effects.test.ts` (branche timelapse → `video()` reçoit le prompt timelapse ; Pièce vide requise ; flf/motion-brush inchangés).
- **Live (FAL_KEY)** : une génération `timelapse` de bout en bout ; verdict SM-1 consigné (AC 6). Coût attendu ≈ 0,45 $ (veo 3.1 lite 720p muet, 5 s à 0,03 $/s × ~3, selon la facture réelle 4.5).
- Régression : suites 1.x–5.x + 4.6 + 4.8 vertes ; `tsc` ; lint (2 erreurs pré-existantes texture-bank tolérées).

### Project Structure Notes

- **Modifs uniquement** : `src/pipeline/config.ts` (+test), `src/pipeline/prompts.ts` (+test), `src/state/effects.ts` (+test). Aucun nouveau fichier, aucun changement Python, aucun changement d'adaptateur.
- **Intouchés** : `video.ts`, `video-motion-brush.ts`, `motion-trajectory.ts`, `instance-masks.ts`, `local-detect/`, tous `components/`.
- Nommage anglais : `buildTimelapsePrompt`, valeur de flag `"timelapse"`.

### References

- [Source: epics.md#Story 4.9 (ajoutée 2026-07-25) ; verdict 3/3 en mémoire projet `reveal-video-approaches-verdict`]
- [Source: 4-8-*.md — Dev Notes (échec motion-brush, contrat veo/kling) ; 4-6-*.md — patron builder de prompt]
- [Source: src/pipeline/prompts.ts:131-222 ; src/pipeline/video.ts ; src/state/effects.ts:432-521 ; src/pipeline/config.ts:107-114]
- [Source: pattern de référence — « How I Create Viral Room Transformation Videos », Ritesh Kanjee, Medium 02/2026 (movers + FLF, Veo3) ; brief RoomLapse (Fable, 2026-07-25) §7.2 action_block clip_3]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
