# Epic 4 Context: Révélation vidéo & clôture

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le climax du produit : l'utilisateur lance la Génération FLF (première frame = Pièce vide, dernière frame = Photo originale intouchée), contemple sa Révélation en autoplay avec lueur or, la revoit, télécharge le MP4 et peut lancer une Nouvelle Génération. L'epic clôt aussi les livrables de process — coût unitaire documenté dans le README et déploiement de l'instance démo — et valide SM-1 (cohérence jugée par panel) et NFR-1 (temps de bout en bout). Réouvert le 2026-07-24 pour la story 4.6 (prompt de mouvement piloté par les détections, approche « prompt enrichi »).

## Stories

- Story 4.1 : Génération de la Révélation (Génération FLF)
- Story 4.2 : Lecteur & prévisualisation de la Révélation
- Story 4.3 : Téléchargement du MP4
- Story 4.4 : Nouvelle Génération & clôture du cycle de vie
- Story 4.5 : Coût unitaire documenté & déploiement de l'instance démo
- Story 4.6 : Prompt de mouvement piloté par les détections

## Requirements & Constraints

- **Vidéo FLF (FR-10)** : Révélation ~5 s à ≥ 24 fps (framerate natif du modèle, pas de transcodage), première frame contrainte = Pièce vide, dernière frame = Photo originale visuellement identique ; les meubles apparaissent en mouvement (flottement), jamais par fondu ni apparition instantanée. Durée et preset uniques en v1, non exposés à l'utilisateur.
- **Prévisualisation (FR-11)** : lecture dans le navigateur avec lecture/pause et relecture.
- **Téléchargement (FR-12)** : MP4 lisible dans les lecteurs standards (VLC, QuickTime, lecteur natif OS).
- **NFR-1 / SM-4** : Génération complète < 4 minutes sur photo standard, Génération FLF (1–3 min annoncées) comprise — mesuré et documenté.
- **NFR-2 / SM-5** : coût par Génération mesuré et documenté dans le README ; cible 0,30–1,25 $, COGS estimé ≈ 0,62 $ (+0,05 $ par régénération d'Inpainting).
- **SM-1** : sur ≥ 10 photos réelles de salons meublés, Révélation jugée cohérente ≥ 7/10 par deux juges externes (protocole humain, pas de tests automatisés pour cette qualité).
- **Contre-métriques** : SM-C1 — ne pas réduire le temps de génération au détriment de la cohérence visuelle ; SM-C2 — ne pas dégrader la qualité vidéo pour le coût tant que < ~1,25 $/Génération.

## Technical Decisions

- **Modèle vidéo — le code fait foi** : depuis le 2026-07-24, le rôle `video` est `fal-ai/veo3.1/lite/first-last-frame-to-video` (voir `src/pipeline/config.ts` et `src/pipeline/video.ts`), remplaçant kling o1 encore cité dans la table Stack du spine et dans la story 4.1. Paramètres actuels : `first_frame_url`/`last_frame_url`, 720p, `generate_audio: false` (plancher de coût ~0,03 $/s), pas d'`aspect_ratio` explicite (défaut « auto » = ratio des frames d'entrée). Les invariants du spine restent contraignants pour tout modèle : **AD-1** (FLF strict — start ET end frame contraints, jamais d'image-to-video simple) et **AD-2** (ratio de la photo canonique préservé de bout en bout, jamais de crop 16:9 forcé, résolution ≤ 1080p).
- **AD-5 / AD-12** : l'adaptateur `video(emptyRoomUrl, photoUrl, { signal, onPhase })` vit dans `src/pipeline/`, seul importeur du client fal ; fonction passive rejetant en `StepError`, orchestrée par la couche effectrice unique (`src/state/effects.ts`) avec `AbortController` et jeton d'époque — un résultat d'époque périmée est jeté sans dispatch.
- **AD-10** : job long via la queue fal (`fal.subscribe`) côté client à travers le proxy ; pas de webhook. Les statuts queue sont mappés vers `WaitPhase` (`uploading | queued | generating | finalizing`) dans l'adaptateur seul (AD-14).
- **AD-8** : timeout vidéo 6 min détecté par l'adaptateur (config `TIMEOUTS_MS.video`), converti en `StepError { step: 'video', retryable: true }` ; l'UI ne voit jamais d'erreur fal native ; la relance est limitée à l'étape Vidéo, Masque et Pièce vide conservés.
- **AD-9** : la Révélation vit sur le storage fal avec expiration 24 h (header lifecycle sur chaque requête) ; le MP4 se télécharge depuis l'URL fal via fetch client → Blob → objectURL — jamais re-hébergé ni relayé par une route serveur.
- **AD-6** : prompt de mouvement (preset « mix côtés + plafond ») et negative prompt centralisés dans `src/pipeline/prompts.ts` ; IDs de modèles par rôle dans `pipeline/config.ts` uniquement.
- **AD-11** : « Nouvelle Génération » et retours via stepper suivent la sémantique d'invalidation du reducer : revenir conserve les artefacts, avancer à nouveau invalide l'aval (avec confirmation) ; une Révélation ne coexiste jamais avec une Pièce vide qui n'est pas la sienne.
- **Story 4.6 (extension de contrats)** : le backend de détection local renvoie en plus du masque une liste d'instances `{ label, box, area }` (boîtes normalisées [0,1]) exposée via `DetectResult.instances` (optionnel ; backend fal → `undefined`, jamais exposé en UI) ; le reducer les conserve dans `generation.detectedInstances` ; `buildRevealMotionPrompt(instances)` (fonction pure, `prompts.ts`) nomme les 5 plus grosses instances avec une direction d'entrée dérivée de la boîte, fusionne les labels identiques, conserve verbatim la clause anti-morphing ; sans instances, fallback strict sur le prompt actuel — zéro régression.
- **Déploiement (4.5)** : deux environnements — `dev` local et instance démo auto-hébergée (`next start` ou Docker) sur réseau privé — ne différant que par `FAL_KEY` ; pas de CI en v1 (lint, typecheck, Vitest en local avant push).

## UX & Interaction Patterns

- **Lecteur de la Révélation** : autoplay au premier affichage + lueur or autour du cadre, stepper 4/4 coché ; lecture/pause/relecture, `Espace` bascule lecture/pause ; pas de confetti ni toast — la vidéo est la célébration. Durée et preset jamais exposés.
- **Trois actions sous le lecteur, ordre canonique** : « Nouvelle Génération » (ghost) → « Revoir » (outline) → « Télécharger le MP4 » (bouton or, action primaire unique de la surface).
- **Panneau d'attente (variante longue)** : phases nommées « Envoi de vos images » → « Génération de la Révélation » → « Finalisation », temps écoulé affiché, durée « 1 à 3 minutes » annoncée ; à 3 min 30 s, message « plus long que prévu » (pur affichage, aucun effet sur le job). Jamais de spinner muet ni de faux pourcentage ; la barre ne recule jamais.
- **Erreur vidéo** : bandeau « La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. » avec une seule action (relancer l'étape) ; jamais de retour forcé au début du Parcours.
- **Cycle de vie** : confirmation avant « Nouvelle Génération » si la Révélation n'est pas téléchargée ; `beforeunload` avertit « Votre Génération en cours sera perdue. » ; après rechargement, retour à l'Accueil sans reprise (v1) ; pied de page confidentialité (suppression automatique après 24 h).
- **Microcopies** : 100 % français, vocabulaire du glossaire (Révélation, Génération, Pièce vide…), jamais de jargon technique (« FLF », « timeout ») ; alternative textuelle « Vidéo de révélation de votre pièce » ; annonces `aria-live` (polite fin d'attente, assertive erreurs).

## Cross-Story Dependencies

- 4.1 dépend des artefacts des Epics 1–3 : Pièce vide (`generation.emptyRoom`, Epic 3), Photo originale canonique et infrastructure d'attente/erreur (Epic 1).
- 4.2, 4.3, 4.4 dépendent de 4.1 (`generation.reveal`).
- 4.4 valide FR-15 (invalidation/retour) de bout en bout, maintenant que le Parcours à 4 étapes est complet.
- 4.5 exige le pipeline complet fonctionnel (4.1–4.4) pour mesurer coût et temps.
- 4.6 dépend du backend de détection local de l'Epic 2 (service Grounded-SAM, `DETECT_BACKEND === "local"`) et modifie le prompt consommé par l'adaptateur de 4.1 ; l'approche B (contrôle de mouvement par masques/trajectoires) est différée (`epics-deferred-improvements.md` §5).
