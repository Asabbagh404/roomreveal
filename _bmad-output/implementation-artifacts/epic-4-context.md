# Epic 4 Context: Révélation vidéo & clôture

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le climax du produit : l'utilisateur lance la Génération FLF (première frame = Pièce vide, dernière frame = Photo originale intouchée), contemple sa Révélation en autoplay avec lueur or, la revoit, télécharge le MP4 et peut lancer une Nouvelle Génération. L'epic clôt aussi les livrables de process — coût unitaire documenté dans le README et déploiement de l'instance démo — et valide SM-1 et NFR-1. Rouvert deux fois : le FLF pur morphe/fade quel que soit le prompt, d'où les backends vidéo alternatifs (4.6 prompt enrichi, 4.8 Motion Brush reverse-motion, 4.9 timelapse chantier) comparés en live avant de choisir le défaut.

## Stories

- Story 4.1: Génération de la Révélation (Génération FLF)
- Story 4.2: Lecteur & prévisualisation de la Révélation
- Story 4.3: Téléchargement du MP4
- Story 4.4: Nouvelle Génération & clôture du cycle de vie
- Story 4.5: Coût unitaire documenté & déploiement de l'instance démo
- Story 4.6: Prompt de mouvement piloté par les détections
- Story 4.8: Révélation par Motion Brush (reverse-motion)
- Story 4.9: Révélation « timelapse chantier » (movers/ouvriers)

## Requirements & Constraints

- **Vidéo FLF (FR-10)** : les meubles apparaissent en mouvement (flottement), jamais par fondu ni apparition instantanée ; ~5 s à ≥ 24 fps natif (sans transcodage), ratio de la photo canonique préservé (jamais de crop 16:9 forcé), résolution ≤ 1080p ; durée et preset non exposés en UI.
- **Prévisualisation (FR-11)** et **téléchargement MP4 (FR-12)** : lecture immédiate dans l'app, fichier lisible dans les lecteurs standards.
- **Attente longue (FR-14)** : Panneau d'attente à phases nommées, temps écoulé, annonce « 1 à 3 minutes », message « plus long que prévu » à 3 min 30 s — pur affichage, sans effet sur le job.
- **Échec vidéo (FR-17)** : erreur relançable au niveau de l'étape seule ; Masque et Pièce vide conservés, jamais de retour forcé au début du Parcours.
- **NFR-1 / SM-4** : Génération complète < 4 min sur photo standard, mesurée et documentée.
- **NFR-2 / SM-5** : coût par Génération mesuré et documenté dans le README (cible 0,30–1,25 $ ; estimation ≈ 0,62 $, +0,05 $ par régénération d'inpainting).
- **SM-1** : sur ≥ 10 photos réelles, Révélation jugée cohérente ≥ 7/10 par deux juges externes. Garde-fous : SM-C1 (jamais de vitesse au détriment de la cohérence), SM-C2 (jamais dégrader la qualité tant que le coût reste < ~1,25 $).

## Technical Decisions

- **AD-1 (FLF strict)** : première frame contrainte = Pièce vide, dernière = Photo canonique. **Amendement 4.8** : le backend `motion-brush` seul relâche cet invariant — première frame générée par le modèle, dernière frame = rendu reversé ré-encodé (visuellement la photo, pas pixel-exact) ; cause : sur Kling, `tail_image_url` est exclusif avec les masques Motion Brush, d'où le reverse-motion (clip meublé→vide inversé temporellement). Motion Brush porté par Kling **v1.5 pro** (v1.6 l'a retiré). Le défaut `flf` reste strict.
- **AD-2 (espace pixel canonique)** : masque, Pièce vide et frames partagent les dimensions canoniques ≤ 1024 px ; tout modèle vidéo doit préserver le ratio d'entrée.
- **AD-5 / modèles par rôle** : `video(emptyRoomUrl, photoUrl)` dans `src/pipeline/`, seul importeur de `@fal-ai/client` ; IDs par rôle dans `pipeline/config.ts` — tout repli FLF doit satisfaire AD-1 et AD-2. Prompts de mouvement centralisés dans `pipeline/prompts.ts` (AD-6, fonctions pures `buildRevealMotionPrompt` / `buildTimelapsePrompt`).
- **AD-8 (StepError)** : timeout vidéo ~6 min détecté par l'adaptateur seul, converti en `StepError { step: 'video', retryable: true }` ; l'UI ne voit jamais une erreur fal native.
- **AD-9 (artefacts 24 h)** : tout vit sur le storage fal avec header d'expiration 86400 s sur chaque requête ; MP4 téléchargé depuis l'URL fal (fetch → Blob → objectURL), jamais re-hébergé. Le MP4 inversé de 4.8 repasse par `uploadArtifact` ; la route locale `/reverse` est un traitement transitoire, pas un stockage.
- **AD-10 + AD-12 (queue & async)** : `fal.subscribe` côté client via le proxy, adaptateurs passifs `(inputs, { signal, onPhase })`, orchestration dans `effects.ts` seul, jeton d'époque contre les résultats périmés.
- **AD-14 (WaitPhase)** : enum unique `uploading | queued | generating | finalizing`, mappé par l'adaptateur ; traduction française par le Panneau d'attente seul ; monotonie par tentative.
- **Backends vidéo** : sélection par `NEXT_PUBLIC_VIDEO_BACKEND` (`flf` défaut | `motion-brush` | `timelapse`) — `flf` (veo 3.1 lite) intouché, zéro régression exigée sur les chemins existants.
- **Déploiement (4.5)** : `dev` local et instance démo (`next start` ou Docker) sur réseau privé, seule `FAL_KEY` les distingue ; pas de CI en v1 (lint, typecheck, Vitest locaux avant push).

## UX & Interaction Patterns

- **Lecteur de la Révélation** : autoplay au premier affichage + lueur or autour du cadre, lecture/pause/relecture (`Espace`), stepper 4/4 coché ; aucun confetti ni toast — la vidéo est la célébration.
- **Actions sous le lecteur**, ordre canonique : « Nouvelle Génération » (ghost) → « Revoir » (outline) → « Télécharger le MP4 » (or, bouton primaire unique).
- **Cycle de vie** : confirmation avant « Nouvelle Génération » si la Révélation n'est pas téléchargée ; `beforeunload` avertit pendant une Génération en cours, retour Accueil après rechargement (pas de reprise en v1).
- **Erreur vidéo** : Bandeau avec filet erreur, message FR sans jargon (« La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. »), une seule action de relance.
- Microcopies françaises du glossaire, annonces `aria-live` (polite fin d'attente, assertive erreurs).

## Cross-Story Dependencies

- 4.1 dépend de la Pièce vide (Epic 3) et de la Photo canonique (Epic 1) ; 4.2–4.4 dépendent de `generation.reveal` produit par 4.1 ; 4.5 exige le pipeline complet fonctionnel.
- 4.4 valide FR-15 de bout en bout : retour arrière via le stepper conserve les artefacts amont (reducer AD-11, infra Epic 1).
- 4.6 consomme les instances du backend de détection local (Epic 2, `DETECT_BACKEND=local`) : `generation.detectedInstances` alimente le prompt ; sans instances, comportement 4.1 à l'identique.
- 4.8 consomme le service local (`/instance-masks`, `/reverse`) et se développe en parallèle de la story 4.7 (composite déterministe, autre worktree, absente de ce fichier epics) — comparaison live avant choix du défaut.
- 4.9 réutilise l'adaptateur `video()` de 4.1 et les détections de 4.6 (optionnelles) ; c'est un test d'hypothèse ~0,50 € dont le verdict SM-1 conditionne la suite de la piste vidéo générative.
