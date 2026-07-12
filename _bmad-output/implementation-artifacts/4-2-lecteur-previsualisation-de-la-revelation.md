---
baseline_commit: a5d192c
---

# Story 4.2: Lecteur & prévisualisation de la Révélation

Status: done

## Story

As a utilisateur,
I want visionner ma Révélation dès qu'elle est prête,
so that je savoure l'effet « wow » et vérifie le résultat avant de le télécharger.

## Acceptance Criteria

1. **Given** une Révélation prête (`generation.reveal`) **When** l'étape Vidéo s'affiche **Then** la vidéo se lance **automatiquement** dans le Lecteur de la Révélation, avec la **lueur or** autour du cadre **au premier lancement** (FR-11, UX-DR10, DESIGN#Elevation) **And** le stepper affiche **4/4 coché** (l'étape Vidéo porte une coche quand `reveal` existe).
2. **Given** le Lecteur de la Révélation **When** l'utilisateur interagit **Then** **lecture/pause** et **relecture** (« Revoir ») sont disponibles, **`Espace`** bascule lecture/pause (FR-11, UX-DR10) **And** la durée ~5 s et le preset ne sont **ni exposés ni configurables** dans l'UI (pas de scrubber/téléchargement natif ; contrôles sobres) (UX-DR10).
3. **Given** la Révélation prête **When** le succès est affiché **Then** **aucun confetti ni toast** — la vidéo est la célébration (lueur or uniquement) (UX-DR15).

## Tasks / Subtasks

- [x] Task 1 : `src/components/reveal-player.tsx` (nouveau) — le Lecteur (AC: 1, 2, 3)
  - [x] Composant client `RevealPlayer({ src }: { src: string })`. Rendu : cadre média `max-w-3xl rounded-lg overflow-hidden` (famille « écran de cinéma », DESIGN) contenant `<video>` **sans `controls` natifs** (pas de scrubber → durée/preset non exposés, UX-DR10), `muted` + `playsInline` + `autoPlay` (autoplay fiable — la Révélation est muette ; le muted est requis par la politique navigateur), `className="block h-auto w-full"` (ratio naturel = canonique, AR-PIXELS). Chargement direct de l'URL fal publique (AD-4).
  - [x] **Contrôles sobres** (texte-principal sur fond semi-transparent, DESIGN#Lecteur) : un bouton **lecture/pause** (superposé, ex. coin bas-gauche) ET clic sur la vidéo bascule aussi. Icônes lucide (`Play`/`Pause`), pas de scrubber, pas de menu. État local `isPlaying` synchronisé via les events `play`/`pause`/`ended` du `<video>`.
  - [x] **Relecture** : bouton secondaire **« Revoir »** (`<Button variant="outline">`) sous le lecteur → `video.currentTime = 0; video.play()`. (Les boutons « Télécharger le MP4 » [Story 4.3] et « Nouvelle Génération » [Story 4.4] s'inséreront **sous** le lecteur dans l'ordre canonique DESIGN : « Nouvelle Génération » (ghost) · « Revoir » (outline) · « Télécharger le MP4 » (or) — n'ajouter QUE « Revoir » ici, laisser la place.)
  - [x] **`Espace` = lecture/pause** : `window` keydown ; si la cible est un contrôle focusable (`BUTTON`/`INPUT`/`TEXTAREA`/`[role]`) → **ignorer** (laisser le contrôle recevoir Espace) ; sinon `e.preventDefault()` (pas de scroll) + toggle play/pause. Nettoyer l'écouteur au démontage. (Motif `mask-surface.tsx` `isEditableTarget` + raccourcis clavier.)
  - [x] **Lueur or au premier lancement** (DESIGN#Elevation : lueur douce dérivée de `or-lumineux` #f2c14e, blur large ≥ 40px, opacité ≤ 8 %, **au moment de la Révélation uniquement**) : appliquer une lueur (ex. `shadow-[0_0_60px_-8px_rgba(242,193,78,0.08)]` ou pseudo-couche floutée) sur le cadre, **visible au 1er lancement** puis **estompée** (transition d'opacité) une fois la 1re lecture terminée (event `ended`) — état `firstPlayGlow`. Jamais ailleurs.
  - [x] **Aucun confetti/toast** (UX-DR15) : ne rien ajouter d'autre — la lueur EST la célébration.
- [x] Task 2 : `src/components/video-surface.tsx` — brancher le Lecteur (AC: 1)
  - [x] Dans la branche `reveal` présent, remplacer le `<video controls>` minimal (Story 4.1) par `<RevealPlayer src={state.reveal} />`. Conserver l'effet d'entrée `runVideo` et la branche placeholder (`aspect-[4/3]` au ratio canonique) **inchangés**. Le cadre/ratio est désormais porté par `RevealPlayer` pour la branche vidéo (retirer le double-cadre si redondant, garder un seul conteneur média).
- [x] Task 3 : `src/components/stepper.tsx` — 4/4 coché (AC: 1)
  - [x] L'étape courante affiche une **coche** (au lieu du numéro) quand elle est terminale-complète : `isDone = isCurrent && step === "video" && state.reveal !== undefined`. Badge : `{(isBehind || isDone) ? <Check/> : index + 1}`. Garder le style courant (fond or) — l'étape Vidéo est à la fois **courante (or)** et **cochée** quand la Révélation est prête. Ne PAS cocher les autres étapes courantes (scope strict à video+reveal). Ajouter un cas à `stepper.test.tsx`.
- [x] Task 4 : Vérification (AC: 1–3)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (aucune régression Epics 1–4.1).
  - [x] **Live (FAL_KEY)** : générer une Révélation → à l'affichage, la vidéo **démarre seule**, **lueur or** autour du cadre au 1er lancement puis s'estompe ; stepper **4/4 coché** (coche sur Vidéo) ; clic vidéo et bouton = lecture/pause ; **`Espace`** bascule lecture/pause (et n'agit pas quand un bouton est focus) ; **« Revoir »** relance depuis le début ; **pas de scrubber/durée/preset** exposés ; **aucun confetti/toast**. 0 erreur console.

## Dev Notes

### État en place (NE PAS recréer)

- **`video-surface.tsx`** (4.1) : effet d'entrée `runVideo` (INCHANGÉ), rendu `reveal` présent = `<video controls>` minimal **à remplacer** par `<RevealPlayer>` ; branche placeholder `aspect-[4/3]` au ratio canonique (garder). Le conteneur est cadré au ratio canonique via `originalPhoto.width/height`.
- **`stepper.tsx`** : badge `{isBehind ? <Check/> : index+1}`, `isCurrent` → fond `bg-or-lumineux`. `STEP_ORDER`/`STEP_LABELS`. `Check` de `lucide-react` **déjà importé**. `state` via `useGeneration`. → ajouter la coche terminale sur video+reveal.
- **`ui/button.tsx`** : variants `outline` (Revoir), `ghost`, `secondary`, `default` (or). Réutiliser pour « Revoir ».
- **Tokens** : `--color-or-lumineux` = `#f2c14e` ; `rounded-lg` (12px, cadre média) ; `text-texte-principal`, `bg-surface-elevee`, `border-bordure`. `scene-gap` (48px) pour l'espacement scène.
- **lucide-react** : `Play`, `Pause` (et `Check` déjà utilisé) — dépendance présente.
- **Raccourci clavier** : motif `mask-surface.tsx` (`window` keydown + `isEditableTarget` pour ne pas voler l'Espace aux boutons/inputs ; cleanup au démontage). RÉUTILISER cette logique (ne pas réinventer). Le mask-surface est démonté sur l'étape video → pas de conflit d'écouteurs.
- **`generation.reveal`** : URL MP4 fal (posée par `VIDEO_SUCCEEDED`, 4.1). Chargement direct (GET public, AD-4). Périt à 24 h (AD-9).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AR-LAYERS** : 4.2 est **100 % présentation** — lit `state.reveal`/`state.step`, aucun appel `pipeline/`, aucune nouvelle logique métier, **reducer inchangé**. Le Lecteur ne fait que lire/afficher l'URL fal. [Source: 4-1/3-2 Dev Notes]
- **AD-4** : les URLs storage fal se chargent en **GET direct** (images, **lecteur vidéo**, download) — pas via le proxy. Le `<video src={reveal}>` pointe directement sur fal.media. [Source: ARCHITECTURE-SPINE.md#AD-4, ligne 74]
- **AD-2 / AR-PIXELS** : le lecteur préserve le ratio (vidéo `h-auto w-full`, pas de crop). [Source: ARCHITECTURE-SPINE.md#AD-2]
- **AD-3/AD-11** : aucune mutation d'état ; la Révélation reste en `generation.reveal`. Un retour arrière (Stepper) conserve tout (FR-15). [Source: ARCHITECTURE-SPINE.md#AD-11]

### Contraintes UX (font foi)

- **Autoplay au premier affichage** — la Révélation EST le climax (`[ASSUMPTION : autoplay]`, EXPERIENCE.md:72,139). Muted+playsInline requis pour l'autoplay navigateur ; bouton lecture en repli si le navigateur bloque. [Source: EXPERIENCE.md:72]
- **Lueur or** : `DESIGN.md#Elevation & Depth` — lueur douce `or-lumineux`, blur ≥ 40px, opacité ≤ 8 %, **uniquement au moment de la Révélation**. « au premier lancement » (EXPERIENCE.md:88, epics 4.2). Nulle part ailleurs. [Source: DESIGN.md:141,160]
- **Contrôles sobres**, durée+preset **non exposés ni configurables** (pas de scrubber natif, pas de réglages) — `DESIGN.md#Lecteur`. Lecture/pause + relecture (« Revoir »). `Espace` = lecture/pause (EXPERIENCE.md:114). [Source: DESIGN.md:160, EXPERIENCE.md:72,114]
- **Pas de confetti/toast** — la vidéo (lueur or) est la seule célébration (UX-DR15, EXPERIENCE.md:88). [Source: EXPERIENCE.md:88]
- **Stepper 4/4 coché** au succès (EXPERIENCE.md:88). [Source: EXPERIENCE.md:88]
- **Ordre canonique des actions sous le lecteur** (DESIGN.md:160) : « Nouvelle Génération » (ghost) · « Revoir » (outline) · « Télécharger le MP4 » (or). **4.2 ne pose que « Revoir »** ; 4.3 ajoute le téléchargement, 4.4 la Nouvelle Génération — laisser la place / respecter l'ordre quand ils arrivent.

### Pièges connus

- **Autoplay** : sans `muted`, les navigateurs bloquent l'autoplay → toujours `muted` + `playsInline`. Prévoir le bouton lecture comme repli si `video.play()` rejette (catch silencieux).
- **`Espace`** : `preventDefault` pour éviter le scroll de page ; **ignorer** si un bouton/contrôle est focus (sinon on vole l'activation du bouton — motif `isEditableTarget`). Écouteur `window` nettoyé au démontage.
- **Lueur au 1er lancement seulement** : l'estomper après la 1re lecture (`ended`) ; ne pas la laisser en permanence (DESIGN : « au moment de la Révélation uniquement »).
- **Pas de `controls` natifs** : ils exposent scrubber/durée/menu download → violent UX-DR10. Contrôles custom uniquement.
- **Ne pas ajouter download / nouvelle génération** ici (4.3/4.4). Ne pas ajouter de confetti/toast (UX-DR15).
- **Stepper** : cocher UNIQUEMENT video+reveal (ne pas cocher une étape courante mask/emptyRoom qui aurait son artefact — scope strict).
- **Ratio** : `<video h-auto w-full>` (ratio naturel) — ne pas forcer d'aspect (le MP4 est déjà au ratio canonique). Éviter un double cadre (RevealPlayer porte le cadre pour la branche vidéo).
- **AGENTS.md** : « This is NOT the Next.js you know » — `<video>` en composant client, rien de spécial mais rester prudent.

### Testing Requirements

- **Pur (Vitest / jsdom)** : `stepper.test.tsx` — l'étape video affiche une coche quand `reveal` présent (et le numéro sinon). La logique lecteur (autoplay/glow/Espace/relecture) touche l'API `HTMLMediaElement` (play/pause) **non implémentée en jsdom** → **vérif live** (ne pas simuler la lecture en unit ; au plus, un smoke test que `RevealPlayer` rend un `<video>` avec le bon `src` et sans `controls`).
- **Non testable jsdom → live (FAL_KEY)** : autoplay, lueur or + estompe, lecture/pause (clic + bouton), `Espace`, « Revoir », absence de scrubber/confetti. Vérif live Playwright.
- Régression : suites 1.x/2.x/3.x/4.1 vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Nouveau** : `src/components/reveal-player.tsx`.
- **Modifs** : `src/components/video-surface.tsx` (utilise `RevealPlayer`), `src/components/stepper.tsx` (+ `.test.tsx` — coche 4/4).
- Nommage anglais (glossaire : `reveal`). Réutilise `ui/button.tsx`, lucide (`Play`/`Pause`/`Check`), tokens or-lumineux/rounded-lg, motif clavier `mask-surface`. Ne réinvente rien.

### References

- [Source: epics.md#Story 4.2]
- [Source: ARCHITECTURE-SPINE.md#AD-2 (AR-PIXELS), AD-4, AD-11, AR-LAYERS]
- [Source: prd.md#FR-11 ; EXPERIENCE.md:72,88,114,139 (Lecteur, autoplay, lueur or, Espace, pas de confetti) ; DESIGN.md:141,160 (Elevation/lueur, Lecteur, ordre des actions)]
- [Source: src/components/video-surface.tsx (4.1), stepper.tsx (badge/Check), mask-surface.tsx (motif raccourci clavier + isEditableTarget), ui/button.tsx]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Directive `eslint-disable jsx-a11y/media-has-caption` inutile (règle non active) → retirée (warning lint).

### Completion Notes List

- **`components/reveal-player.tsx`** (nouveau) : `RevealPlayer({ src })`. `<video muted playsInline autoPlay>` **sans `controls` natifs** (pas de scrubber/durée/preset exposés, UX-DR10) ; `muted` posé aussi impérativement (quirk React `muted`) pour fiabiliser l'autoplay. Contrôles sobres : bouton **lecture/pause** superposé (Play/Pause lucide, `bg-black/50 backdrop-blur`) + clic sur la vidéo. **« Revoir »** (`Button variant="outline"`) → `currentTime=0; play()`. **`Espace`** = lecture/pause via `window` keydown, ignoré si un contrôle est focus (`isControlTarget`) + `preventDefault`. **Lueur or** (`shadow-[0_0_90px_8px_rgba(242,193,78,0.10)]`, or-lumineux #f2c14e, blur large / faible opacité par DESIGN) au **1er lancement**, estompée (`transition-shadow`) sur `ended`. Aucun confetti/toast (UX-DR15). Présentation pure (AR-LAYERS).
- **`components/video-surface.tsx`** : branche `reveal` présent → `<RevealPlayer src={state.reveal} />` (remplace le `<video controls>` minimal de 4.1) ; branche placeholder (ratio canonique) inchangée ; effet d'entrée `runVideo` inchangé.
- **`components/stepper.tsx`** : coche terminale — `isDone = isCurrent && step==="video" && reveal !== undefined` → badge `Check` (au lieu du numéro) tout en gardant le style courant (or). **4/4 coché** au succès. Scope strict video+reveal (n'affecte pas mask/emptyRoom courants).
- **Tests** : `stepper.test.tsx` +2 (coche quand reveal présent ; numéro sinon). Le comportement lecteur (autoplay/glow/Espace/relecture) touche l'API `HTMLMediaElement` non implémentée en jsdom → **vérif live**. **141 tests verts** (+2), `tsc`/`lint`/`build` OK. Lecteur = vérif live en attente.

### File List

- `src/components/reveal-player.tsx` (nouveau)
- `src/components/video-surface.tsx` (modifié — utilise `RevealPlayer`)
- `src/components/stepper.tsx` (modifié — coche 4/4 sur video+reveal)
- `src/components/stepper.test.tsx` (modifié — 2 tests coche terminale)

## Change Log

- 2026-07-12 : Story 4.2 créée (create-story) — Lecteur de la Révélation (autoplay muted, lueur or au 1er lancement, lecture/pause + « Revoir », Espace, pas de confetti ; stepper 4/4 coché). Présentation pure. Statut → ready-for-dev.
- 2026-07-12 : Story 4.2 implémentée (dev-story) — `RevealPlayer` (autoplay muted, lueur or 1er lancement, play/pause + « Revoir » + Espace, pas de native controls/confetti), câblage `video-surface`, coche 4/4 `stepper`. 141 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-12 : Revue adversariale (Blind + Edge + Acceptance). ACs 1-3 tous PASS. 0 CRITICAL, 0 HIGH. 2 correctifs, reste noté. 141 tests verts. Statut → **done**. Vérif live en attente.

## Senior Developer Review (AI)

**Date :** 2026-07-12 · **Résultat :** Approuvé après 2 correctifs · **Verdict ACs :** AC1/AC2/AC3 PASS statiquement (autoplay muted câblé, lueur or or-lumineux au 1er lancement estompée sur `ended`, pas de `controls` natifs → durée/preset non exposés, `Espace` gardé des contrôles focus, coche 4/4 scope video+reveal, aucun confetti/toast — vérifié par grep). Comportement lecture réel = live-only (jsdom n'implémente pas `HTMLMediaElement.play()`).

### Correctifs appliqués

- [x] **[Bas]** Opacité de la lueur `0.10` → **`0.08`** pour respecter le plafond DESIGN (« opacité ≤ 8 % »). (Blind Hunter + Acceptance Auditor)
- [x] **[Moyen]** `key={state.reveal}` sur `<RevealPlayer>` : un changement d'URL de Révélation (ex. « Nouvelle Génération », Story 4.4, si elle reste sur l'étape video) force un **remount propre** → autoplay + lueur + état de lecture frais, au lieu d'un `firstPlayGlow`/`isPlaying` périmés sur un swap de `src` sans démontage. Coût nul sur le chemin courant (URL stable). (Edge Case Hunter)

### Écartés / Différés (documentés)

- **Lueur persistante si l'utilisateur met en pause avant la fin** (Blind, Bas) : `firstPlayGlow` ne s'estompe qu'à `ended` — **intentionnel** (« au premier lancement », se règle quand la 1re lecture s'achève).
- **Glow re-affiché à chaque remount** (Edge scénario 5, Bas) : per-mount défendable (chaque retour sur la surface = « un lancement ») ; pas de persistance cross-mount (over-engineering évité).
- **`.catch(()=>{})` sur `play()`** (Edge, Bas) : silencieux volontaire (repli gracieux si l'autoplay est bloqué — l'utilisateur clique Lecture ; pas de surface d'erreur, UX-DR15).
- **Effet `muted` impératif double-invoqué en StrictMode** (Blind, Bas) : idempotent, sans impact.
- **Fixture test `atVideo` sans `originalPhoto`** (Blind, Bas) : le stepper ne lit pas `originalPhoto` ; sans impact.
