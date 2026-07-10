# Project Brief — RoomReveal

> Document d'entrée pour l'agent Analyst / PM BMAD. Contient le "quoi" et le "pourquoi", pas le "comment". L'Architect décidera de la stack et de la structure.

## Vision

Une application web qui transforme la photo d'une pièce meublée en une courte vidéo cinématique où la pièce apparaît d'abord vide, puis les meubles arrivent en flottant doucement depuis les côtés et le plafond pour se poser à leur place.

## Problème / Opportunité

Les agents immobiliers, home stagers, architectes d'intérieur et particuliers en déménagement veulent visualiser ou présenter un espace sans mobilier — ou avec une "révélation" visuelle marquante. Les outils existants font soit du "virtual staging" statique (ajouter des meubles), soit du décluttering d'images fixes. Personne ne combine désencombrement + animation vidéo cohérente à partir d'une seule photo.

## Utilisateurs cibles

- **Primaire** : agents immobiliers et home stagers qui veulent des visuels premium pour annonces / réseaux sociaux
- **Secondaire** : architectes d'intérieur, marques déco, créateurs de contenu

## Concept clé (à préserver pendant le planning)

Le pipeline repose sur une astuce de génération vidéo qui garantit la cohérence visuelle. **Il ne faut pas la perdre lors de la découpe en stories** :

1. **Segmenter** les meubles dans la photo originale (détection texte-guidée + segmentation précise)
2. **Effacer** les meubles par inpainting → image de la pièce vide
3. **Générer la vidéo à l'envers** avec un modèle image-to-video **first-frame + last-frame** :
   - première frame = pièce vide
   - dernière frame = photo originale meublée
   - le modèle interpole → les meubles apparaissent à leur exacte position finale, sans hallucination

Sans le FLF (first/last frame), les meubles arriveraient "au hasard" et la vidéo serait incohérente.

## Exigences fonctionnelles

- **F1** : Upload d'une photo (JPEG/PNG), redimensionnement automatique côté long ≤ 1024px
- **F2** : Détection automatique des meubles par catégorie (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…)
- **F3** : Segmentation précise avec masque affiché en overlay sur l'image
- **F4** : Édition manuelle du masque (pinceau ajouter / gomme retirer, taille réglable) avant validation
- **F5** : Inpainting pour produire l'image de la pièce vide, avec bouton "régénérer" si le résultat ne convient pas
- **F6** : Génération d'une vidéo ~5s / 24 fps où les meubles arrivent en flottant depuis les côtés et le plafond
- **F7** : Prévisualisation vidéo dans l'app + téléchargement MP4
- **F8** : Progression étape par étape visible (upload → masque → pièce vide → vidéo), avec états de chargement clairs (la vidéo peut prendre 1 à 3 min)

## Exigences non fonctionnelles

- **Temps total** cible : < 4 min de bout en bout pour une photo standard
- **Coût par génération** : à estimer et afficher dans le README (dépend des tarifs fal.ai)
- **Robustesse** : gestion propre des cas "aucun meuble détecté", timeout API, image trop grande, échec de génération vidéo
- **UX** : parcours en 4 étapes, un utilisateur non-tech doit s'en sortir seul
- **Confidentialité** : les photos uploadées ne sont pas stockées durablement (purge après X heures — à définir)

## Préférences techniques (non contraignantes, l'Architect tranche)

- Fournisseur d'IA : **fal.ai** privilégié (Replicate en fallback documenté)
- Modèles cibles :
  - Détection : **Grounding DINO** (prompt texte : "sofa. chair. table. bed. lamp. shelf. cabinet. rug. plant. tv.")
  - Segmentation : **SAM 2**
  - Inpainting : **FLUX.2 Klein 4B** en mode édition/inpainting
  - Vidéo : modèle **image-to-video first/last-frame** disponible sur fal (Wan 2.1 FLF2V, Kling FLF, ou équivalent — l'Architect choisit le plus fiable)
- Web app plutôt que desktop / mobile natif
- Les prompts des modèles doivent être centralisés dans un fichier facilement éditable (pas dispersés dans le code)

## Hors périmètre (v1)

- Comptes utilisateurs, authentification, historique
- Paiement / quotas
- Traitement par lot de plusieurs photos
- Édition avancée du résultat (retouche des meubles, changement de style)
- Application mobile
- Génération à partir de vidéos ou plans 3D

## Critères de succès

- Une photo de salon meublé → vidéo cohérente de meubles arrivant en flottant, meubles bien à leur place finale
- Le masque édité manuellement est respecté par l'inpainting
- Un utilisateur non-tech réussit le parcours complet sans aide externe
- Coût unitaire connu et raisonnable (à valider par l'Architect selon tarifs fal.ai actuels)

## Questions ouvertes (à trancher pendant planning)

- Quel modèle FLF précis retenir sur fal.ai aujourd'hui ? (dépend de la disponibilité et du prix au moment du build)
- Durée vidéo idéale : 3, 5 ou 8 secondes ?
- Faut-il proposer plusieurs "styles d'arrivée" des meubles (côtés seulement, plafond seulement, mix) ou un seul preset ?
- Gestion de la file d'attente si plusieurs utilisateurs en même temps (pertinent si l'app est publique) ?
- Politique de rétention exacte des fichiers uploadés
