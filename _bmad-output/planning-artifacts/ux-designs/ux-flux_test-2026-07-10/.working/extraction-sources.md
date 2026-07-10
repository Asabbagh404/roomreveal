# Extraction structurée RoomReveal — matière pour DESIGN.md / EXPERIENCE.md

**Sources lues** (5/5) :
- Brief : `_bmad-output/planning-artifacts/briefs/brief-flux_test-2026-07-10/brief.md`
- Addendum brief : `.../briefs/brief-flux_test-2026-07-10/addendum.md`
- PRD : `_bmad-output/planning-artifacts/prds/prd-flux_test-2026-07-10/prd.md`
- Addendum PRD : `.../prds/prd-flux_test-2026-07-10/addendum.md`
- Brief d'entrée : `docs/project-brief-roomreveal-bmad.md`

---

## 1. Produit

- **Quoi** : application web qui transforme **une seule photo de pièce meublée** en une courte vidéo cinématique de « révélation » (~5 s, 24 fps, MP4) : la pièce apparaît d'abord vide, puis les meubles arrivent en flottant depuis les côtés et le plafond et se posent **exactement à leur place réelle**.
- **Promesse temporelle** : « En moins de quatre minutes » un visuel premium prêt à publier (annonce immobilière, réseaux sociaux).
- **Mécanisme signature (invariant produit, PRD §5, contractuel)** : pipeline en 3 temps — (1) Détection des meubles → Masque ; (2) Inpainting → Pièce vide ; (3) **Génération FLF (first-frame / last-frame)** : première frame = Pièce vide, dernière frame = Photo originale intouchée. La vidéo est « générée à l'envers » ; les meubles convergent nécessairement vers leur position réelle, « au pixel près », « sans hallucination ». « Sans le FLF, le produit perd sa raison d'être. »
- **Positionnement concurrentiel** :
  - Marché du virtual staging sur images fixes « totalement banalisé » (0,12–0,30 $/image en IA ; 8–69 $ en service humain) ; les acteurs établis ne proposent **pas de vidéo**.
  - **Home Design AI** (home-design.ai/animate) est le concurrent le plus proche — il anime une **paire** avant/après fournie par l'utilisateur (presets « bounce furniture entrance », « explosive reveal », « light sweep » ; 4/6/8 s, 720p/1080p, 16:9/9:16, MP4/WebM/GIF, ~16 crédits/vidéo).
  - **Différenciateur RoomReveal** : partir d'une **seule photo meublée** + « packaging one-click spécifique à l'immobilier ». Moat « de workflow et d'exécution », pas technologique.
- **Calibrage v1 (PRD §0/§1)** : « **outil interne / démo** » — « la rigueur porte sur le parcours et la robustesse perçue, pas sur l'industrialisation ».

## 2. Utilisateurs & personas

- **Primaire** (verbatim) : « agents immobiliers et home stagers — ils veulent des visuels premium différenciants pour leurs annonces et réseaux sociaux, sans compétence technique ni budget vidéaste. »
- **Secondaire** (verbatim) : « architectes d'intérieur, marques déco, créateurs de contenu — usage ponctuel pour de la projection ou du contenu spectaculaire. »
- Mentionnés : « les particuliers en déménagement ».
- **Persona nommé** : **Claire**, « agente immobilière sans compétence technique » (parcours UJ-1).
- **Jobs To Be Done (PRD §2.1)** :
  - Fonctionnel : « produire un visuel vidéo différenciant à partir d'une seule photo d'annonce, sans compétence en retouche ni en vidéo. »
  - Émotionnel : « obtenir un effet "wow" qui rend fier de publier — l'annonce ne ressemble plus à toutes les autres. »
  - Contextuel (v1 interne) : « démontrer le concept à des collègues ou prospects avec de vraies photos, en séance, sans préparation. »
- **Non-utilisateurs v1 (PRD §2.2)** : agences à volume (batch), utilisateurs mobiles natifs (« la v1 est une web app utilisée sur desktop »), vidéastes/motion designers cherchant un contrôle fin de l'animation.

## 3. Fonctionnalités & besoins exprimés (exhaustif)

