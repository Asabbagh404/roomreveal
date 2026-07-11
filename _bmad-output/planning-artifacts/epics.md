---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics"]
inputDocuments:
  - prds/prd-flux_test-2026-07-10/prd.md
  - prds/prd-flux_test-2026-07-10/addendum.md
  - architecture/architecture-flux_test-2026-07-10/ARCHITECTURE-SPINE.md
  - ux-designs/ux-flux_test-2026-07-10/EXPERIENCE.md
  - ux-designs/ux-flux_test-2026-07-10/DESIGN.md
---

# RoomReveal - Epic Breakdown

## Overview

Ce document fournit la découpe complète en epics et stories de RoomReveal, en décomposant les exigences du PRD, de la spécification UX (DESIGN.md + EXPERIENCE.md) et de l'architecture (ARCHITECTURE-SPINE.md) en stories implémentables.

## Requirements Inventory

### Functional Requirements

**Upload et préparation**
- **FR-1** : L'utilisateur peut uploader une photo JPEG ou PNG d'une pièce meublée ; tout autre format est refusé avec un message explicite.
- **FR-2** : Le système redimensionne automatiquement et silencieusement la Photo originale (côté long ≤ 1024 px, ratio préservé).
- **FR-3** : Le système refuse proprement une image trop volumineuse (> 20 Mo) ou corrompue, sans jamais bloquer le Parcours dans un état sans issue.

