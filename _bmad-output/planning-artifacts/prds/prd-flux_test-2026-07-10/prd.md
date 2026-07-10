---
title: "PRD — RoomReveal"
status: final
created: 2026-07-10
updated: 2026-07-10
---

# PRD : RoomReveal

*Nom confirmé le 2026-07-10.*

## 0. Objet du document

Ce PRD s'adresse aux ateliers aval de la chaîne BMad — UX (`bmad-ux`), architecture (`bmad-architecture`) et découpe en epics/stories (`bmad-create-epics-and-stories`). Il s'appuie sur le product brief RoomReveal du 2026-07-10 (`_bmad-output/planning-artifacts/briefs/brief-flux_test-2026-07-10/`) et ne le duplique pas : la justification marché et l'analyse concurrentielle restent dans le brief.

Conventions de lecture :

- le vocabulaire est ancré dans le glossaire (§3) ;
- les exigences fonctionnelles (FR) sont numérotées globalement et groupées par fonctionnalité ;
- les hypothèses inférées lors de la rédaction ont toutes été confirmées le 2026-07-10 et sont indexées en §11.

Enjeu calibré : **outil interne / démo** — la rigueur porte sur le parcours et la robustesse perçue, pas sur l'industrialisation.

## 1. Vision

RoomReveal transforme une simple photo de pièce meublée en une courte vidéo cinématique de « révélation » : la pièce apparaît d'abord vide, puis les meubles arrivent en flottant depuis les côtés et le plafond et se posent exactement à leur place réelle. En moins de quatre minutes, un utilisateur non technique obtient un clip MP4 premium, prêt à montrer ou à publier.

Là où le marché du staging virtuel produit des images fixes banalisées, RoomReveal produit du mouvement — et un mouvement *crédible*, car la vidéo est générée « à l'envers », contrainte entre une première frame (la pièce vidée par IA) et une dernière frame (la Photo originale intouchée). Chaque meuble converge nécessairement vers sa position réelle, au pixel près. C'est l'invariant produit (§5) : sans lui, RoomReveal n'a pas de raison d'être.

La v1 est un démonstrateur interne : valider que le pipeline tient sur des photos réelles et que le parcours est utilisable sans accompagnement, avant toute ambition d'ouverture publique. Si elle valide le concept, RoomReveal a vocation à devenir la brique « révélation vidéo » du marketing immobilier : presets d'animation multiples, traitement par lot pour les agences, intégration aux plateformes d'annonces, et déclinaison du pipeline FLF à d'autres transformations (avant/après rénovation, changement de style déco). Cette direction est une information d'extensibilité pour l'architecture, pas un engagement v1.

## 2. Utilisateur cible

### 2.1 Jobs To Be Done

- **Fonctionnel** : produire un visuel vidéo différenciant à partir d'une seule photo d'annonce, sans compétence en retouche ni en vidéo.
- **Émotionnel** : obtenir un effet « wow » qui rend fier de publier — l'annonce ne ressemble plus à toutes les autres.
- **Contextuel (v1 interne)** : démontrer le concept à des collègues ou prospects avec de vraies photos, en séance, sans préparation.

La cible primaire reste celle du brief : agents immobiliers et home stagers. Cible secondaire, servie par le même Parcours sans exigence dédiée en v1 : architectes d'intérieur, marques déco, créateurs de contenu, et particuliers en déménagement qui veulent se projeter dans un espace sans son mobilier.

### 2.2 Non-utilisateurs (v1)

- Agences à volume (traitement par lot) — hors périmètre v1.
- Utilisateurs mobiles natifs — la v1 est une web app utilisée sur desktop.
- Vidéastes / professionnels du motion design cherchant un contrôle fin de l'animation.

### 2.3 Parcours utilisateur clés

