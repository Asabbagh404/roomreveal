---
name: RoomReveal
description: Spine d'expérience de RoomReveal — architecture d'information, comportements, états et parcours du Parcours en 4 étapes.
status: final
updated: 2026-07-10
sources:
  - ../../briefs/brief-flux_test-2026-07-10/brief.md
  - ../../briefs/brief-flux_test-2026-07-10/addendum.md
  - ../../prds/prd-flux_test-2026-07-10/prd.md
  - ../../prds/prd-flux_test-2026-07-10/addendum.md
---

# RoomReveal — Experience Spine

> Héritage par référence : les exigences (FR-x), contraintes (NFR-x) et métriques (SM-x) vivent dans le PRD ; ce document ne spécifie que le comportement. Les specs visuelles vivent dans `DESIGN.md` (tokens référencés en `{path.to.token}`). En cas de conflit avec un mockup, un import ou tout autre visuel, **ce document et DESIGN.md font foi**.

## Foundation

Web app desktop, mono-utilisateur, **sans authentification** (UJ-1). Navigateurs desktop récents : Chrome, Firefox, Safari (NFR-5 `[ASSUMPTION héritée PRD §11]`). Interface intégralement en **français** (NFR-6 `[ASSUMPTION héritée PRD §11]`), pas d'i18n.

Socle : shadcn/ui sur React + Tailwind, mode dark unique. `DESIGN.md` est la référence d'identité visuelle et nomme la surface d'override ; cette spine est l'expérience. Pas de responsive poussé (PRD §6) : layout conçu pour ≥ 1024 px de large ; en dessous, un message plein écran « RoomReveal est conçu pour un écran d'ordinateur » sans tentative d'adaptation `[ASSUMPTION : seuil 1024 px]`.

Une seule **Génération** vive à la fois, un utilisateur actif à la fois `[ASSUMPTION héritée PRD §11]`. Aucun compte, aucun historique : la Génération vit dans la session et les artefacts serveur sont purgés après 24 h (NFR-4 `[ASSUMPTION héritée PRD §11]`).

## Information Architecture

Le produit **est** le Parcours : une seule vue, quatre étapes linéaires, un stepper permanent (FR-13). Pas de navigation secondaire.

| Surface | Atteinte depuis | Rôle | Porte |
|---|---|---|---|
| Accueil / Upload (étape 1) | Ouverture de l'app ; « Nouvelle Génération » | Déposer la photo, la valider, la préparer | FR-1, FR-2, FR-3 |
| Masque (étape 2) | Upload réussi ; retour depuis Pièce vide | Vérifier la Détection, corriger le Masque au pinceau/gomme, le valider | FR-4, FR-5, FR-6, FR-7, FR-16 |
| Pièce vide (étape 3) | Masque validé ; retour depuis Vidéo | Juger l'Inpainting, régénérer si besoin, lancer la vidéo | FR-8, FR-9 |
| Vidéo / Révélation (étape 4) | Génération FLF terminée | Prévisualiser la Révélation, télécharger le MP4, recommencer | FR-10, FR-11, FR-12 |
| — Transverse : Stepper du Parcours | Toutes les étapes | Situer, revenir en arrière | FR-13, FR-15 |
| — Transverse : Panneau d'attente | Toute opération > 2 s | Rendre l'attente explicite et honnête | FR-14 |
| — Transverse : Bandeau d'erreur | Tout échec d'appel IA | Expliquer, relancer l'étape seule | FR-17 |

Closure : chacune des exigences FR-1 à FR-17 est portée par une surface ci-dessus ; chaque surface est traversée par le Flow 1 (UJ-1) ou par un flow d'exception (Flows 2–4). Les catégories de meubles détectées ne sont **exposées nulle part** dans l'architecture d'information — décision canonique.

Références visuelles : les étapes Masque et Vidéo sont mockées ([mockups/mock-etape-masque.html](mockups/mock-etape-masque.html), [mockups/mock-etape-video.html](mockups/mock-etape-video.html)) ; Accueil / Upload et Pièce vide se construisent depuis les spines seules (décision memlog).

## Voice and Tone

Microcopies. La posture de marque vit dans `DESIGN.md.Brand & Style`. Registre : honnête, calme, complice du « wow » — jamais technique, jamais culpabilisant. Vocabulaire du glossaire PRD obligatoire.