**Détection et édition du Masque**
- **FR-4** : Le système détecte automatiquement les meubles par catégorie et en dérive le Masque initial.
- **FR-5** : Le Masque est affiché en overlay semi-transparent contrasté (~45–50 % d'opacité) sur la Photo originale.
- **FR-6** : L'utilisateur peut éditer le Masque au pinceau (ajouter) et à la gomme (retirer), avec une taille d'outil réglable et effet immédiat.
- **FR-7** : Le Masque tel que validé par l'utilisateur est transmis verbatim à l'Inpainting — aucune re-détection ni altération. *(critère de succès explicite du brief)*

**Pièce vide (Inpainting)**
- **FR-8** : Le système génère la Pièce vide en effaçant les zones du Masque ; les zones hors Masque restent visuellement identiques à la Photo originale.
- **FR-9** : L'utilisateur peut régénérer l'Inpainting (illimité en v1) avec le même Masque validé, sans refaire les étapes précédentes.

**Génération de la Révélation (vidéo)**
- **FR-10** : Le système génère une Révélation d'environ 5 s à ≥ 24 fps par Génération FLF (première frame = Pièce vide, dernière frame = Photo originale) ; durée et preset uniques (« mix côtés + plafond »).
- **FR-11** : L'utilisateur peut prévisualiser la Révélation (lecture/pause/relecture) dans l'application.
- **FR-12** : L'utilisateur peut télécharger la Révélation au format MP4, lisible dans les lecteurs standards.

**Parcours et feedback**
- **FR-13** : L'utilisateur voit en permanence sa position dans le Parcours (Upload → Masque → Pièce vide → Vidéo) et les étapes restantes.
- **FR-14** : Chaque opération longue affiche un état de chargement annonçant la durée attendue ; la Génération FLF annonce explicitement 1 à 3 minutes (aucune opération > 2 s sans indicateur).
- **FR-15** : L'utilisateur peut revenir à une étape précédente pour corriger sans perdre la Photo originale ni recommencer l'upload ; retour limité à la Génération en cours.

**Robustesse**
- **FR-16** : Quand aucun meuble n'est détecté, le système l'annonce clairement et propose de créer le Masque entièrement au pinceau (fallback manuel).
- **FR-17** : Tout échec ou timeout d'appel IA (Détection, Inpainting, Génération FLF) produit un message compréhensible et une relance limitée à l'étape concernée, sans trace technique brute.

### NonFunctional Requirements

- **NFR-1** — **Temps de bout en bout** : une Génération complète sur photo standard prend moins de 4 minutes (Génération FLF 1–3 min comprise).
- **NFR-2** — **Coût unitaire** : le coût par Génération est mesuré et documenté dans le README (cible 0,30–1,25 $ ; COGS estimé ≈ 0,62 $).
- **NFR-3** — **Utilisabilité** : un utilisateur non technique complète le Parcours sans aide externe ni documentation.
- **NFR-4** — **Confidentialité** : photos et artefacts non stockés durablement ; purge automatique après 24 h.
- **NFR-5** — **Plateforme** : web app, navigateurs desktop récents (Chrome, Firefox, Safari).
- **NFR-6** — **Langue** : interface intégralement en français, pas d'i18n.

### Additional Requirements

*(Extraites de ARCHITECTURE-SPINE.md — exigences techniques qui structurent la découpe. Le nommage code suit le mapping glossaire fixe : `originalPhoto`, `mask`, `emptyRoom`, `reveal`, `generation`, `step`.)*

- **AR-STARTER — Template de démarrage** : le projet part de `create-next-app` (**Next.js 16.2.x**, App Router, React 19.2.x, Tailwind CSS 4.3.x, shadcn/ui via `shadcn@latest`). ⚠️ **Impacte Epic 1, Story 1** (initialisation greenfield).
- **AR-LAYERS — Découpe en couches** : `src/components/` (surfaces UI, sans état pipeline) → `src/state/` (reducer + effets + types domaine) → `src/pipeline/` (adaptateurs + config + prompts) → `src/app/api/fal/proxy/` ; `src/lib/` = couche feuille pure. Sens de dépendance strict, jamais de saut de couche (AD-1 diagramme).
- **AR-PROXY (AD-4)** : proxy `@fal-ai/server-proxy` sur `/api/fal/proxy` ; `FAL_KEY` uniquement côté serveur ; allowlist des endpoints du registre `pipeline/config.ts` ; tout appel API fal (modèles, queue, upload storage) passe par le proxy ; GET publics du storage fal autorisés en direct.
- **AR-PIPELINE (AD-5)** : `src/pipeline/` seul importeur de `@fal-ai/client` ; expose `uploadArtifact(blob)→URL` + 3 adaptateurs `detect(photoUrl)`, `inpaint(photoUrl, maskUrl)`, `video(emptyRoomUrl, photoUrl)` ; `detect` retourne `{ initialMask: PNG|null, categories: string[] }` (`initialMask === null` = cas FR-16 ; `categories` jamais exposé en UI). IDs de modèles référencés par rôle dans un module de config unique.
- **AR-PROMPTS (AD-6)** : tous les prompts modèles centralisés dans `src/pipeline/prompts.ts` (liste meubles, prompt pièce-vide, prompt de mouvement).
- **AR-PIXELS (AD-2)** : un seul redimensionnement client à l'upload (côté long ≤ 1024 px, ratio préservé, `image/jpeg` q≈0,92), jamais ré-encodé ensuite = photo canonique. Masque, Pièce vide et frames FLF partagent exactement les dimensions canoniques ; la Révélation conserve le ratio d'entrée (jamais de crop 16:9 forcé). Sortie ≤ 1080p, framerate natif du modèle.
- **AR-STATE (AD-3)** : la Génération est un objet unique tenu par un reducer React ; serveur sans état (ni DB, ni session, ni fichier) ; perte au rafraîchissement assumée. Forme : `generation = { step, epoch, originalPhoto, maskDraft, mask?, emptyRoom?, reveal?, waitPhase?, error? }`.
- **AR-MASK-VERBATIM (AD-7)** : masque validé transmis sans altération (ni dilation, ni blur, ni morphologie) ; binaire (0/255, sans anti-aliasing) ; buffer en résolution canonique 1:1 ; PNG, blanc = zone à effacer.
- **AR-ERRORS (AD-8)** : taxonomie unique `StepError { step, retryable, userMessage }` ; `step ∈ 'detect'|'inpaint'|'video'` ; timeouts détectés par l'adaptateur (detect/inpaint 60 s, video 6 min, à calibrer) ; l'UI ne voit jamais d'erreur fal native ; « aucun meuble détecté » n'est pas une erreur.
- **AR-EPHEMERAL (AD-9)** : tous les artefacts vivent sur le storage fal ; header `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": 86400}` sur chaque requête (uploads + générations) ; MP4 téléchargé depuis l'URL fal (fetch client → Blob → objectURL), jamais re-hébergé.
- **AR-QUEUE (AD-10)** : jobs longs via `fal.subscribe` (queue + polling) depuis le navigateur via le proxy ; pas de webhook ni orchestration serveur ; les statuts queue alimentent les phases nommées du Panneau d'attente.
- **AR-INVALIDATION (AD-11)** : sémantique de retour/invalidation définie dans le reducer seul ; retour arrière conserve les artefacts, avancer à nouveau invalide l'aval (après confirmation) ; « Régénérer » remplace la Pièce vide et détruit toute Révélation ; échec d'étape ne détruit jamais l'amont.
- **AR-ASYNC (AD-12)** : adaptateurs asynchrones passifs `(inputs, { signal, onPhase }) → Promise` ; orchestration dans une seule couche effectrice `src/state/effects.ts` (un `AbortController` par étape + jeton d'époque) ; résultat périmé jeté sans dispatch ; reducer pur.
- **AR-MASK-DUAL (AD-13)** : Masque à deux formes — brouillon binaire canonique dans `generation.maskDraft` (survit au démontage ; canvas = vue ; undo UI local perdu à la navigation) et artefact validé PNG uploadé via `uploadArtifact` (URL dans `generation.mask`) ; retour arrière ré-affiche le brouillon depuis le reducer.
- **AR-WAITPHASE (AD-14)** : enum unique `WaitPhase` (`uploading | queued | generating | finalizing`) dans les types domaine ; émis par les adaptateurs via `onPhase` ; traduction en microcopie française par le Panneau d'attente seul ; monotonie par tentative imposée par le reducer.
- **AR-CONFIG** : paramètres modèles uniquement dans `src/pipeline/config.ts` ; toute variable d'environnement lue une seule fois côté serveur.
- **AR-TESTS** : Vitest ; reducer testé pur (aucun mock) ; adaptateurs mockés à la frontière `(inputs, {signal, onPhase})` ; jamais de mock de `@fal-ai/client` hors de `pipeline/` ; primitives canvas/encodage de `lib/` vérifiées sur Chrome/Firefox/Safari.
- **AR-README-COGS (NFR-2)** : mesurer et documenter le coût unitaire par Génération dans le README (livrable de process sans FR porteur, valide SM-5).
- **AR-DEPLOY** : environnements `dev` local (`next dev`) + instance démo auto-hébergée (`next start` / Docker) **sur réseau privé** ; même artefact, seule `FAL_KEY` diffère ; pas de CI en v1 (lint/typecheck/tests locaux avant push).
- **AR-MODELS** : détection+segmentation `fal-ai/sam-3/image` ; inpainting `fal-ai/flux-pro/v1/fill` (repli `flux-2/klein/4b/base/edit`) ; vidéo FLF `fal-ai/kling-video/o1/image-to-video` (replis `wan/v2.7` end_image obligatoire, `wan-flf2v`) — tout repli doit satisfaire AD-1 (FLF strict) et AD-2 (ratio préservé).

### UX Design Requirements

*(Extraites de DESIGN.md + EXPERIENCE.md. Chaque UX-DR est actionnable et testable ; DESIGN.md et EXPERIENCE.md font foi.)*

**Fondations visuelles & design tokens**
- **UX-DR1** : Implémenter le socle shadcn/ui en **mode dark unique** (pas de mode clair, pas d'i18n) sur React + Tailwind.
- **UX-DR2** : Implémenter la palette de tokens couleur cinématique (`fond-projection #0B0D12`, `surface-carte`, `surface-elevee`, `texte-principal/secondaire`, `bordure`, `or-lumineux #F2C14E`, `masque-overlay #FF2E9E`, `masque-contour`, `succes`, `erreur`) ; `or-lumineux` réservé aux actes de Génération, `masque-overlay` fuchsia à 45 % + contour plein.
- **UX-DR3** : Implémenter les 3 rôles typographiques ajoutés à la ramp Geist Sans (`display` 30/600, `carton-titre` petites capitales trackées 0.12em, `attente` 16px), le token `rounded.lg` (12px) pour tous les cadres média, et le token `spacing.scene-gap` (48px).
- **UX-DR4** : Implémenter le layout desktop — colonne centrée `max-w-5xl`, stepper en bandeau fixe en haut, action principale sous la scène alignée à droite ; profondeur par ton (pas d'ombres) + lueur or douce sur la scène active uniquement à la Révélation.

**Composants de marque** *(spec visuelle DESIGN.md, comportement EXPERIENCE.md)*
- **UX-DR5 — Stepper du Parcours** : bandeau 4 étapes, étape active or, accomplies cochées et cliquables (retour sans perte), futures inertes ; combine coche + position + label (jamais la couleur seule).
- **UX-DR6 — Zone d'upload** : carte drag-and-drop + clic-parcourir, bordure pointillée passant à l'or au survol, validation client immédiate, rejet affiché dans la zone même.
- **UX-DR7 — Canvas du Masque** : Photo originale plein cadre + overlay fuchsia 45 % + contour, curseur cercle à la taille de l'outil, zoom molette (100–400 %) + pan (espace+drag), aucune étiquette de catégorie.
- **UX-DR8 — Barre d'outils du Masque** : pinceau/gomme mutuellement exclusifs, Slider de taille (4–128 px), annuler/rétablir (historique 20 actions), raccourcis clavier `B`/`E`/`[`/`]`/`Ctrl+Z`/`Ctrl+Shift+Z`.
- **UX-DR9 — Cartes de comparaison** : « Photo originale » / « Pièce vide » côte à côte, même taille, jamais l'une sans l'autre ; clic → plein écran (Dialog).
- **UX-DR10 — Lecteur de la Révélation** : autoplay au premier affichage + lueur or, lecture/pause/relecture (Espace), 3 actions ordonnées « Nouvelle Génération » (ghost) / « Revoir » (outline) / « Télécharger le MP4 » (or) ; durée et preset non exposés.
- **UX-DR11 — Panneau d'attente** : carte centrée, barre or par phases nommées (« Envoi de vos images » → « Génération de la Révélation » → « Finalisation »), temps écoulé affiché, durée « 1 à 3 minutes » annoncée avant et pendant, message « plus long que prévu » à 3 min 30 s ; jamais de spinner muet ni faux pourcentage.
- **UX-DR12 — Bandeau d'erreur** : carte avec filet gauche `erreur` 3px, message français compréhensible + une seule action (relancer l'étape) ; variante neutre pour « aucun meuble détecté » ; artefacts acquis restant visibles.
- **UX-DR13 — Bouton de Génération** : bouton primaire or unique par surface (« Valider le Masque », « Créer ma vidéo », « Télécharger le MP4 »), désactivé tant que la précondition n'est pas remplie (tooltip).

**Voix, états et parcours**
- **UX-DR14 — Microcopies & ton** : toutes les microcopies en français, vocabulaire du glossaire PRD obligatoire, jamais de jargon technique (« inpainting », « segmentation », « FLF », « timeout »), vouvoiement sobre, pas d'emojis.
- **UX-DR15 — States patterns** : implémenter tous les états spécifiés — vide/première visite (promesse d'une ligne), chargement court (< 2 s), moyen (2–30 s), long (1–3 min), erreur d'upload, aucun meuble détecté, succès, rafraîchissement (`beforeunload` + retour Accueil).
- **UX-DR16 — Cycle de vie de la Génération** : « Nouvelle Génération » avec confirmation si Révélation non téléchargée ; ligne de pied de page confidentialité (« Vos photos sont supprimées automatiquement après 24 heures »).
- **UX-DR17 — Écran trop petit** : sous ~1024 px de large, message plein écran « RoomReveal est conçu pour un écran d'ordinateur », sans tentative d'adaptation.
- **UX-DR18 — Plancher d'accessibilité** : focus visible partout (ring shadcn), Parcours entièrement traversable au clavier, alternatives textuelles (photo, pièce vide, révélation, boutons-icônes), jamais la couleur seule, annonces `aria-live` (polite pour étapes/fin d'attente, assertive pour erreurs).

### FR Coverage Map

| FR | Epic | Note |
|---|---|---|
| FR-1, FR-2, FR-3 | Epic 1 | Upload, resize canonique, rejet propre |
| FR-13 | Epic 1 | Stepper du Parcours |
| FR-14 | Epic 1 | Infra Panneau d'attente (variante longue 1–3 min en Epic 4) |
| FR-15 | Epic 1 | Sémantique d'invalidation/retour (reducer AD-11) ; vécue à travers Epics 2–4 |
| FR-17 | Epic 1 | Taxonomie `StepError` + Bandeau d'erreur (appliqués par étape ensuite) |
| FR-4, FR-5, FR-6, FR-7 | Epic 2 | Détection, overlay, édition, masque verbatim |
| FR-16 | Epic 2 | Fallback « aucun meuble » |
| FR-8, FR-9 | Epic 3 | Pièce vide, régénération |
| FR-10, FR-11, FR-12 | Epic 4 | Vidéo FLF, prévisualisation, téléchargement MP4 |

**NFR :** NFR-1 (Epic 4, temps bout-en-bout) · NFR-2 (Epic 4, README COGS) · NFR-3 (transverse, EXPERIENCE.md) · NFR-4 (Epic 1, purge fal 24 h) · NFR-5 (Epic 1, socle navigateurs) · NFR-6 (transverse, microcopies FR).

## Epic List

### Epic 1 : Socle du Parcours & Upload
Le « squelette qui marche » : à la fin, un utilisateur ouvre l'app, est prévenu si l'écran est trop petit, dépose une photo qui est normalisée (resize canonique ≤ 1024 px) et affichée dans le cadre wizard avec le stepper 1/4. Toute l'infrastructure transverse est en place : machine à états (reducer + effects), proxy fal, Panneau d'attente, Bandeau d'erreur, sémantique d'invalidation.
**FRs covered:** FR-1, FR-2, FR-3, FR-13, FR-14, FR-15, FR-17

### Epic 2 : Détection & édition du Masque
L'utilisateur voit le Masque détecté en overlay sur sa photo, le corrige au pinceau/gomme (taille réglable, zoom/pan, undo/redo, raccourcis) et le valide ; le fallback « aucun meuble détecté » garde le Parcours praticable. Valide le risque de qualité de détection.
**FRs covered:** FR-4, FR-5, FR-6, FR-7, FR-16

### Epic 3 : Pièce vide (Inpainting) & régénération
L'utilisateur obtient la Pièce vide (effacement des zones du Masque validé), la compare côte à côte avec la Photo originale, et régénère librement jusqu'à satisfaction. Valide le risque de qualité du déclutter (SM-2).
**FRs covered:** FR-8, FR-9

### Epic 4 : Révélation vidéo & clôture
Le climax : Génération FLF (première frame = Pièce vide, dernière frame = Photo originale), autoplay avec lueur or, prévisualisation, téléchargement MP4, « Nouvelle Génération ». Clôt le coût unitaire documenté (README COGS) et le déploiement démo. Valide SM-1.
**FRs covered:** FR-10, FR-11, FR-12

## Epic 1: Socle du Parcours & Upload

Le « squelette qui marche ». À la fin de cet epic, un utilisateur ouvre RoomReveal sur desktop, est prévenu si son écran est trop petit, dépose une photo qui est validée et normalisée dans l'espace pixel canonique, et voit sa position dans le Parcours via le stepper. Toute l'infrastructure transverse (machine à états, stepper, Panneau d'attente, Bandeau d'erreur, sémantique d'invalidation) est en place et branchée sur le reducer, prête à accueillir les étapes aval.

### Story 1.1: Socle applicatif & identité visuelle RoomReveal

As a développeur de RoomReveal,
I want un projet Next.js initialisé avec le socle de design et la structure en couches,
So that toutes les stories suivantes se construisent sur une base cohérente, brandée et testable.

**Acceptance Criteria:**

**Given** un poste de développement vierge
**When** le projet est initialisé via `create-next-app`
**Then** l'application démarre avec Next.js 16.2.x (App Router), React 19.2.x, Tailwind CSS 4.3.x et shadcn/ui en **mode dark unique**
**And** l'arborescence respecte les couches AR-LAYERS : `src/components/`, `src/state/`, `src/pipeline/`, `src/app/api/fal/proxy/`, `src/lib/`

**Given** l'application démarrée
**When** une page est rendue
**Then** les tokens de design sont appliqués : palette (`fond-projection #0B0D12`, `surface-carte`, `surface-elevee`, `texte-principal/secondaire`, `bordure`, `or-lumineux #F2C14E`, `masque-overlay #FF2E9E`, `masque-contour`, `succes`, `erreur`), rôles typographiques (`display`, `carton-titre`, `attente` sur Geist Sans), `rounded.lg` 12px et `spacing.scene-gap` 48px (UX-DR1, UX-DR2, UX-DR3)
**And** le layout desktop est une colonne centrée `max-w-5xl`, emplacement de stepper en haut, action principale sous la scène (UX-DR4)

**Given** l'application ouverte
**When** la largeur de la fenêtre est inférieure à ~1024 px
**Then** un message plein écran « RoomReveal est conçu pour un écran d'ordinateur » s'affiche sans tentative d'adaptation (UX-DR17)

**Given** l'application ouverte sur desktop
**When** l'utilisateur regarde le pied de page
**Then** une ligne discrète indique « Vos photos sont supprimées automatiquement après 24 heures » (UX-DR16, NFR-4)

**Given** le dépôt de code
**When** on lance la suite de tests
**Then** Vitest est configuré et exécute au moins un test de fumée qui passe (AR-TESTS)
**And** toute variable d'environnement (dont `FAL_KEY`) est lue une seule fois côté serveur (AR-CONFIG)

### Story 1.2: Machine à états & Stepper du Parcours

As a utilisateur,
I want voir en permanence où j'en suis dans le Parcours et pouvoir revenir à une étape précédente sans rien perdre,
So that je me repère et corrige sans jamais recommencer depuis le début.

**Acceptance Criteria:**

**Given** le reducer de la Génération
**When** il est testé unitairement (pur, sans mock)
**Then** il expose la forme canonique `generation = { step, epoch, originalPhoto, maskDraft, mask?, emptyRoom?, reveal?, waitPhase?, error? }` (AR-STATE)
**And** les types du domaine `WaitPhase` (`uploading | queued | generating | finalizing`) et `StepError { step, retryable, userMessage }` (`step ∈ 'detect'|'inpaint'|'video'`) sont définis dans `src/state/` (AR-WAITPHASE, AR-ERRORS)

**Given** une Génération avec des artefacts amont produits
**When** l'utilisateur revient à une étape antérieure via le stepper
**Then** tous les artefacts existants (Photo originale, Masque, Pièce vide) sont conservés (FR-15, AD-11)
**And** aucune donnée n'est perdue

**Given** l'utilisateur revenu à une étape antérieure
**When** il avance à nouveau depuis cette étape
**Then** une confirmation (`Dialog` shadcn) est demandée, puis les artefacts en aval sont invalidés et le jeton d'époque (`epoch`) est incrémenté (AD-11, AD-12)

**Given** le Parcours à 4 étapes (Upload → Masque → Pièce vide → Vidéo)
**When** le Stepper est affiché
**Then** l'étape courante (fond or) et les étapes accomplies (coche + label, cliquables) sont identifiables d'un coup d'œil, les étapes futures sont inertes (FR-13, UX-DR5)
**And** l'état n'est jamais signalé par la couleur seule (coche + position + label combinés) (UX-DR18)

### Story 1.3: Étape Upload — dépôt, validation & normalisation

As a utilisateur non technique,
I want déposer la photo de ma pièce meublée et la voir acceptée ou clairement refusée,
So that j'entre dans le Parcours sans friction ni jargon.

**Acceptance Criteria:**

**Given** l'étape Upload affichée
**When** l'utilisateur glisse-dépose ou parcourt un fichier
**Then** un JPEG ou PNG valide est accepté et affiché ; tout autre format est refusé avec « Ce format n'est pas pris en charge. Utilisez une photo JPEG ou PNG. » dans la zone même (FR-1, UX-DR6, UX-DR14)

**Given** un fichier déposé
**When** sa taille dépasse 20 Mo ou qu'il est corrompu
**Then** un message clair s'affiche dans la zone d'upload et l'utilisateur peut réessayer immédiatement, sans état sans issue (FR-3, UX-DR15)

**Given** une photo valide (ex. 4000×3000)
**When** elle est acceptée
**Then** elle est redimensionnée silencieusement (côté long ≤ 1024 px, ratio préservé), encodée une seule fois en `image/jpeg` qualité ≈ 0,92, et conservée comme Blob dans `generation.originalPhoto` (FR-2, AR-PIXELS)
**And** le redimensionnement n'est jamais mentionné à l'utilisateur

**Given** une photo acceptée et normalisée
**When** la normalisation se termine
**Then** le Parcours avance automatiquement vers l'étape Masque et le stepper passe à 2/4

**Given** la primitive de resize de `src/lib/`
**When** elle est testée
**Then** elle produit des dimensions et un ratio corrects et est vérifiée sur Chrome, Firefox et Safari (AR-TESTS, NFR-5)

### Story 1.4: Infrastructure transverse d'attente & d'erreur

As a développeur de RoomReveal,
I want des composants transverses de Panneau d'attente et de Bandeau d'erreur branchés sur le reducer,
So that chaque étape aval hérite d'une attente honnête et d'une gestion d'erreur uniforme sans les réimplémenter.

**Acceptance Criteria:**

**Given** une opération en cours exposant un `WaitPhase` dans l'état
**When** le Panneau d'attente est rendu
**Then** il affiche une barre de progression or **par phases nommées** (traduction française du `WaitPhase` : « Envoi de vos images » → « Génération de la Révélation » → « Finalisation ») et le temps écoulé, jamais un spinner muet ni un faux pourcentage (FR-14, UX-DR11, AR-WAITPHASE)
**And** la barre ne recule jamais (monotonie par tentative imposée par le reducer)

**Given** une attente longue en cours depuis plus de 3 min 30 s
**When** le Panneau d'attente est affiché
**Then** il ajoute « C'est plus long que prévu — encore quelques instants » (UX-DR11)

**Given** un `StepError { step, retryable, userMessage }` présent dans l'état
**When** le Bandeau d'erreur est rendu
**Then** il affiche `userMessage` en français + **une seule action** : relancer l'étape concernée, sans jamais montrer de trace technique (FR-17, UX-DR12, AR-ERRORS)
**And** les artefacts déjà acquis restent visibles derrière le bandeau

**Given** un résultat « aucun meuble détecté »
**When** il est présenté
**Then** le Bandeau utilise une variante neutre (accent `texte-secondaire`) et n'est pas traité comme une erreur (UX-DR12, préparation FR-16)

**Given** les changements d'étape, fins d'attente et erreurs
**When** ils surviennent
**Then** ils sont annoncés via `aria-live` (`polite` pour étapes/fin d'attente, `assertive` pour erreurs) (UX-DR18)
**And** le Bouton de Génération suit le patron canonique : primaire or unique par surface, désactivé tant que la précondition n'est pas remplie avec tooltip (UX-DR13)

## Epic 2: Détection & édition du Masque

À la fin de cet epic, l'utilisateur voit ses meubles automatiquement détectés et surlignés en overlay fuchsia sur sa photo, corrige le Masque au pinceau et à la gomme avec précision, puis le valide — et ce Masque validé part verbatim vers l'étape suivante. Quand aucun meuble n'est détecté, le Parcours reste praticable via un fallback manuel. C'est l'epic qui valide le risque de qualité de détection et pose le contrat SM-2.

### Story 2.1: Frontière pipeline & détection automatique du Masque

As a utilisateur,
I want que mes meubles soient automatiquement repérés et surlignés dès l'entrée dans l'étape Masque,
So that je pars d'un Masque déjà utile plutôt que d'une toile vierge.

**Acceptance Criteria:**

**Given** le proxy fal et le module pipeline
**When** ils sont mis en place
**Then** `/api/fal/proxy` (`@fal-ai/server-proxy`) garde `FAL_KEY` côté serveur et n'autorise que les endpoints du registre `pipeline/config.ts` (allowlist), et pose le header `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": 86400}` sur chaque requête (AR-PROXY, AR-EPHEMERAL)
**And** `src/pipeline/` est le seul importeur de `@fal-ai/client` et expose `uploadArtifact(blob) → URL fal` (AR-PIPELINE)
**And** la liste des meubles et le modèle `fal-ai/sam-3/image` vivent respectivement dans `src/pipeline/prompts.ts` et `src/pipeline/config.ts` (AR-PROMPTS, AR-CONFIG, AR-MODELS)

**Given** une Photo originale canonique conservée dans l'état
**When** l'étape Masque est atteinte
**Then** la couche effectrice `state/effects.ts` uploade la photo via `uploadArtifact` (une seule fois, mémoïsée) puis appelle l'adaptateur `detect(photoUrl)` avec un `AbortSignal` et estampille l'appel du jeton d'époque courant (AR-PIPELINE, AR-ASYNC)
**And** `detect` retourne `{ initialMask: PNG binaire | null, categories: string[] }` aux dimensions canoniques, la composition des segments SAM (union, seuil, mise aux dimensions) étant faite dans `detect`, jamais en UI (AR-PIPELINE)

**Given** une photo de salon meublé standard
**When** la détection réussit
**Then** les meubles principaux sont couverts par le Masque initial (FR-4), affiché en overlay fuchsia 45 % + contour sur la Photo originale (FR-5, UX-DR7)
**And** les catégories détectées ne sont exposées nulle part dans l'UI (décision canonique)

**Given** un appel de détection
**When** il échoue ou dépasse son délai (60 s)
**Then** l'adaptateur produit un `StepError { step: 'detect', retryable: true }` converti en Bandeau d'erreur, dont la relance = re-détection depuis la photo canonique conservée (FR-17, AR-ERRORS)

### Story 2.2: Édition manuelle du Masque au pinceau et à la gomme

As a utilisateur,
I want ajouter ou retirer des zones du Masque au pinceau et à la gomme, avec zoom pour les détails,
So that je corrige un meuble oublié ou une zone en trop exactement où il faut.

**Acceptance Criteria:**

**Given** l'étape Masque avec un Masque affiché
**When** l'utilisateur peint avec le pinceau ou efface avec la gomme
**Then** la zone est ajoutée/retirée du Masque avec un effet immédiat au trait (FR-6)
**And** le curseur est un cercle à la taille de l'outil (UX-DR7)

**Given** la barre d'outils du Masque
**When** l'utilisateur l'utilise
**Then** pinceau et gomme sont mutuellement exclusifs, la taille est réglable au Slider (4–128 px), et annuler/rétablir couvre les 20 dernières actions (UX-DR8)
**And** les raccourcis `B` (pinceau), `E` (gomme), `[` / `]` (taille), `Ctrl+Z` / `Ctrl+Shift+Z` (annuler/rétablir) fonctionnent sur l'étape Masque (UX-DR8)

**Given** le buffer d'édition du Masque
**When** l'utilisateur peint, zoome (molette 100–400 %) ou pan (barre espace + drag)
**Then** le buffer vit en résolution canonique 1:1 ; zoom et devicePixelRatio sont des transformations d'affichage, jamais de rééchantillonnage du buffer (AR-MASK-VERBATIM, UX-DR7)
**And** le Masque est binaire : chaque pixel vaut 0 ou 255, sans anti-aliasing (AR-MASK-VERBATIM)

**Given** le brouillon du Masque en cours d'édition
**When** les composants sont démontés/remontés (ex. navigation stepper)
**Then** le brouillon survit dans `generation.maskDraft` (le canvas n'est qu'une vue), seule la pile d'undo UI locale est perdue (AR-MASK-DUAL)

### Story 2.3: Validation du Masque — contrat verbatim vers l'Inpainting

As a utilisateur,
I want valider mon Masque et être certain qu'il sera respecté tel quel,
So that les zones que j'ai choisies — et seulement celles-là — disparaîtront.

**Acceptance Criteria:**

**Given** un Masque brouillon comportant au moins une zone peinte
**When** l'utilisateur clique « Valider le Masque »
**Then** le brouillon est encodé en PNG binaire (blanc = zone à effacer, dimensions strictement canoniques, sans anti-aliasing), uploadé via `uploadArtifact`, et son URL stockée dans `generation.mask` (FR-7, AR-MASK-DUAL, AR-MASK-VERBATIM)
**And** le Parcours avance vers l'étape Pièce vide

**Given** un Masque validé
**When** il est transmis à l'aval
**Then** il part sans aucune altération — ni dilation, ni blur, ni morphologie, ni re-détection (FR-7, AR-MASK-VERBATIM)
**And** une zone retirée à la gomme n'est jamais effacée par l'aval, une zone ajoutée au pinceau l'est toujours (FR-7, SM-2)

**Given** un Masque entièrement vide
**When** l'utilisateur regarde le bouton de validation
**Then** « Valider le Masque » est désactivé avec le tooltip « Peignez au moins une zone » (UX-DR13)

### Story 2.4: Fallback « aucun meuble détecté »

As a utilisateur dont la photo ne contient aucun meuble reconnu,
I want être informé et pouvoir peindre moi-même les zones à effacer,
So that le Parcours reste praticable au lieu de me bloquer.

**Acceptance Criteria:**

**Given** une détection qui retourne `initialMask === null`
**When** l'étape Masque s'affiche
**Then** un bandeau neutre annonce « Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. » (FR-16, UX-DR12)
**And** ce cas n'est jamais traité comme une erreur (AR-ERRORS)

**Given** le cas « aucun meuble détecté »
**When** l'étape Masque s'ouvre
**Then** le mode pinceau est pré-activé sur un Masque vierge et le Parcours reste praticable jusqu'au bout (FR-16, Flow 2)

**Given** un Masque vierge non peint dans le cas fallback
**When** l'utilisateur n'a rien peint
**Then** « Valider le Masque » reste désactivé et l'utilisateur peut revenir à l'étape Upload pour changer de photo — jamais d'état sans issue (FR-16, Flow 2)

## Epic 3: Pièce vide (Inpainting) & régénération

À la fin de cet epic, l'utilisateur obtient la Pièce vide générée à partir de son Masque validé, la compare côte à côte avec sa Photo originale pour juger qu'aucun meuble ne subsiste, et régénère librement jusqu'à satisfaction. C'est l'epic qui valide le risque de qualité du déclutter (SM-2) et prépare la première frame de la Génération FLF.

### Story 3.1: Génération de la Pièce vide

As a utilisateur,
I want que les meubles surlignés dans mon Masque disparaissent pour révéler la pièce nue,
So that j'obtienne la première frame de ma future Révélation.

**Acceptance Criteria:**

**Given** un Masque validé (URL dans `generation.mask`) et la Photo originale canonique
**When** l'étape Pièce vide est atteinte
**Then** la couche effectrice appelle l'adaptateur `inpaint(photoUrl, maskUrl)` via le proxy, avec `AbortSignal` et jeton d'époque, et le modèle `fal-ai/flux-pro/v1/fill` (repli `flux-2/klein/4b/base/edit`) est référencé par rôle dans `pipeline/config.ts` (FR-8, AR-PIPELINE, AR-MODELS, AR-ASYNC)
**And** l'artefact Pièce vide vit sur le storage fal avec la rétention 24 h et son URL est stockée dans `generation.emptyRoom` (AR-EPHEMERAL)

**Given** la génération de la Pièce vide en cours
**When** elle dure plus de 2 secondes
**Then** le Panneau d'attente affiche la phase nommée « Génération de la Pièce vide… » via `WaitPhase` (FR-14, AR-WAITPHASE)

**Given** une Pièce vide générée
**When** elle est produite
**Then** les zones du Masque sont remplacées par un rendu plausible (sol, murs) sans meuble résiduel visible, et les zones hors Masque sont visuellement identiques à la Photo originale (FR-8)

**Given** un appel d'inpainting
**When** il échoue ou dépasse son délai (60 s)
**Then** un `StepError { step: 'inpaint', retryable: true }` produit le Bandeau d'erreur, dont la relance conserve le Masque validé et la Photo originale (FR-17, AR-ERRORS)

### Story 3.2: Comparaison côte à côte Photo originale / Pièce vide

As a utilisateur,
I want voir ma photo d'origine et la Pièce vide côte à côte,
So that je juge d'un coup d'œil qu'aucun meuble ne subsiste avant de lancer la vidéo.

**Acceptance Criteria:**

**Given** une Pièce vide générée
**When** l'étape Pièce vide s'affiche
**Then** deux cartes de même taille « Photo originale » et « Pièce vide » sont présentées côte à côte, jamais l'une sans l'autre, légendes en `carton-titre` (FR-8, UX-DR9)

**Given** les cartes de comparaison
**When** l'utilisateur clique sur une carte
**Then** elle s'ouvre en plein écran (`Dialog`) pour inspection détaillée (UX-DR9)

**Given** l'étape Pièce vide jugée satisfaisante
**When** l'utilisateur regarde l'action principale
**Then** le Bouton de Génération « Créer ma vidéo » porte en sous-texte « 1 à 3 minutes de génération » (FR-14, UX-DR13)

### Story 3.3: Régénération de la Pièce vide

As a utilisateur exigeant,
I want relancer l'Inpainting sans refaire les étapes précédentes,
So that j'obtienne une Pièce vide propre quand la première ne me convient pas.

**Acceptance Criteria:**

**Given** une Pièce vide affichée
**When** l'utilisateur clique « Régénérer »
**Then** l'Inpainting est relancé avec le **même Masque validé**, sans repasser par les étapes précédentes, et le nouveau résultat remplace l'ancien sans historique de versions (FR-9, UX-DR)
**And** la microcopie « Un doute ? Régénérez : chaque Pièce vide est unique. » est présente (UX-DR14)

**Given** le nombre de régénérations
**When** l'utilisateur régénère
**Then** aucune limite n'est appliquée en v1 (FR-9)
**And** « Régénérer » est un bouton secondaire ; « Créer ma vidéo » reste la seule action d'or de la surface (UX-DR13)

**Given** une régénération de la Pièce vide
**When** elle produit un nouveau résultat
**Then** toute Révélation existante en aval est invalidée et le jeton d'époque incrémenté — une Révélation ne peut jamais coexister avec une Pièce vide qui n'est pas la sienne (FR-9, AR-INVALIDATION)

## Epic 4: Révélation vidéo & clôture

Le climax du produit. À la fin de cet epic, l'utilisateur lance la Génération FLF (première frame = Pièce vide, dernière frame = Photo originale intouchée), contemple sa Révélation en autoplay avec lueur or, la revoit, télécharge le MP4, et peut lancer une Nouvelle Génération. L'epic clôt aussi les livrables de process : coût unitaire documenté (README) et déploiement de l'instance démo. Il valide SM-1 et NFR-1.

### Story 4.1: Génération de la Révélation (Génération FLF)

As a utilisateur,
I want lancer la génération de ma vidéo où les meubles atterrissent exactement à leur place,
So that j'obtienne la Révélation cinématique qui fait tout l'intérêt du produit.

**Acceptance Criteria:**

**Given** une Pièce vide (`generation.emptyRoom`) et la Photo originale canonique
**When** l'utilisateur clique « Créer ma vidéo »
**Then** l'adaptateur `video(emptyRoomUrl, photoUrl)` est appelé via la queue fal (`fal.subscribe`) avec `AbortSignal` et jeton d'époque, en mode FLF strict : **première frame contrainte = Pièce vide, dernière frame contrainte = Photo originale** (FR-10, AD-1, AR-PIPELINE, AR-QUEUE, AR-ASYNC)
**And** le modèle `fal-ai/kling-video/o1/image-to-video` (replis `wan/v2.7` `end_image_url` rendu obligatoire, ou `wan-flf2v`) est référencé par rôle dans `pipeline/config.ts`, et tout repli satisfait AD-1 (FLF strict) et AD-2 (ratio d'entrée préservé) (AR-MODELS)
**And** le prompt de mouvement du preset « mix côtés + plafond » vit dans `pipeline/prompts.ts` (AR-PROMPTS)

**Given** une Révélation générée
**When** elle est produite
**Then** sa dernière frame est visuellement identique à la Photo originale, sa première frame identique à la Pièce vide, et les meubles apparaissent en mouvement (flottement) — jamais par fondu ni apparition instantanée (FR-10, AD-1)
**And** la vidéo dure ~5 s à ≥ 24 fps (framerate natif, sans transcodage), conserve le ratio de la photo canonique (jamais de crop 16:9 forcé), résolution ≤ 1080p (AR-PIXELS)

**Given** la Génération FLF en cours (1–3 min)
**When** l'utilisateur attend
**Then** le Panneau d'attente affiche les phases nommées (« Envoi de vos images » → « Génération de la Révélation » → « Finalisation »), le temps écoulé, et l'annonce « 1 à 3 minutes » ; à 3 min 30 s le message « plus long que prévu » s'ajoute (FR-14, UX-DR11)

**Given** un appel vidéo qui échoue ou dépasse son délai (~6 min)
**When** l'erreur survient
**Then** un `StepError { step: 'video', retryable: true }` produit le Bandeau d'erreur « La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. » ; la relance ne repart jamais du début du Parcours (FR-17, Flow 3, AR-ERRORS)

### Story 4.2: Lecteur & prévisualisation de la Révélation

As a utilisateur,
I want visionner ma Révélation dès qu'elle est prête,
So that je savoure l'effet « wow » et vérifie le résultat avant de le télécharger.

**Acceptance Criteria:**

**Given** une Révélation prête (`generation.reveal`)
**When** l'étape Vidéo s'affiche
**Then** la vidéo se lance automatiquement dans le Lecteur de la Révélation, avec la lueur or autour du cadre au premier lancement (FR-11, UX-DR10)
**And** le stepper affiche 4/4 coché

**Given** le Lecteur de la Révélation
**When** l'utilisateur interagit
**Then** lecture/pause et relecture sont disponibles, `Espace` bascule lecture/pause (FR-11, UX-DR10)
**And** la durée ~5 s et le preset ne sont ni exposés ni configurables dans l'UI (UX-DR10)

**Given** la Révélation prête
**When** le succès est affiché
**Then** aucun confetti ni toast — la vidéo est la célébration (lueur or uniquement) (UX-DR15)

### Story 4.3: Téléchargement du MP4

As a utilisateur,
I want télécharger ma Révélation en MP4,
So that je puisse la publier ou la montrer hors de l'application.

**Acceptance Criteria:**

**Given** une Révélation prête
**When** l'utilisateur clique « Télécharger le MP4 »
**Then** le fichier est récupéré depuis l'URL fal (fetch client → Blob → objectURL, jamais re-hébergé côté serveur) et téléchargé (FR-12, AR-EPHEMERAL)

**Given** le MP4 téléchargé
**When** il est ouvert
**Then** il se lit dans les lecteurs standards (VLC, QuickTime, lecteur natif OS) (FR-12)

### Story 4.4: Nouvelle Génération & clôture du cycle de vie

As a utilisateur,
I want relancer une nouvelle Génération quand j'ai fini,
So that j'enchaîne une deuxième photo sans confusion ni perte accidentelle.

**Acceptance Criteria:**

**Given** l'étape Vidéo
**When** l'utilisateur regarde sous le lecteur
**Then** trois actions apparaissent dans l'ordre canonique « Nouvelle Génération » (ghost) → « Revoir » (outline) → « Télécharger le MP4 » (or) (UX-DR10, UX-DR16)

**Given** une Révélation non téléchargée
**When** l'utilisateur clique « Nouvelle Génération »
**Then** une confirmation est demandée avant de repartir d'une Zone d'upload vierge (UX-DR16)

**Given** une Génération en cours
**When** l'utilisateur rafraîchit ou ferme l'onglet
**Then** `beforeunload` avertit « Votre Génération en cours sera perdue. » et, après rechargement, retour à l'Accueil sans reprise en v1 (UX-DR15)

**Given** le Parcours complet à 4 étapes désormais présent
**When** l'utilisateur revient en arrière via le stepper (ex. de Vidéo vers Masque)
**Then** les artefacts amont sont conservés et le retour reste limité à la Génération en cours, validant FR-15 de bout en bout (FR-15, Flow 4)

### Story 4.5: Coût unitaire documenté & déploiement de l'instance démo

As a responsable de la démo,
I want connaître le coût par Génération et disposer d'une instance démo déployable,
So that je puisse présenter RoomReveal en séance et justifier son économie.

**Acceptance Criteria:**

**Given** le pipeline complet fonctionnel
**When** une Génération de bout en bout est exécutée
**Then** le coût unitaire par Génération est mesuré et documenté dans le `README.md` (cible 0,30–1,25 $ ; COGS estimé ≈ 0,62 $, +0,05 $ par régénération d'Inpainting) (NFR-2, SM-5, AR-README-COGS)
**And** le temps de bout en bout sur photo standard est mesuré et documenté comme < 4 minutes (NFR-1, SM-4)

**Given** le même artefact applicatif
**When** on déploie
**Then** deux environnements existent — `dev` local (`next dev`) et instance démo auto-hébergée (`next start` ou Docker) **sur réseau privé** — ne différant que par la variable `FAL_KEY` (AR-DEPLOY, AR-PROXY)
**And** aucune CI en v1 : lint, typecheck et tests Vitest sont passés localement avant push (AR-DEPLOY, AR-TESTS)
