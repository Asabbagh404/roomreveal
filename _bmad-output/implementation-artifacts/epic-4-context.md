# Epic 4 Context: Révélation vidéo & clôture

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal
C'est le climax du produit : transformer la Pièce vide et la Photo originale en une courte Révélation cinématique (~5 s, ≥ 24 fps) où les meubles entrent en mouvement et se posent exactement à leur place réelle, puis offrir prévisualisation, téléchargement MP4 et relance d'une nouvelle Génération. L'epic clôt aussi les livrables de process : coût unitaire documenté au README et déploiement de l'instance démo. Il porte la métrique produit primaire (Révélation jugée cohérente sur un panel de photos réelles par des juges externes) et la cible de temps de bout en bout (< 4 min). C'est le seul epic où l'étape Vidéo, l'attente longue (1–3 min) et la clôture du cycle de vie prennent leur forme complète.

## Stories
- Story 4.1: Génération de la Révélation (Génération FLF)
- Story 4.2: Lecteur & prévisualisation de la Révélation
- Story 4.3: Téléchargement du MP4
- Story 4.4: Nouvelle Génération & clôture du cycle de vie
- Story 4.5: Coût unitaire documenté & déploiement de l'instance démo
- Story 4.6: Prompt de mouvement piloté par les détections
- Story 4.8: Révélation par Motion Brush (reverse-motion)

_Note : la Story 4.7 (composite déterministe côté client) partage le même drapeau de sélection de backend mais est développée dans un worktree séparé — hors périmètre de cet epic ici._

## Requirements & Constraints
- La Révélation dure environ 5 s à un framerate natif (pas de transcodage), conserve le ratio de la photo d'entrée sans jamais forcer un cadrage 16:9, et sort en résolution ≤ 1080p.
- Un seul preset d'animation en v1, sans durée ni réglage exposés à l'utilisateur : les meubles arrivent en mouvement (glisser depuis les côtés, descendre du plafond) et jamais par fondu ni apparition instantanée.
- L'attente de génération (typiquement 1 à 3 min) doit être annoncée avant et pendant, avec progression honnête par phases nommées ; un message d'apaisement s'ajoute au-delà d'un seuil de patience.
- Tout échec ou dépassement de délai produit un message français compréhensible et une relance limitée à l'étape Vidéo, sans jamais détruire les artefacts amont (Masque, Pièce vide) ni repartir du début du Parcours.
- Le MP4 se récupère directement depuis l'URL du storage distant et n'est jamais ré-hébergé côté serveur ; il doit être lisible dans les lecteurs standards.
- Livrables de clôture : coût par Génération mesuré et documenté au README, temps de bout en bout mesuré, et deux environnements (dev local + démo auto-hébergée sur réseau privé) ne différant que par la clé d'API.

## Technical Decisions
- Invariant produit central : génération contrainte first-last-frame stricte — première frame = Pièce vide, dernière frame = Photo originale intouchée. Aucune génération vidéo libre, aucun modèle sans mode first-last-frame dédié.
- Backend vidéo sélectionnable par variable d'environnement, avec un backend par défaut et des alternatives derrière le même drapeau. Le défaut courant est le backend first-last-frame ; le modèle vidéo effectif a évolué depuis la table historique de la spine (le code fait foi pour l'ID exact du modèle).
- Story 4.6 (livrée) : la détection locale peut renvoyer, en plus du masque, une liste d'instances (label, boîte normalisée, aire) ; ces instances alimentent un prompt de mouvement construit par une fonction pure côté prompts, nommant les plus grosses instances avec une direction d'entrée dérivée de leur position. Sans instances, le prompt de mouvement générique du preset est utilisé à l'identique. Les instances ne sont jamais exposées en UI et sont détruites avec la Génération.
- Story 4.8 : backend alternatif « motion-brush » qui pilote l'entrée des meubles par masques d'objets et trajectoires plutôt que par interpolation. Il génère la séquence meublé→vide puis l'inverse temporellement pour obtenir l'entrée des meubles, la ré-uploade et renvoie la Révélation. Ce backend relâche l'invariant first-last-frame : la dernière frame reste la photo intouchée, mais la première frame est générée par le modèle (pièce quasi-vide, pas l'inpaint) — relâchement assumé et inscrit dans la spine, valable pour ce seul backend car masques et image de queue sont mutuellement exclusifs.
- Contrats structurants inchangés : les appels vidéo passent par la queue distante (subscribe + polling) depuis le navigateur via le proxy, restent asynchrones et passifs avec signal d'annulation et jeton d'époque, et normalisent toute erreur dans la taxonomie unique. Les prompts et IDs de modèles restent centralisés dans les modules dédiés du pipeline.

## UX & Interaction Patterns
- Lecture automatique de la Révélation dès qu'elle est prête, avec une lueur dorée autour du cadre au premier lancement ; lecture/pause/relecture au clavier ; ni durée ni preset exposés.
- Aucune célébration additionnelle (pas de confetti ni toast) : la vidéo est la célébration.
- Trois actions sous le lecteur dans un ordre canonique fixe (Nouvelle Génération, Revoir, Télécharger le MP4), avec une seule action dorée par surface.
- Panneau d'attente à phases nommées et temps écoulé, jamais de spinner muet ni faux pourcentage ; barre monotone par tentative.
- « Nouvelle Génération » demande confirmation si la Révélation n'a pas été téléchargée ; un avertissement de fermeture d'onglet protège une Génération en cours ; le retour arrière via le stepper conserve les artefacts amont.

## Cross-Story Dependencies
- 4.1 est le socle : elle établit l'appel vidéo, l'attente longue et la gestion d'erreur ; 4.2/4.3/4.4 consomment la Révélation qu'elle produit.
- 4.6 se greffe sur le chemin de prompt de 4.1 et dépend de la disponibilité d'instances de détection (backend local) ; sans elles, comportement identique à 4.1.
- 4.8 est une branche alternative de 4.1 sélectionnée par le drapeau de backend ; elle réutilise le lecteur, le téléchargement et la clôture (4.2–4.4) sans les modifier, et s'appuie sur des routes de service local supplémentaires (masques d'instances, coquille de pièce, inversion vidéo).
- 4.5 dépend d'un pipeline complet fonctionnel pour mesurer coût et temps ; c'est le jalon de clôture de l'epic.
- L'epic entier consomme les artefacts des epics amont : Pièce vide (première frame / entrée) et Photo originale canonique (dernière frame), et hérite du reducer, du stepper, du panneau d'attente et du bandeau d'erreur mis en place au socle.