- **UJ-1. Claire crée sa vidéo de révélation pendant sa pause déjeuner.**
  Claire, agente immobilière sans compétence technique, vient de photographier un salon meublé pour une annonce. Sur la web app (aucune authentification), elle uploade sa photo JPEG. L'app détecte les meubles, affiche le Masque en overlay ; Claire corrige au pinceau un tapis oublié, puis valide. La Pièce vide générée lui convient (sinon elle clique « régénérer »). Elle lance la vidéo, l'app annonce 1 à 3 minutes d'attente avec une progression visible ; elle prévisualise le clip de ~5 s — les meubles flottent et atterrissent exactement à leur place — et télécharge le MP4. Durée totale : moins de 4 minutes. **Cas limite :** si aucun meuble n'est détecté, l'app le dit explicitement et lui propose de peindre le masque elle-même (fallback « masque 100 % manuel », voir FR-16).

## 3. Glossaire

- **Photo originale** — l'image meublée uploadée par l'utilisateur, jamais modifiée ; sert de dernière frame à la Génération FLF.
- **Détection** — identification automatique des meubles par catégorie (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…) produisant le Masque initial.
- **Masque** — la zone de la Photo originale couvrant les meubles à effacer ; produit par la Détection puis modifiable par l'utilisateur. Un seul Masque par Génération.
- **Inpainting** — effacement par IA des zones du Masque, remplacées par un rendu plausible de la pièce nue.
- **Pièce vide** — l'image générée par Inpainting où les meubles couverts par le Masque ont été effacés ; sert de première frame à la Génération FLF.
- **Génération FLF** (first-frame / last-frame) — génération vidéo contrainte par sa première frame (Pièce vide) et sa dernière frame (Photo originale) ; le modèle interpole entre les deux.
- **Révélation** — la vidéo finale (~5 s, ≥ 24 fps, MP4) où les meubles arrivent en flottant et se posent à leur position réelle.
- **Génération** — une exécution complète du parcours, de l'upload au téléchargement de la Révélation.
- **Parcours** — l'enchaînement des 4 étapes : Upload → Masque → Pièce vide → Vidéo.

## 4. Fonctionnalités

### 4.1 Upload et préparation

**Description :** point d'entrée du Parcours. L'utilisateur fournit une Photo originale ; le système la normalise silencieusement pour les modèles aval. Réalise le début de UJ-1.

#### FR-1 : Upload de photo
L'utilisateur peut uploader une photo JPEG ou PNG d'une pièce meublée.
**Conséquences (testables) :**
- Un fichier JPEG ou PNG valide est accepté et affiché à l'écran.
- Tout autre format est refusé avec un message explicite indiquant les formats acceptés.

#### FR-2 : Redimensionnement automatique
Le système redimensionne automatiquement la Photo originale pour que son côté long ne dépasse pas 1024 px, sans intervention de l'utilisateur.
**Conséquences (testables) :**
- Une image 4000×3000 est traitée sans erreur ; la version transmise aux modèles a un côté long ≤ 1024 px.
- Le ratio d'aspect est préservé.

#### FR-3 : Rejet des images inexploitables
Le système refuse proprement une image trop volumineuse ou corrompue.
**Conséquences (testables) :**
- Au-delà de la limite de taille de fichier (20 Mo), l'utilisateur reçoit un message clair et peut réessayer immédiatement.
- Un fichier corrompu ne bloque jamais le Parcours dans un état sans issue.

### 4.2 Détection et édition du Masque

**Description :** le cœur du contrôle utilisateur. La Détection propose un Masque par catégorie de meuble, affiché en overlay sur la Photo originale ; l'utilisateur l'affine puis le valide. Le Masque validé est le contrat exact passé à l'Inpainting. Réalise UJ-1.

#### FR-4 : Détection automatique par catégorie
Le système détecte les meubles de la Photo originale par catégorie et en dérive le Masque initial.
**Conséquences (testables) :**
- Sur une photo de salon meublé standard, les meubles principaux (canapé, table, lampe…) sont couverts par le Masque initial.
- Chaque zone détectée est associée à une catégorie nommée.

#### FR-5 : Affichage du Masque en overlay
L'utilisateur voit le Masque superposé à la Photo originale, avec un contraste suffisant pour juger de sa précision.
**Conséquences (testables) :**
- L'overlay est un aplat semi-transparent de couleur contrastée (opacité cible ~50 %), distinguable du contenu de la photo sur les trois navigateurs cibles (NFR-5).

