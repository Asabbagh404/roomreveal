---
id: SPEC-flux_test
companions:
  - ../../planning-artifacts/prds/prd-flux_test-2026-07-10/prd.md
  - ../../planning-artifacts/architecture/architecture-flux_test-2026-07-10/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-flux_test-2026-07-10/EXPERIENCE.md
  - ../../planning-artifacts/ux-designs/ux-flux_test-2026-07-10/DESIGN.md
sources:
  - ../../planning-artifacts/briefs/brief-flux_test-2026-07-10/brief.md
  - ../../planning-artifacts/briefs/brief-flux_test-2026-07-10/addendum.md
  - ../../planning-artifacts/prds/prd-flux_test-2026-07-10/addendum.md
---

> **Contrat canonique.** Ce SPEC et les fichiers de `companions:` forment le contrat complet, validé en préservation, de ce qu'il faut construire, tester et valider. Les documents de `sources:` ne servent qu'à la traçabilité — à consulter uniquement pour la justification narrative que ce contrat omet volontairement.

# RoomReveal — Spec

## Why

Opportunité à capturer et vision à réaliser : le staging virtuel est saturé d'images fixes banalisées (0,12–0,30 $ l'image) ; personne ne produit de mouvement crédible à partir d'une **seule photo meublée**. RoomReveal transforme cette photo en vidéo de « révélation » cinématique — la pièce apparaît vide, les meubles flottent et atterrissent exactement à leur place réelle — en moins de 4 minutes, pour des agents immobiliers et home stagers sans compétence technique. La v1 est un démonstrateur interne : valider que le pipeline tient sur des photos réelles et que le Parcours est utilisable sans accompagnement, avant toute ouverture publique. Le moat n'est pas technologique (modèles publics sur fal.ai) mais tient au workflow packagé en un clic.

## Capabilities

- **CAP-1 — Upload et préparation** (FR-1..3)
  - **intent:** L'utilisateur fournit une photo JPEG/PNG de pièce meublée ; le système la normalise silencieusement (côté long ≤ 1024 px, ratio préservé).
  - **success:** Une image valide (jusqu'à 4000×3000, ≤ 20 Mo) est acceptée et affichée ; format non supporté, fichier trop lourd ou corrompu est refusé avec message clair et réessai immédiat, jamais d'état sans issue.

- **CAP-2 — Masque : détection et édition** (FR-4..7)
  - **intent:** Le système détecte les meubles par catégorie et propose un Masque en overlay contrasté ; l'utilisateur l'affine au pinceau/gomme (taille réglable) puis le valide.
  - **success:** Sur un salon meublé standard, les meubles principaux sont couverts par le Masque initial ; le Masque validé part **verbatim** à l'Inpainting — une zone gommée n'est jamais effacée, une zone peinte l'est toujours (SM-2 : respect à 100 %).

- **CAP-3 — Pièce vide** (FR-8..9)
  - **intent:** L'Inpainting efface les zones du Masque et produit la Pièce vide ; l'utilisateur régénère à volonté depuis le même Masque validé.
  - **success:** Zones du Masque remplacées par un rendu plausible sans meuble résiduel (jugé par le protocole SM-1) ; zones hors Masque identiques à la Photo originale ; « Régénérer » produit un nouveau rendu sans refaire les étapes amont.

- **CAP-4 — Révélation vidéo FLF** (FR-10..12)
  - **intent:** Le système génère une vidéo d'environ 5 s où les meubles arrivent en flottant et se posent à leur position réelle, puis l'utilisateur la prévisualise dans l'app et télécharge le MP4.
  - **success:** Première frame visuellement identique à la Pièce vide, dernière frame identique à la Photo originale ; meubles en mouvement flottant (ni fondu ni apparition) ; lecture/pause/relecture in-app ; MP4 lisible dans VLC, QuickTime et lecteurs natifs.

- **CAP-5 — Parcours guidé et attente honnête** (FR-13..15)
  - **intent:** L'utilisateur voit en permanence sa position dans le Parcours 4 étapes (Upload → Masque → Pièce vide → Vidéo), chaque attente est annoncée (Génération FLF : 1–3 min), et il revient en arrière sans perdre ses artefacts.
  - **success:** Aucune opération > 2 s sans indicateur ; revenir à l'étape Masque conserve Photo originale et Masque précédent ; un testeur non technique complète une Génération sans aide, du premier coup (SM-3).

- **CAP-6 — Robustesse** (FR-16..17)
  - **intent:** Aucune détection vide, échec ou timeout d'appel IA ne laisse l'utilisateur bloqué.
  - **success:** Photo sans meuble → annonce explicite + fallback masque 100 % manuel, Parcours praticable ; échec/timeout → message français sans trace technique, relance limitée à l'étape concernée, artefacts amont conservés.

## Constraints

- **Invariant FLF (contractuel — PRD §5, AD-1) :** ordre du pipeline fixe (Détection → Inpainting → Génération FLF) ; première frame = Pièce vide, dernière frame = Photo originale **jamais retouchée**. Aucune story ne peut y substituer une génération vidéo libre (image-to-video simple).
- Le Masque validé est transmis sans aucune altération — pas de re-détection, dilation, blur ni post-traitement (FR-7, AD-7).
- Génération complète < 4 minutes sur photo standard (NFR-1), **sans** sacrifier la cohérence visuelle à la vitesse (SM-C1).
- Coût par Génération mesuré, documenté dans le README et tenu dans 0,30–1,25 $ (NFR-2, SM-C2) — livrable de process à porter comme tâche explicite d'epic, sans FR porteur.
- Aucun stockage durable : purge automatique de tous les artefacts après 24 h (NFR-4).
- Web app desktop uniquement (Chrome, Firefox, Safari récents) ; UI 100 % en français, vocabulaire du glossaire PRD obligatoire (NFR-5, NFR-6).
- Tous les prompts modèles centralisés dans un seul fichier facilement éditable (AD-6).
- La Révélation est livrée au framerate natif du modèle, ≥ 24 fps (typiquement 30 fps) — aucun transcodage (décision du 2026-07-10).

## Non-goals

- Pas de SaaS public : ni comptes, ni authentification, ni paiement, ni quotas.
- Pas de traitement par lot ni d'API programmatique.
- Pas d'édition avancée du résultat (trim, trajectoires par meuble, musique) ; un seul preset d'animation (« mix côtés + plafond ») et une seule durée (~5 s).
- Pas d'application mobile ni de responsive poussé.
- Pas de génération depuis une vidéo ou un plan 3D.
- Pas de file d'attente multi-utilisateurs — un utilisateur actif à la fois.

## Success signal

Sur un panel d'au moins 10 photos réelles de salons meublés, au moins 7 Révélations sont jugées cohérentes (meubles flottants, positions finales exactes, pas d'artefact choquant) par deux juges extérieurs au développement (SM-1), et un testeur non technique complète une Génération sans aide, du premier coup, en moins de 4 minutes (SM-3, SM-4). Première photo de référence du protocole : `test-assets/cuisine-ambiance-4x3.jpeg` (1920×1440, 4:3) — sert aussi de contrôle du ratio préservé exigé par AD-2.

## Open Questions

- Faut-il une Révélation d'exemple en boucle sur l'Accueil pour aider SM-3 ? L'asset n'existe pas encore ; non tranché (UX, question ouverte 4).