### Exigences source F1–F8 (brief + docs/project-brief, identiques)
- **F1** : Upload photo (JPEG/PNG), redimensionnement automatique côté long ≤ 1024 px
- **F2** : Détection automatique des meubles par catégorie (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…)
- **F3** : Segmentation précise avec masque affiché en overlay
- **F4** : Édition manuelle du masque (pinceau ajouter / gomme retirer, taille réglable) avant validation
- **F5** : Inpainting → image pièce vide, bouton « régénérer »
- **F6** : Vidéo ~5 s / 24 fps, meubles flottants depuis côtés et plafond
- **F7** : Prévisualisation dans l'app + téléchargement MP4
- **F8** : Progression étape par étape (upload → masque → pièce vide → vidéo), états de chargement clairs (vidéo : 1 à 3 min)

### FR du PRD (MVP = FR-1 à FR-17)

**4.1 Upload et préparation**
- **FR-1 Upload de photo** : JPEG/PNG accepté et affiché ; tout autre format refusé avec message explicite indiquant les formats acceptés.
- **FR-2 Redimensionnement automatique** : côté long ≤ 1024 px, silencieux, ratio d'aspect préservé (test : 4000×3000 passe sans erreur).
- **FR-3 Rejet des images inexploitables** : refus propre ; message clair + réessai immédiat ; jamais d'état sans issue. `[ASSUMPTION : limite fixée à 20 Mo]`

**4.2 Détection et édition du Masque** (« le cœur du contrôle utilisateur »)
- **FR-4 Détection automatique par catégorie** : chaque zone détectée associée à une catégorie nommée ; sur un salon standard, canapé/table/lampe couverts par le Masque initial.
- **FR-5 Affichage du Masque en overlay** : superposé à la Photo originale, « contraste suffisant pour juger de sa précision », distinguable « sur tout écran desktop courant ».
- **FR-6 Édition manuelle du Masque** : pinceau (ajouter) / gomme (retirer), taille d'outil réglable, effet visible immédiatement.
- **FR-7 Le Masque validé fait foi** : transmis à l'Inpainting « sans re-détection ni altération » ; zone gommée jamais effacée, zone peinte toujours effacée. « Le respect du masque édité conditionne la confiance dans l'outil » (SM-2).

**4.3 Pièce vide (Inpainting)**
- **FR-8 Génération de la Pièce vide** : zones du Masque remplacées par un rendu plausible (sol, murs) sans meuble résiduel ; zones hors Masque visuellement identiques à la Photo originale. Résultat « non déterministe ».
- **FR-9 Régénération** : bouton « régénérer », même Masque validé, sans refaire les étapes précédentes ; « nombre de régénérations non limité en v1 » `[ASSUMPTION]`.

**4.4 Génération de la Révélation (vidéo) — « l'étape signature »**
- **FR-10 Génération vidéo FLF** : ~5 s à 24 fps ; première frame = Pièce vide, dernière frame = Photo originale ; meubles « en mouvement (flottement) et non par fondu ou apparition instantanée ». `[ASSUMPTION : durée unique 5 s ; un seul preset « mix côtés + plafond »]`
- **FR-11 Prévisualisation** : lecture dans le navigateur avec lecture/pause et relecture.
- **FR-12 Téléchargement MP4** : lisible dans VLC, QuickTime, lecteur natif OS.

**4.5 Parcours et feedback**
- **FR-13 Progression visible** : étape courante et étapes accomplies « identifiables d'un coup d'œil à tout moment » (Upload → Masque → Pièce vide → Vidéo).
- **FR-14 États de chargement explicites** : « aucune opération de plus de 2 secondes sans indicateur visuel » ; la génération vidéo « annonce explicitement 1 à 3 minutes » ; attente « assumée et expliquée, jamais masquée derrière un spinner muet ».
- **FR-15 Retour en arrière** : revenir à une étape précédente sans perdre la Photo originale ni ré-uploader ; revenir à Masque depuis Pièce vide conserve Photo originale + Masque précédent. `[ASSUMPTION : navigation arrière limitée à la Génération en cours]`

**4.6 Robustesse**
- **FR-16 Aucun meuble détecté** : annoncé clairement + proposition de « créer le Masque entièrement au pinceau » (test : photo de pièce déjà vide → Parcours praticable). `[ASSUMPTION : fallback manuel]`
- **FR-17 Échec ou timeout d'appel IA** : « message compréhensible et une action de relance de l'étape concernée uniquement » ; un timeout vidéo « ne renvoie pas au début du Parcours : la Pièce vide et le Masque sont conservés » ; « le message d'erreur ne montre jamais de trace technique brute ».