#### FR-6 : Édition manuelle du Masque
L'utilisateur peut ajouter au Masque (pinceau) ou en retirer (gomme), avec une taille d'outil réglable, avant validation.
**Conséquences (testables) :**
- Un coup de pinceau ajoute la zone peinte au Masque ; la gomme l'en retire.
- La taille de l'outil est réglable et son effet visible immédiatement.

#### FR-7 : Le Masque validé fait foi
Le Masque tel que validé par l'utilisateur — éditions manuelles comprises — est celui transmis à l'Inpainting, sans re-détection ni altération.
**Conséquences (testables) :**
- Une zone retirée du Masque à la gomme n'est jamais effacée par l'Inpainting.
- Une zone ajoutée au pinceau est toujours effacée.

**Note :** FR-7 est un critère de succès explicite du brief — le respect du masque édité conditionne la confiance dans l'outil.

### 4.3 Pièce vide (Inpainting)

**Description :** l'Inpainting efface les meubles du Masque et produit la Pièce vide. Le résultat est non déterministe : l'utilisateur peut relancer jusqu'à satisfaction. Réalise UJ-1.

#### FR-8 : Génération de la Pièce vide
Le système génère la Pièce vide en effaçant les zones du Masque de la Photo originale.
**Conséquences (testables) :**
- Les zones du Masque sont remplacées par un rendu plausible (sol, murs) sans meuble résiduel visible — le caractère « plausible » est évalué par le protocole de SM-1 (§9).
- Les zones hors Masque sont visuellement identiques à la Photo originale.

#### FR-9 : Régénération
L'utilisateur peut relancer l'Inpainting si la Pièce vide ne lui convient pas, sans refaire les étapes précédentes.
**Conséquences (testables) :**
- Le bouton « régénérer » produit un nouveau rendu à partir du même Masque validé.
- Le nombre de régénérations n'est pas limité en v1 (usage interne ; à revoir si ouverture publique).

### 4.4 Génération de la Révélation (vidéo)

**Description :** l'étape signature. Le système lance une Génération FLF entre la Pièce vide (première frame) et la Photo originale (dernière frame) — voir l'invariant produit en §5. Réalise le climax de UJ-1.

#### FR-10 : Génération vidéo FLF
Le système génère une Révélation d'environ 5 secondes à au moins 24 fps (framerate natif du modèle, typiquement 30 fps — décision du 2026-07-10, pas de transcodage), contrainte par la Pièce vide en première frame et la Photo originale en dernière frame. La durée est unique en v1 : pas de choix utilisateur.
**Conséquences (testables) :**
- La dernière frame de la vidéo est visuellement identique à la Photo originale.
- La première frame est visuellement identique à la Pièce vide.
- Les meubles apparaissent en mouvement (flottement) et non par fondu ou apparition instantanée. Un seul preset d'animation en v1 : « mix côtés + plafond ».

#### FR-11 : Prévisualisation
L'utilisateur peut visionner la Révélation dans l'application avant de la télécharger.
**Conséquences (testables) :**
- La vidéo se lit dans le navigateur avec lecture/pause et relecture.

#### FR-12 : Téléchargement MP4
L'utilisateur peut télécharger la Révélation au format MP4.
**Conséquences (testables) :**
- Le fichier téléchargé se lit dans les lecteurs standards (VLC, QuickTime, lecteur natif OS).

### 4.5 Parcours et feedback

**Description :** le Parcours en 4 étapes est linéaire, visible et honnête sur l'attente. La Génération FLF peut prendre 1 à 3 minutes : cette attente est assumée et expliquée, jamais masquée derrière un spinner muet. Réalise UJ-1 de bout en bout.

#### FR-13 : Progression visible
L'utilisateur voit en permanence où il se trouve dans le Parcours (Upload → Masque → Pièce vide → Vidéo) et quelles étapes restent.
**Conséquences (testables) :**
- L'étape courante et les étapes accomplies sont identifiables d'un coup d'œil à tout moment.

