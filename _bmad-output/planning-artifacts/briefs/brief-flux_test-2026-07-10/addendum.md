---
title: "Addendum — RoomReveal (détail technique et contexte pour PRD / Architecture)"
status: draft
created: 2026-07-10
updated: 2026-07-10
---

# Addendum — RoomReveal

Approfondissements destinés aux documents aval (PRD, architecture). Ne fait pas partie du brief exécutif.

## Pipeline technique détaillé (invariant produit)

1. **Segmentation** des meubles dans la photo originale : détection texte-guidée + segmentation précise.
2. **Effacement** des meubles par inpainting → image de la pièce vide.
3. **Génération vidéo inversée** avec un modèle image-to-video **first-frame + last-frame** :
   - première frame = pièce vide
   - dernière frame = photo originale meublée
   - le modèle interpole → les meubles apparaissent à leur position finale exacte, sans hallucination.

Sans le FLF, les meubles arriveraient "au hasard" et la vidéo serait incohérente. **À préserver lors de la découpe en stories.**

## Préférences techniques (non contraignantes — l'Architect tranche)

- Fournisseur IA : **fal.ai** privilégié, Replicate en fallback documenté.
- Modèles cibles :
  - Détection : **Grounding DINO** — prompt texte : `"sofa. chair. table. bed. lamp. shelf. cabinet. rug. plant. tv."`
  - Segmentation : **SAM 2**
  - Inpainting : **FLUX.2 Klein 4B** en mode édition/inpainting
  - Vidéo : modèle image-to-video first/last-frame disponible sur fal (Wan 2.1 FLF2V, Kling FLF ou équivalent — choisir le plus fiable au moment du build)
- Web app (pas de desktop / mobile natif).
- Les prompts des modèles doivent être **centralisés dans un fichier facilement éditable**, pas dispersés dans le code.

## Exigences fonctionnelles source (F1–F8)

- **F1** : Upload photo (JPEG/PNG), redimensionnement automatique côté long ≤ 1024 px
- **F2** : Détection automatique des meubles par catégorie (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…)
- **F3** : Segmentation précise avec masque affiché en overlay
- **F4** : Édition manuelle du masque (pinceau ajouter / gomme retirer, taille réglable) avant validation
- **F5** : Inpainting → image pièce vide, bouton "régénérer"
- **F6** : Vidéo ~5 s / 24 fps, meubles flottants depuis côtés et plafond
- **F7** : Prévisualisation dans l'app + téléchargement MP4
- **F8** : Progression étape par étape (upload → masque → pièce vide → vidéo), états de chargement clairs (vidéo : 1 à 3 min)

## Exigences non fonctionnelles source

- Temps total cible : < 4 min de bout en bout pour une photo standard
- Coût par génération : à estimer et documenter dans le README (tarifs fal.ai)
- Robustesse : aucun meuble détecté, timeout API, image trop grande, échec de génération vidéo
- UX : parcours 4 étapes, utilisable par un non-technicien sans aide
- Confidentialité : pas de stockage durable, purge après X heures (à définir)

## Paysage concurrentiel (recherche du 2026-07-10)

_Digest de recherche web — à rafraîchir au moment du build, le domaine évolue vite._

### Staging / désencombrement sur images fixes (banalisé)

| Outil | Offre | Prix indicatif | Vidéo ? |
|---|---|---|---|
| Virtual Staging AI | Staging IA + suppression de meubles (traitement en ~15 s par image) | dès 16 $/mois (6 images) | Non |
| REimagineHome (Styldod) | Staging IA | 19 $/mois (30 img) → 119 $/mois (~1 200 img) | Non |
| Collov AI | Staging le moins cher + AI Furniture Eraser, day-to-dusk, upscale 4K | ~0,15–0,27 $/image | Non |
| Styldod (service humain) | Staging 16–23 $/image, suppression d'objets 8 $/image (24–48 h) | jusqu'à 69 $/img premium | Non |
| Apply Design | Plateforme IA, batch, éditeur manuel | 14–99 $/mois | Non |
| Roomagen / StageHQ | IA low-cost, déclutter "Empty Your Space" | ~0,12–0,30 $/image | Non |
| AI HomeDesign, Decor8 AI, Stager AI, ideal.house, ArchiVinci | Suppression d'objets gratuite/low-cost | — | Non |

Le marché images fixes est **totalement banalisé** : 0,12–0,30 $/image en IA contre 8–69 $ en service humain.

### Vérification de nouveauté vidéo — concept PAS totalement inédit

- **Home Design AI** (home-design.ai/animate) est le concurrent le plus proche : upload d'une **paire** avant/après → animation de transformation ("bounce furniture entrance", "explosive reveal", "light sweep") ; 4/6/8 s, 720p/1080p, 16:9/9:16, MP4/WebM/GIF, ~16 crédits/vidéo. C'est essentiellement le même concept FLF2V, déjà productisé.
- Workflows DIY viraux existants : vidéos "AI room unboxing" (blog getimg.ai), clips avant/après rénovation via Higgsfield / Kling start-end-frame ; Media.io vend un "AI Renovation Video Generator".
- **Différenciation résiduelle de RoomReveal** : partir d'une photo **meublée** unique (le déclutter automatique synthétise la première frame vide ; la dernière frame est la photo originale intouchée, d'où une position finale au pixel près), plus un packaging one-click spécifique à l'immobilier. Le concept générique "vidéo de révélation vide → meublé" n'est pas nouveau ; le pipeline rétro-conçu depuis une seule photo est un avantage de workflow/UX, pas une invention de catégorie.

### Données de coût fal.ai (mi-2026)

- **Wan-2.1 FLF2V** (`fal-ai/wan-flf2v`) : 0,20 $/vidéo en 480p, 0,40 $ en 720p
- **Kling O3 Standard** (start/end frame) : ~0,084 $/s → ~0,42 $ pour 5 s (sans audio) ; Kling 3.0 Pro ~1,12 $/5 s ; Kling V3 4K 2,10 $/5 s
- **Veo 3.1 first-last-frame** : endpoint existant sur fal (`fal-ai/veo3.1/first-last-frame-to-video`), prix non relevé
- **Inpainting** : FLUX.1 [pro] Fill 0,05 $/MP ; FLUX.1 [dev] inpaint 0,035 $/MP ; FLUX Pro Erase disponible pour suppression d'objets
- **COGS RoomReveal estimé** : ~0,10 $ (déclutter) + 0,20–1,12 $ (vidéo 5 s) ≈ **0,30–1,25 $ par génération** selon la gamme de modèle — marge confortable face aux abonnements concurrents à 16–20 $/mois

Sources : housingwire.com (roundup virtual staging), roomagen.com, collov.ai, styldod.com, virtualstagingai.app, home-design.ai/animate, photoaivideo.com, getimg.ai, higgsfield.ai, pages modèles fal.ai (wan-flf2v, kling-video, flux-pro fill).