| À écrire | À ne pas écrire |
|---|---|
| « Déposez la photo de votre pièce meublée. JPEG ou PNG. » | « Uploadez un fichier image valide » |
| « Ce format n'est pas pris en charge. Utilisez une photo JPEG ou PNG. » (FR-1) | « Erreur : type MIME invalide » |
| « Cette image ne peut pas être utilisée. Essayez avec une autre photo. » (FR-3) | « Échec du traitement de l'image (code 422) » |
| « Voici le Masque : tout ce qui est surligné disparaîtra de la pièce. » | « Segmentation SAM 2 terminée » |
| « Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. » (FR-16) | « La détection a retourné 0 objet » |
| « Votre Révélation se prépare — comptez 1 à 3 minutes. » (FR-14) | « Traitement en cours… » avec spinner muet |
| « La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. » (FR-17) | « Timeout FLF2V », « Réessayer » sans contexte |
| « Un doute ? Régénérez : chaque Pièce vide est unique. » (FR-9) | « Résultat non déterministe » |
| « Vos meubles atterrissent exactement à leur place. » (succès, étape Vidéo) | « Génération FLF terminée avec succès » |
| Phrases courtes, tutoiement exclu, vouvoiement sobre. `[ASSUMPTION : vouvoiement]` | Emojis, exclamations, ton de coach |

## Component Patterns

Comportemental. Specs visuelles dans `DESIGN.md.Components`.

| Composant | Surface | Règles de comportement |
|---|---|---|
| Stepper du Parcours | Toutes | Étape courante + étapes accomplies identifiables d'un coup d'œil (FR-13). Étapes accomplies cliquables → retour arrière **sans perte** : la Photo originale, le Masque et la Pièce vide déjà produits sont conservés (FR-15). Revenir à Masque depuis Pièce vide restaure le Masque précédent tel quel. Étapes futures inertes. Retour limité à la Génération en cours `[ASSUMPTION héritée PRD §11]`. Avancer à nouveau depuis une étape antérieure invalide les artefacts en aval, après confirmation (`Dialog` shadcn) `[ASSUMPTION]`. |
| Zone d'upload | Accueil / Upload | Drag-and-drop + clic-parcourir. Validation immédiate côté client : format JPEG/PNG (FR-1), taille ≤ 20 Mo `[ASSUMPTION héritée PRD §11]`. Redimensionnement ≤ 1024 px silencieux — jamais mentionné à l'utilisateur (FR-2). Rejet = message dans la zone elle-même + réessai immédiat, jamais d'état sans issue (FR-3). Photo acceptée → passage automatique à l'étape Masque, Détection lancée. |
| Canvas du Masque | Masque | Overlay `{components.canvas-masque.overlay}` sur la Photo originale (FR-5). Pinceau = ajouter au Masque, gomme = retirer, effet **immédiat au trait** (FR-6). Zoom molette (100–400 %) + pan (barre espace + drag) pour l'édition fine `[ASSUMPTION : nécessaire pour corriger un tapis au pixel, non couvert par les sources]`. Le Masque validé part tel quel à l'Inpainting — aucune re-détection, aucune altération (FR-7). |
| Barre d'outils du Masque | Masque | Pinceau/gomme mutuellement exclusifs ; taille réglable au `Slider` (4–128 px) `[ASSUMPTION : bornes]`. Annuler/rétablir par coups de pinceau, historique 20 actions `[ASSUMPTION]`. Aucune liste de catégories, aucun toggle par objet — décision canonique. |
| Cartes de comparaison | Pièce vide | « Photo originale » et « Pièce vide » côte à côte, même taille, jamais l'une sans l'autre `[ASSUMPTION : côte à côte plutôt que slider — plus lisible pour juger « aucun meuble résiduel » (FR-8)]`. Clic sur une carte → plein écran (`Dialog`). |
| Bouton « Régénérer » | Pièce vide | Relance l'Inpainting avec le **même Masque validé**, sans repasser par les étapes précédentes (FR-9). Illimité en v1 `[ASSUMPTION héritée PRD §11]`. Le nouveau résultat **remplace** l'ancien — pas d'historique de versions `[ASSUMPTION]`. Bouton secondaire ; le Bouton de Génération (« Créer ma vidéo ») reste la seule action d'or. |
| Lecteur de la Révélation | Vidéo | Lecture automatique au premier affichage — la Révélation EST le climax `[ASSUMPTION : autoplay]`. Lecture/pause + relecture (FR-11). « Télécharger le MP4 » → fichier lisible dans VLC, QuickTime, lecteur natif (FR-12). « Nouvelle Génération » affiché en permanence sous le lecteur, aux côtés de « Revoir » et « Télécharger le MP4 » (ordre canonique dans `DESIGN.md.Components`) `[ASSUMPTION : aucun écran de fin dans les sources]`. Durée ~5 s et preset uniques, **non exposés ni configurables** dans l'UI `[ASSUMPTION héritée PRD §11]`. |
| Panneau d'attente | Transverse | Voir « Attente & Progression ». |
| Bandeau d'erreur | Transverse | Un message compréhensible + **une seule action : relancer l'étape concernée** (FR-17). Jamais de trace technique. Les artefacts acquis restent visibles derrière le bandeau. |
| Bouton de Génération | Chaque étape | L'action d'or unique de la surface : « Valider le Masque » (étape 2), « Créer ma vidéo » (étape 3), « Télécharger le MP4 » (étape 4). Désactivé tant que la précondition n'est pas remplie (ex. Masque entièrement vide → désactivé avec tooltip « Peignez au moins une zone ») `[ASSUMPTION]`. |