### Différé / hors périmètre
- **v2 (PRD §7.2)** : presets d'animation multiples ; choix de durée vidéo (3/5/8 s) ; rétention configurable.
- **Non-objectifs v1 (PRD §6)** : comptes/auth/historique, paiement/quotas, batch, API, édition avancée du résultat, application mobile, « pas de responsive poussé — cible desktop » `[ASSUMPTION]`, génération depuis vidéo ou plan 3D, file d'attente multi-utilisateurs (`[ASSUMPTION : un utilisateur actif à la fois]`).
- **Vision post-v1** : presets multiples, batch agences, intégration plateformes d'annonces, déclinaison FLF (avant/après rénovation, changement de style déco).

### Glossaire canonique (PRD §3 — vocabulaire UI obligatoire)
**Photo originale**, **Masque** (un seul par Génération), **Détection**, **Pièce vide**, **Inpainting**, **Génération FLF**, **Révélation** (la vidéo finale), **Génération** (exécution complète upload → téléchargement), **Parcours** (Upload → Masque → Pièce vide → Vidéo).

## 4. Parcours déjà spécifiés

**UJ-1. « Claire crée sa vidéo de révélation pendant sa pause déjeuner. »** (seul journey nommé — toutes les FR s'y rattachent)
1. Sur la web app (**aucune authentification**), Claire uploade sa photo JPEG (salon meublé pour une annonce).
2. L'app détecte les meubles, affiche le masque en overlay ; Claire « corrige au pinceau un tapis oublié », puis valide.
3. La pièce vide générée lui convient (sinon clic « régénérer »).
4. Elle lance la vidéo ; l'app « annonce 1 à 3 minutes d'attente avec une progression visible ».
5. Elle prévisualise le clip de ~5 s — « les meubles flottent et atterrissent exactement à leur place » — et télécharge le MP4.
6. Durée totale : moins de 4 minutes.
**Cas limite intégré** : aucun meuble détecté → l'app « le dit explicitement et lui propose de peindre le masque elle-même ».

## 5. Plateforme & form-factor

- **Web app uniquement**, **cible desktop** (PRD §2.2, §6). NFR-5 : navigateurs desktop récents (Chrome, Firefox, Safari) `[ASSUMPTION]`.
- FR-5 : overlay distinguable « sur tout écran desktop courant ». FR-11 : lecture vidéo dans le navigateur.
- Nuance : brief silencieux sur le responsive ; PRD durcit en « pas de responsive poussé » — seuil minimal non défini.

## 6. Contraintes techniques pertinentes pour l'UX

**Modèles IA (préférences, l'Architect tranche)**
- Fournisseur : **fal.ai** privilégié, **Replicate** fallback.
- Détection : **Grounding DINO**, prompt : `"sofa. chair. table. bed. lamp. shelf. cabinet. rug. plant. tv."` (10 catégories).
- Segmentation : **SAM 2**. Inpainting : **FLUX.2 Klein 4B**. Vidéo FLF : **Wan 2.1 FLF2V**, **Kling FLF** ou Veo 3.1 FLF.
- Prompts centralisés dans un fichier éditable.

**Temps**
- Génération vidéo : **1 à 3 minutes** (à annoncer explicitement — FR-14). Bout en bout : **< 4 minutes** (NFR-1, SM-4). Toute opération > 2 s a un indicateur visuel.

**Coûts** : COGS ≈ 0,30–1,25 $/Génération (documenté README, pas dans l'UI).

**Upload / formats**
- Entrée : JPEG/PNG ; resize auto ≤ 1024 px ; limite `[ASSUMPTION : 20 Mo]`.
- Sortie : **MP4**, ~5 s, 24 fps. Résolution de sortie non spécifiée (480p/720p = choix Architect).

**Quotas / concurrence** : aucun quota, régénérations illimitées `[ASSUMPTION]` ; un utilisateur actif à la fois `[ASSUMPTION]`.

**Non-déterminisme** : inpainting non déterministe → boucle « régénérer jusqu'à satisfaction » (FR-9).

## 7. Marque, ton, style

Matière **très mince** — presque tout à créer :
- **Nom** : « RoomReveal » (*titre de travail — à confirmer*).
- **Vocabulaire produit** : « Révélation », « Pièce vide », « Masque », « Parcours », « Génération » (glossaire PRD §3).
- **Registre** : « premium », « cinématique », effet « **wow** », « qui rend fier de publier », « crédible et cinématique ».
- **Ton d'interface implicite** : honnêteté et transparence — attente « assumée et expliquée », « jamais masquée derrière un spinner muet », erreurs « compréhensibles », « jamais de trace technique brute ».
- **Simplicité** : « one-click », « utilisable par un non-technicien sans aide externe ni documentation ».
- Aucune couleur, typo, logo, moodboard dans les sources.

## 8. Métriques de succès & business model

**Business model** : aucun en v1 (outil interne/démo). COGS 0,30–1,25 $/Génération vs abonnements concurrents 16–20 $/mois.

**Métriques (PRD §9)** :
- **SM-1** : Révélation jugée cohérente sur la majorité des essais d'un panel de photos réelles. Valide FR-8, FR-10.
- **SM-2** : Masque édité respecté à **100 %** par l'Inpainting. Valide FR-7.
- **SM-3** : « Un testeur non technique complète une Génération sans aide, **du premier coup**. » Valide FR-13, FR-14, NFR-3. ← métrique la plus UX.
- **SM-4** (< 4 min bout en bout), **SM-5** (coût documenté).
- Contre-métriques : **SM-C1** — pas de vitesse au détriment de la cohérence visuelle ; **SM-C2** — pas de dégradation qualité vidéo pour gratter le coût. → Concevoir *pour* l'attente, pas contre elle.

## 9. Contraintes non fonctionnelles touchant l'UX

- **NFR-1** : < 4 min bout en bout. **NFR-3** : non-technicien complète le Parcours sans aide ni doc.
- **NFR-4 Confidentialité** : pas de stockage durable ; **purge automatique après 24 h** `[ASSUMPTION]` → rassurance UI potentielle, non spécifiée.
- **NFR-5** : web desktop (Chrome, Firefox, Safari) `[ASSUMPTION]`. **NFR-6** : interface en **français** `[ASSUMPTION]`. Pas d'i18n.
- **Robustesse** : « jamais face à un écran figé ou une erreur brute ».
- **Silence total des sources** : accessibilité, dark mode, offline, notifications, mentions légales/RGPD (au-delà purge 24 h), analytics.

## 10. Zones d'ombre (questions UX ouvertes)

**Questions ouvertes explicites des sources**
1. Modèle FLF précis — décision Architect ; impacte résolution/qualité perçue.
2. Politique de rétention définitive (24 h par défaut).
3. **Exposer ou non la catégorie des meubles détectés dans l'UI** — « trancher à la conception UX ». → **TRANCHÉ : masquées** (décision Anthony, memlog).
4. Limite exacte de taille d'upload (hypothèse 20 Mo).
5. Durée 3/5/8 s → 5 s ; preset unique ; file d'attente — ASSUMPTIONS à confirmer.

**Zones non spécifiées (croisement)**
- **Écran d'accueil / landing** : rien avant l'upload (onboarding, exemple de résultat, explication). Or SM-3 exige la réussite « du premier coup ».
- **Résolution et ratio de sortie** : non spécifiés ; cible « réseaux sociaux » suggère la question du vertical, absente des sources.
- **Interaction du masque** : zoom/pan pour édition fine ? Undo/redo ? Non couverts.
- **Étape Pièce vide** : comparaison avant/après (côte à côte, slider ?) non spécifiée ; historique des régénérations non couvert.
- **Progression pendant la génération vidéo** : barre réelle, estimation, ou compte à rebours ? Peut-on quitter/revenir pendant l'attente ?
- **Recommencer / nouvelle Génération** : aucun écran de fin ni CTA « nouvelle photo » spécifié.
- **Rafraîchissement / fermeture d'onglet** pendant génération : perte totale ? Non couvert.
- **Responsive minimal** : seuil non défini.
- **États vides, messages d'erreur exacts, microcopies** : tout à écrire (français, pas de jargon).
- **Identité visuelle** : intégralement à créer. → **TRANCHÉ : sombre cinématique + shadcn/ui** (décisions Anthony, memlog).
- **Affichage durée/preset imposés** : les montrer ou les taire ? Non spécifié.

**8 hypothèses indexées du PRD §11** (toutes touchent l'UX) : fallback masque 100 % manuel ; limite 20 Mo ; régénérations illimitées ; 5 s + preset unique ; retour arrière limité à la Génération en cours ; desktop only + un utilisateur à la fois ; purge 24 h ; navigateurs récents + interface en français.

**Contradictions** : aucune substantielle entre brief et PRD.