#### FR-14 : États de chargement explicites
Chaque opération longue affiche un état de chargement qui annonce la durée attendue ; la Génération FLF annonce explicitement 1 à 3 minutes.
**Conséquences (testables) :**
- Aucune opération de plus de 2 secondes ne se déroule sans indicateur visuel.
- Pendant la Génération FLF, l'utilisateur sait que l'attente est normale et combien de temps elle devrait durer.

#### FR-15 : Retour en arrière
L'utilisateur peut revenir à une étape précédente pour corriger (rééditer le Masque, régénérer la Pièce vide) sans perdre la Photo originale ni recommencer l'upload. La navigation arrière est limitée à la Génération en cours.
**Conséquences (testables) :**
- Revenir à l'étape Masque depuis l'étape Pièce vide conserve la Photo originale et le Masque précédent comme point de départ.

### 4.6 Robustesse

**Description :** les modes de dégradation identifiés dans le brief sont gérés explicitement — l'utilisateur n'est jamais face à un écran figé ou une erreur brute. Couvre le cas limite de UJ-1.

#### FR-16 : Aucun meuble détecté
Quand la Détection ne trouve aucun meuble, le système l'annonce clairement et propose à l'utilisateur de créer le Masque entièrement au pinceau (fallback manuel plutôt que blocage).
**Conséquences (testables) :**
- Sur une photo de pièce déjà vide, l'utilisateur est informé et le Parcours reste praticable.

#### FR-17 : Échec ou timeout d'appel IA
Tout échec ou dépassement de délai d'un appel aux modèles (Détection, Inpainting, Génération FLF) produit un message compréhensible et une action de relance limitée à l'étape concernée.
**Conséquences (testables) :**
- Un timeout pendant la Génération FLF ne renvoie pas l'utilisateur au début du Parcours : la Pièce vide et le Masque sont conservés.
- Le message d'erreur ne montre jamais de trace technique brute.

## 5. Invariant produit : le pipeline FLF

*Section contractuelle pour la découpe en epics et stories — à préserver telle quelle.*

Le pipeline est : **(1)** Détection des meubles → Masque ; **(2)** Inpainting → Pièce vide ; **(3)** Génération FLF avec **première frame = Pièce vide** et **dernière frame = Photo originale**. La vidéo est interpolée entre ces deux bornes : les meubles convergent nécessairement vers leur position réelle, sans hallucination de position.

Conséquences non négociables pour le découpage aval :

- La Photo originale n'est **jamais** retouchée : c'est elle, intouchée, qui sert de dernière frame (position finale au pixel près).
- Aucune story ne doit remplacer la Génération FLF par une génération vidéo libre (image-to-video simple) : le produit perdrait sa garantie de crédibilité.
- L'ordre du pipeline est fixe ; les étapes 1–2 existent pour synthétiser la première frame, pas comme fonctionnalités indépendantes.

## 6. Non-objectifs (explicites)

- RoomReveal v1 **n'est pas** un SaaS public : pas de comptes, pas d'authentification, pas de paiement ni de quotas.
- Pas de traitement par lot ni d'API programmatique.
- Pas d'édition avancée du résultat (trim vidéo, choix de trajectoires par meuble, musique).
- Pas d'application mobile ni de responsive poussé — cible desktop.
- Pas de génération depuis une vidéo ou un plan 3D.
- Pas de gestion de file d'attente multi-utilisateurs — usage interne, un utilisateur actif à la fois suffit en v1.

## 7. Périmètre MVP

### 7.1 Dans le périmètre

- Parcours complet en 4 étapes (FR-1 à FR-15).
- Robustesse de base : aucun meuble détecté, timeout/échec API, image inexploitable (FR-3, FR-16, FR-17).
- Prévisualisation et téléchargement MP4.
- Coût unitaire par Génération documenté dans le README. `[NOTE FOR PM : livrable de process sans FR porteur — à porter comme tâche explicite dans l'epic correspondant ; valide SM-5 / NFR-2]`

### 7.2 Hors périmètre MVP