## State Patterns

| État | Surface | Traitement |
|---|---|---|
| Vide (première visite) | Accueil / Upload | La Zone d'upload est l'écran. Une ligne de promesse au-dessus : « Une photo. Une pièce qui se meuble toute seule. » `[ASSUMPTION : landing minimale — les sources ne spécifient rien avant l'upload, mais SM-3 exige la réussite du premier coup]`. |
| Chargement court (< 2 s) | Toutes | Skeleton ou état désactivé du contrôle concerné. Aucune opération > 2 s sans indicateur (FR-14). |
| Chargement moyen (2 s – ~30 s : Détection, Inpainting) | Masque, Pièce vide | Panneau d'attente : barre + phase nommée (« Détection des meubles… », « Génération de la Pièce vide… »). Pas de durée annoncée `[ASSUMPTION : durées non spécifiées pour ces étapes]`. |
| Attente longue (1–3 min : Génération FLF) | Vidéo | Panneau d'attente complet — voir « Attente & Progression ». Annonce explicite « 1 à 3 minutes » **avant** le lancement (sur le bouton ou à côté) et pendant (FR-14). |
| Erreur d'upload | Accueil / Upload | Message dans la Zone d'upload (formats FR-1, image inexploitable FR-3, taille), réessai immédiat. |
| Aucun meuble détecté | Masque | Pas un échec : Bandeau d'erreur en variante neutre (accent `{colors.texte-secondaire}` au lieu de `{colors.erreur}`) `[ASSUMPTION : variante info]` — « Aucun meuble détecté » + bascule directe en mode pinceau, Masque vierge, Parcours praticable jusqu'au bout (FR-16). |
| Échec / timeout d'appel IA | Masque, Pièce vide, Vidéo | Bandeau d'erreur + relance de **l'étape seule**. Un timeout vidéo conserve la Pièce vide et le Masque — jamais de retour à zéro (FR-17). |
| Succès (Révélation prête) | Vidéo | Autoplay + lueur or (`DESIGN.md.Elevation & Depth`), stepper 4/4 coché. Pas de confetti, pas de toast — la vidéo est la célébration. |
| Rafraîchissement / fermeture pendant une Génération | Toutes | `beforeunload` : « Votre Génération en cours sera perdue. » Après rechargement, retour à l'Accueil — pas de reprise en v1 `[ASSUMPTION : non couvert par les sources]`. |

## Attente & Progression

Section inventée : SM-C1 interdit de sacrifier la cohérence à la vitesse — on conçoit **pour** l'attente, pas contre elle.

