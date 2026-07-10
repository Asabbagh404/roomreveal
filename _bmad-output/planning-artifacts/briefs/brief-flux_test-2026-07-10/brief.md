---
title: "Product Brief — RoomReveal"
status: draft
created: 2026-07-10
updated: 2026-07-10
---

# Product Brief : RoomReveal

## Résumé exécutif

RoomReveal est une application web qui transforme une simple photo de pièce meublée en une courte vidéo cinématique : la pièce apparaît d'abord vide, puis les meubles arrivent en flottant depuis les côtés et le plafond pour se poser exactement à leur place réelle. En moins de quatre minutes, un agent immobilier obtient un visuel de "révélation" premium, prêt à publier sur une annonce ou sur les réseaux sociaux.

Le marché du virtual staging est saturé d'images fixes : ajouter des meubles à une pièce vide ou les effacer d'une photo est un service banalisé (0,12 à 0,30 $ l'image en IA), et les acteurs établis ne proposent pas de vidéo. RoomReveal part d'une **seule photo meublée** et fait tout le reste : la vidéo est générée "à l'envers", contrainte par ses première et dernière frames, ce qui garantit que chaque meuble atterrit à sa position exacte.

## Le problème

Les agents immobiliers et les home stagers se battent pour capter l'attention sur des flux saturés d'images statiques. Leurs options actuelles : payer un vidéaste, se contenter de photos retouchées, ou utiliser des outils de staging virtuel qui produisent des images fixes interchangeables. Les particuliers en déménagement et les architectes d'intérieur ont le même besoin de projection — voir un espace sans son mobilier — sans outil simple pour le faire.

Le coût du statu quo : des annonces qui se ressemblent toutes, un contenu social sans effet "wow", et un travail de retouche manuel (détourage, effacement) long et technique pour un résultat qui reste une image.

## La solution

Un parcours web en quatre étapes qu'un utilisateur non technique complète seul :

1. **Upload** d'une photo de pièce meublée (JPEG/PNG, redimensionnement automatique).
2. **Masque** : les meubles sont détectés et segmentés automatiquement par catégorie ; l'utilisateur affine le masque au pinceau/gomme si besoin.
3. **Pièce vide** : l'inpainting efface les meubles ; un bouton "régénérer" permet de retenter si le résultat ne convient pas.
4. **Vidéo** : génération d'un clip d'environ 5 secondes (24 fps) où les meubles arrivent en flottant, prévisualisation dans l'app et téléchargement MP4.

La progression est visible à chaque étape, avec des états de chargement clairs — la génération vidéo peut prendre 1 à 3 minutes ; l'attente est assumée et expliquée.

## Ce qui rend RoomReveal différent

Le cœur du produit est une contrainte technique transformée en garantie visuelle : la génération **first-frame / last-frame (FLF)**. La vidéo est interpolée entre la pièce vide (début) et la photo originale (fin). Les meubles n'arrivent pas "au hasard" : ils convergent nécessairement vers leur position réelle. C'est ce qui rend le résultat crédible et cinématique là où une génération vidéo libre produirait des incohérences.

Ce concept de pipeline est un invariant du produit : **il doit être préservé tel quel lors de la découpe en epics et stories**. Sans le FLF, le produit perd sa raison d'être.

L'honnêteté impose de le dire : le concept générique de vidéo de révélation existe déjà (Home Design AI anime des paires avant/après, des workflows DIY circulent). Le différenciateur de RoomReveal est en amont : **partir d'une seule photo meublée**, là où les concurrents exigent de fournir les deux images. Le moat n'est pas technologique — les modèles sont publics, sur fal.ai — c'est un moat de workflow et d'exécution : packager ce pipeline en un clic pour un public non technique de l'immobilier (analyse concurrentielle détaillée : voir addendum, recherche du 2026-07-10).

## À qui ça s'adresse

- **Primaire** : agents immobiliers et home stagers — ils veulent des visuels premium différenciants pour leurs annonces et réseaux sociaux, sans compétence technique ni budget vidéaste.
- **Secondaire** : architectes d'intérieur, marques déco, créateurs de contenu — usage ponctuel pour de la projection ou du contenu spectaculaire.

## Critères de succès

- Une photo de salon meublé produit une vidéo cohérente : meubles flottants, positions finales exactes.
- Le masque édité manuellement est respecté par l'inpainting.
- Un utilisateur non technique complète le parcours sans aide externe.
- Temps de bout en bout < 4 minutes pour une photo standard.
- Coût unitaire par génération connu, documenté dans le README, et raisonnable face aux offres concurrentes (chiffrage : voir addendum ; à affiner par l'Architect au moment du build).

## Périmètre

**Dans la v1** : le parcours complet en 4 étapes (exigences F1–F8, détaillées dans l'addendum) — upload et redimensionnement, détection par catégorie de meuble, segmentation avec overlay, édition manuelle du masque, inpainting avec régénération, génération vidéo ~5 s, prévisualisation + téléchargement MP4, progression visible. Robustesse incluse : aucun meuble détecté, timeout API, image trop grande, échec de génération.

**Hors v1** : comptes utilisateurs et authentification, paiement/quotas, traitement par lot, édition avancée du résultat, application mobile, génération depuis vidéo ou plan 3D.

**Confidentialité** : les photos uploadées ne sont pas stockées durablement — purge après X heures. [ASSUMPTION : 24 h par défaut, à confirmer]

## Questions ouvertes (à trancher au planning)

- Modèle FLF précis sur fal.ai (disponibilité et prix au moment du build — décision Architect).
- Durée vidéo idéale : 3, 5 ou 8 secondes. [ASSUMPTION : 5 s en preset unique pour la v1]
- Un seul style d'arrivée des meubles ou plusieurs presets. [ASSUMPTION : un seul preset "mix côtés + plafond" en v1]
- Gestion de file d'attente multi-utilisateurs (pertinent seulement si l'app devient publique).
- Politique de rétention exacte des fichiers.

## Vision

Si la v1 valide le concept, RoomReveal devient la brique "révélation vidéo" du marketing immobilier : presets d'animation multiples, traitement par lot pour les agences, intégration aux plateformes d'annonces, et déclinaison du pipeline FLF à d'autres transformations (avant/après rénovation, changement de style déco).
