---
title: "Addendum PRD — RoomReveal (matière pour l'Architecture)"
status: draft
created: 2026-07-10
updated: 2026-07-10
---

# Addendum PRD — RoomReveal

Contenu technique volontairement exclu du PRD (le PRD décrit des capacités, pas des implémentations). Destiné au workflow `bmad-architecture`.

## Préférences techniques (non contraignantes — l'Architect tranche)

Reprises du brief du 2026-07-10 :

- **Fournisseur IA** : fal.ai privilégié, Replicate en fallback documenté.
- **Modèles cibles** :
  - Détection : Grounding DINO — prompt texte : `"sofa. chair. table. bed. lamp. shelf. cabinet. rug. plant. tv."`
  - Segmentation : SAM 2
  - Inpainting : FLUX.2 Klein 4B en mode édition/inpainting
  - Vidéo FLF : Wan 2.1 FLF2V, Kling FLF ou équivalent — choisir le plus fiable au moment du build.
- **Contrainte d'organisation du code** : les prompts des modèles doivent être centralisés dans un fichier facilement éditable, pas dispersés dans le code.
- **Périmètre** : web app uniquement (pas de desktop / mobile natif).

## Données de coût fal.ai (mi-2026 — à rafraîchir au build)

- **COGS estimé par Génération : 0,30–1,25 $** selon la gamme de modèle — ventilation : ~0,10 $ pour le déclutter (détection + segmentation + inpainting) + 0,20–1,12 $ pour la vidéo 5 s (source de NFR-2 et SM-C2 du PRD).
- Wan-2.1 FLF2V (`fal-ai/wan-flf2v`) : 0,20 $/vidéo en 480p, 0,40 $ en 720p.
- Kling O3 Standard (start/end frame) : ~0,084 $/s soit ~0,42 $ pour 5 s (sans audio) ; Kling 3.0 Pro ~1,12 $/5 s ; Kling V3 4K 2,10 $/5 s.
- Veo 3.1 first-last-frame : endpoint `fal-ai/veo3.1/first-last-frame-to-video`, prix non relevé.
- Inpainting : FLUX.1 [pro] Fill 0,05 $/MP ; FLUX.1 [dev] inpaint 0,035 $/MP ; FLUX Pro Erase disponible pour la suppression d'objets.

## Contexte concurrentiel

À retenir pour les décisions produit aval : Home Design AI anime déjà des paires avant/après fournies par l'utilisateur ; le différenciateur RoomReveal est de partir d'une **seule photo meublée** (pipeline rétro-conçu) — c'est ce qui fonde l'invariant FLF du PRD (§5). Le brief est explicite sur la nature du moat : il n'est pas technologique (les modèles sont publics, sur fal.ai) mais tient au **workflow et à l'exécution** — packager le pipeline en un clic pour un public non technique de l'immobilier. L'analyse complète (tableau des acteurs, vérification de nouveauté, sources) se trouve dans l'addendum du brief : `_bmad-output/planning-artifacts/briefs/brief-flux_test-2026-07-10/addendum.md`.