- **Honnêteté d'abord** : la durée « 1 à 3 minutes » est annoncée avant le clic (FR-14). Le bouton « Créer ma vidéo » porte en sous-texte « 1 à 3 minutes de génération ».
- **Progression** : pas de pourcentage réel disponible côté modèles → barre de progression **par phases nommées** (« Envoi de vos images » → « Génération de la Révélation » → « Finalisation ») + temps écoulé affiché (« 1 min 12 s ») `[ASSUMPTION : phases + temps écoulé plutôt que faux pourcentage]`. La barre ne recule jamais et n'atteint 100 % qu'à la vidéo reçue.
- **Occuper l'attente** : sous la barre, les cartes « Photo originale / Pièce vide » restent affichées — l'utilisateur contemple l'avant/après pendant que la vidéo se fabrique `[ASSUMPTION]`.
- **Rester, pas partir** : l'attente se vit sur place ; quitter l'étape pendant la génération vidéo n'est pas proposé `[ASSUMPTION : les sources ne couvrent pas la navigation pendant l'attente]`.
- **Au-delà de 3 minutes** : à 3 min 30 s sans réponse, le panneau ajoute « C'est plus long que prévu — encore quelques instants » ; au timeout technique, bascule en Bandeau d'erreur FR-17 `[ASSUMPTION : seuil]`.

## Cycle de vie de la Génération

Section inventée : la Génération (upload → téléchargement) est l'unité de vie du produit.

- Une Génération naît à l'upload accepté et meurt : au téléchargement + « Nouvelle Génération », au rafraîchissement de la page, ou à la purge serveur 24 h (NFR-4 `[ASSUMPTION héritée PRD §11]`).
- « Nouvelle Génération » (depuis l'étape Vidéo, ou depuis le stepper via retour à l'étape 1) repart d'une Zone d'upload vierge après confirmation si une Révélation non téléchargée existe `[ASSUMPTION]`.
- Rassurance confidentialité : une ligne discrète en pied de page — « Vos photos sont supprimées automatiquement après 24 heures. » `[ASSUMPTION : mention UI non spécifiée, dérivée de NFR-4]`.

## Interaction Primitives

- **Clic** : action principale partout. Un non-technicien complète le Parcours à la souris seule (NFR-3, SM-3) — aucun raccourci n'est nécessaire, tous sont des bonus.
- **Drag** : peindre/gommer le Masque (bouton gauche maintenu) ; déposer un fichier sur la Zone d'upload ; pan du canvas (barre espace + drag) `[ASSUMPTION]`.
- **Molette** : zoom du Canvas du Masque, centré sur le curseur `[ASSUMPTION]`.
- **Raccourcis** (étape Masque uniquement) : `B` pinceau, `E` gomme, `[` / `]` taille, `Ctrl+Z` / `Ctrl+Shift+Z` annuler/rétablir `[ASSUMPTION : convention des éditeurs d'image]`. `Espace` lecture/pause sur le Lecteur de la Révélation.
- **Bannis** : double-clic porteur de sens, hover-only (toute action au survol a un équivalent clic), modales empilées > 1 niveau, scroll-jacking, toute interaction pendant laquelle l'UI se fige.

## Accessibility Floor

Plancher pragmatique MVP (décision memlog) — comportemental ; les contrastes vivent dans `DESIGN.md.Colors`.

- **Focus visible** partout : ring shadcn hérité, jamais supprimé.
- **Clavier** : le Parcours complet est traversable au clavier — `Tab` suit l'ordre de lecture, le Stepper du Parcours et tous les boutons sont focusables et activables à `Entrée`/`Espace`. L'édition fine du Masque au clavier n'est **pas** couverte en v1 `[ASSUMPTION : hors plancher MVP — le pinceau reste souris]`.
- **Alternatives textuelles** : Photo originale (« Votre photo : {nom de fichier} »), Pièce vide (« Pièce vide générée »), Révélation (« Vidéo de révélation de votre pièce ») ; boutons-icônes (pinceau, gomme, lecture) labellisés.
- **Jamais la couleur seule** : l'overlay du Masque a un contour plein (`{components.canvas-masque.contour}`) ; les étapes du stepper combinent coche + position + label ; les erreurs combinent filet coloré + texte.
- **Annonces** : changements d'étape et fin d'attente annoncés via `aria-live="polite"` ; erreurs via `aria-live="assertive"`.
- Pas de conformité formelle WCAG visée en v1 (outil interne).

## Key Flows

### Flow 1 — UJ-1 : « Claire crée sa vidéo de révélation pendant sa pause déjeuner » (flow principal)

Claire, agente immobilière sans compétence technique, photo JPEG d'un salon meublé pour une annonce.

1. Claire ouvre la web app — aucune authentification. L'Accueil est une Zone d'upload et une promesse d'une ligne.
2. Elle glisse sa photo JPEG. Validation silencieuse (format, taille, resize ≤ 1024 px — FR-1/2/3) ; le stepper passe à l'étape Masque, le Panneau d'attente nomme « Détection des meubles… ».
3. Le Masque apparaît en overlay fuchsia sur sa photo (FR-4/5). Canapé, table, lampe sont couverts — mais un tapis a été oublié. Elle prend le pinceau, ajuste la taille, **corrige au pinceau le tapis oublié** ; le trait se voit immédiatement (FR-6). Elle clique « Valider le Masque » (FR-7).
4. Étape Pièce vide : Panneau d'attente « Génération de la Pièce vide… », puis les Cartes de comparaison s'affichent. La pièce vide lui convient (sinon : « Régénérer », FR-9). Le sous-texte du bouton d'or annonce « 1 à 3 minutes ».
5. Elle clique « Créer ma vidéo ». Panneau d'attente : phases nommées, temps écoulé, avant/après contemplable (FR-14).
6. **Climax — la Révélation.** La vidéo se lance seule dans le Lecteur de la Révélation, lueur or autour du cadre : la pièce apparaît vide, puis ses meubles flottent depuis les côtés et le plafond et **atterrissent exactement à leur place**, au pixel près (FR-10). Le salon de son annonce, mais en spectacle. C'est l'effet « wow » qui la rend fière de publier.
7. Elle revoit le clip (FR-11), clique « Télécharger le MP4 » (FR-12). Durée totale : moins de 4 minutes (NFR-1). « Nouvelle Génération » l'attend si elle a une deuxième photo.

Échec en route : n'importe quel appel IA qui échoue → Flow 3.

### Flow 2 — Aucun meuble détecté (exception, FR-16)

1. Un collègue de Claire teste avec la photo d'une pièce déjà vide.
2. Après la Détection, l'étape Masque affiche le bandeau neutre : « Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. » Le pinceau est pré-activé, le Masque est vierge.
3. Deux issues : il peint des zones (objets non reconnus) et poursuit le Parcours normalement ; ou il ne peint rien — « Valider le Masque » reste désactivé avec tooltip, et il peut revenir à l'étape Upload pour changer de photo. Jamais d'état sans issue.

### Flow 3 — Échec ou timeout de la Génération vidéo (exception, FR-17)

1. Claire a lancé sa vidéo ; à 3 min 30 s le panneau prévient que c'est plus long que prévu ; l'appel finit en timeout.
2. Bandeau d'erreur : « La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. » Une seule action : « Relancer la vidéo ».
3. Le stepper reste sur l'étape Vidéo, les Cartes de comparaison restent visibles : rien n'est perdu, aucun retour au début du Parcours.
4. Elle relance ; seule la Génération FLF repart. Même patron pour un échec de Détection (relance depuis l'upload conservé) ou d'Inpainting (relance avec le Masque validé conservé).

### Flow 4 — Régénérations en boucle (exception, FR-9)

1. Un home stager exigeant trouve un reflet étrange sur le mur de sa Pièce vide.
2. « Régénérer » : même Masque validé, nouvel Inpainting, le résultat remplace l'ancien. Microcopie : « Un doute ? Régénérez : chaque Pièce vide est unique. »
3. Il régénère trois fois (illimité), et remarque un meuble résiduel : il clique « Masque » dans le stepper — son Masque précédent est là, intact (FR-15). Il élargit la zone à la gomme près du meuble, revalide, obtient une Pièce vide propre.
4. Le Parcours reprend à Pièce vide sans avoir jamais ré-uploadé quoi que ce soit.

## Open Questions

1. **Résolution et ratio de sortie** — non spécifiés (480p/720p = décision Architect). Le 16:9 horizontal est supposé ; la cible « réseaux sociaux » posera la question du vertical (v2).
2. **Nom du produit** — « RoomReveal » est un titre de travail à confirmer ; les microcopies l'évitent volontairement.
3. **Reprise après rafraîchissement** — la v1 assume la perte (voir State Patterns) ; si les tests SM-3/SM-4 montrent des pertes fréquentes pendant l'attente 1–3 min, une reprise par identifiant de Génération serait à spécifier.
4. **Exemple de résultat sur l'Accueil** — une Révélation d'exemple en boucle aiderait SM-3 (« du premier coup ») mais exige un asset produit qui n'existe pas encore ; non tranché.
5. **Seuil exact du message « écran trop petit »** — 1024 px posé par hypothèse ; à valider contre les écrans réels des agents.