- Tout ce qui figure en §6 (non-objectifs).
- Presets d'animation multiples — différé v2. `[NOTE FOR PM : premier candidat si la démo suscite des demandes de personnalisation]`
- Choix de la durée vidéo (3/5/8 s) — différé v2.
- Rétention configurable des fichiers — v1 applique une purge fixe (§8, NFR-4).

## 8. Exigences non fonctionnelles transverses

- **NFR-1 — Temps de bout en bout** : une Génération complète sur photo standard (JPEG/PNG ≤ 20 Mo d'une pièce meublée typique, cf. FR-1 à FR-3) prend moins de 4 minutes, Génération FLF (1–3 min annoncées) comprise. Valide le critère de succès du brief.
- **NFR-2 — Coût unitaire** : le coût par Génération est mesuré, documenté dans le README, et raisonnable face aux offres concurrentes (abonnements images fixes à 16–20 $/mois). Chiffrage indicatif : 0,30–1,25 $ par Génération selon la gamme de modèle (voir addendum). Le choix final des modèles revient à l'Architect.
- **NFR-3 — Utilisabilité** : un utilisateur non technique complète le Parcours sans aide externe ni documentation.
- **NFR-4 — Confidentialité** : les photos uploadées et les artefacts générés ne sont pas stockés durablement ; purge automatique après 24 h.
- **NFR-5 — Plateforme** : web app, navigateurs desktop récents (Chrome, Firefox, Safari).
- **NFR-6 — Langue** : interface en français (public de démo francophone).

## 9. Métriques de succès

**Primaires**
- **SM-1** : Sur un panel d'au moins 10 photos de salons meublés réelles, la Révélation est jugée cohérente (meubles flottants, positions finales exactes, pas d'artefact choquant) sur au moins 7 essais sur 10, par deux juges extérieurs au développement. Valide FR-8, FR-10.
- **SM-2** : Le Masque édité manuellement est respecté à 100 % par l'Inpainting. Valide FR-7.
- **SM-3** : Un testeur non technique complète une Génération sans aide, du premier coup. Valide FR-13, FR-14, NFR-3.

**Secondaires**
- **SM-4** : Temps de bout en bout < 4 min sur photo standard. Valide NFR-1.
- **SM-5** : Coût par Génération connu et documenté. Valide NFR-2.

**Contre-métriques (à ne pas optimiser)**
- **SM-C1** : Ne pas réduire le temps de génération au détriment de la cohérence visuelle — un clip rapide mais peu crédible échoue la promesse produit. Contrebalance SM-4.
- **SM-C2** : Ne pas dégrader la qualité vidéo (résolution, fluidité) pour réduire le coût unitaire tant que le coût reste sous ~1,25 $/Génération. Contrebalance SM-5.

## 10. Questions ouvertes

1. Choix du modèle FLF précis sur fal.ai (Wan FLF2V, Kling, Veo 3.1…) — **décision Architect au moment du build**, disponibilité et prix évoluant vite.
2. Politique de rétention définitive des fichiers si l'outil dépasse l'usage interne (NFR-4 actuel : purge 24 h).
3. Faut-il exposer la catégorie des meubles détectés dans l'UI (FR-4 la produit) ou la garder interne ? `[NOTE FOR PM : aucune exigence utilisateur identifiée — trancher à la conception UX]`

## 11. Index des hypothèses

*Toutes les hypothèses inférées lors de la rédaction ont été **confirmées par Anthony le 2026-07-10** et sont désormais des décisions produit :*

1. §2.3 / §4.6 (FR-16) — fallback « masque 100 % manuel » quand aucun meuble n'est détecté.
2. §4.1 (FR-3) — limite d'upload fixée à 20 Mo.
3. §4.3 (FR-9) — régénérations illimitées en v1.
4. §4.4 (FR-10) — durée vidéo unique de 5 s ; un seul preset d'animation « mix côtés + plafond ».
5. §4.5 (FR-15) — retour en arrière limité à la Génération en cours.
6. §6 — cible desktop uniquement ; un utilisateur actif à la fois.
7. §8 (NFR-4) — purge des fichiers après 24 h.
8. §8 (NFR-5, NFR-6) — navigateurs desktop récents ; interface en français.
