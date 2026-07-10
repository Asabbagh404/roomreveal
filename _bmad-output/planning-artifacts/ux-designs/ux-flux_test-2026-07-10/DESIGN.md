---
name: RoomReveal
description: Web app desktop qui transforme une photo de pièce meublée en vidéo de Révélation cinématique. shadcn/ui (React + Tailwind, mode dark) ; ce DESIGN.md ne spécifie que le delta de marque.
status: final
updated: 2026-07-10
colors:
  # Mode sombre unique — pas de mode clair en v1. [ASSUMPTION : aucune identité
  # visuelle dans les sources ; toute la palette est une création taguée ASSUMPTION,
  # dérivée de la décision canonique « sombre cinématique ».]
  # Tous les tokens non listés (input, ring, popover, destructive, etc.)
  # héritent des défauts dark de shadcn/ui.
  fond-projection: '#0B0D12'
  surface-carte: '#141821'
  surface-elevee: '#1B2130'
  texte-principal: '#EDEFF4'
  texte-secondaire: '#98A2B3'
  bordure: '#252C3B'
  or-lumineux: '#F2C14E'
  or-lumineux-foreground: '#1A1305'
  masque-overlay: '#FF2E9E'
  masque-contour: '#FF7AC2'
  succes: '#3DDC97'
  erreur: '#F87171'
typography:
  # Corps, labels et texte atténué héritent de la ramp shadcn (Geist Sans).
  # [ASSUMPTION : aucune typo dans les sources — Geist Sans partout, le
  # caractère cinématique vient du tracking, pas d'une fonte d'apparat.]
  display:
    fontFamily: 'Geist Sans'
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  carton-titre:
    fontFamily: 'Geist Sans'
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.12em
  attente:
    fontFamily: 'Geist Sans'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
rounded:
  # Défauts shadcn conservés (sm/md). Seul ajout : lg pour les cadres média.
  # [ASSUMPTION]
  lg: 12px
spacing:
  # Échelle Tailwind héritée telle quelle ; un seul token nommé.
  scene-gap: 48px
components:
  stepper-parcours:
    etape-active-fond: '{colors.or-lumineux}'
    etape-active-texte: '{colors.or-lumineux-foreground}'
    etape-accomplie-texte: '{colors.texte-principal}'
    etape-future-texte: '{colors.texte-secondaire}'
    connecteur: '{colors.bordure}'
    label: '{typography.carton-titre}'
  zone-upload:
    fond: '{colors.surface-carte}'
    bordure: '{colors.bordure}'
    bordure-survol: '{colors.or-lumineux}'
    radius: '{rounded.lg}'
  canvas-masque:
    overlay: '{colors.masque-overlay}'
    contour: '{colors.masque-contour}'
    cadre: '{colors.bordure}'
    radius: '{rounded.lg}'
  barre-outils-masque:
    fond: '{colors.surface-elevee}'
    outil-actif-fond: '{colors.or-lumineux}'
    outil-actif-icone: '{colors.or-lumineux-foreground}'
    outil-inactif-icone: '{colors.texte-secondaire}'
  carte-comparaison:
    fond: '{colors.surface-carte}'
    legende: '{typography.carton-titre}'
    radius: '{rounded.lg}'
  lecteur-revelation:
    cadre: '{colors.bordure}'
    controles: '{colors.texte-principal}'
    radius: '{rounded.lg}'
  panneau-attente:
    fond: '{colors.surface-elevee}'
    barre: '{colors.or-lumineux}'
    texte: '{typography.attente}'
    radius: '{rounded.lg}'
  bandeau-erreur:
    fond: '{colors.surface-elevee}'
    accent: '{colors.erreur}'
    texte: '{colors.texte-principal}'
  bouton-generation:
    fond: '{colors.or-lumineux}'
    texte: '{colors.or-lumineux-foreground}'
    radius: '{rounded.lg}'
---

# RoomReveal — DESIGN.md

> Socle : shadcn/ui en mode dark. Ce document ne spécifie que le delta de marque ; tout token non listé hérite de shadcn. En cas de conflit avec un mockup, un import ou tout autre visuel, **ce document et EXPERIENCE.md font foi**.

## Brand & Style

RoomReveal est une salle de projection, pas un tableau de bord. La promesse produit — une Révélation cinématique où les meubles flottent et atterrissent exactement à leur place — impose la posture visuelle : **la photo de l'utilisateur est la star, l'UI s'efface**. Le fond est sombre comme une salle obscure ; l'interface est le cadre discret autour de l'écran ; le seul éclat chromatique est un or lumineux qui signale la Génération et la Révélation — le faisceau du projecteur.

Le registre cible est « premium », « cinématique », « wow » (brief + PRD §2.1), pour un public immobilier haut de gamme sans compétence technique. Cela se traduit par : sobriété absolue du chrome, contrastes nets, un seul moment de couleur par surface, et jamais de décoration qui concurrence la photo. RoomReveal hérite de shadcn/ui en dark mode et ne s'en écarte que sur : le fond (plus profond que le dark shadcn), l'accent or, la couleur d'overlay du Masque, et une poignée de composants propres au Parcours. Personnaliser le reste de shadcn va à l'encontre de la discipline de marque.

`[ASSUMPTION : les sources ne contiennent aucune couleur, typo, logo ni moodboard (extraction §7) — l'intégralité de cette identité est une traduction de la décision « sombre cinématique » du memlog.]`

## Colors

La palette est trois idées : la salle obscure, le projecteur, le Masque.

- **Fond projection (`{colors.fond-projection}`)** — le canvas de toute l'app. Un noir bleuté profond, plus sombre que le `background` dark de shadcn : la photo de l'utilisateur doit être la zone la plus lumineuse de l'écran, toujours. Remplace `background`.
- **Surface carte (`{colors.surface-carte}`)** et **surface élevée (`{colors.surface-elevee}`)** — les deux tons de matière au-dessus du fond : cartes, panneaux, barres d'outils. La hiérarchie se fait au ton, pas à l'ombre.
- **Texte principal (`{colors.texte-principal}`)** / **texte secondaire (`{colors.texte-secondaire}`)** — blanc cassé froid et gris bleuté. Contraste ≥ 12:1 et ≥ 4.5:1 sur `{colors.fond-projection}` respectivement — plancher pragmatique MVP tenu sans effort par la palette. `[ASSUMPTION : ratios calculés sur la palette proposée, à re-vérifier si les hex bougent.]`
- **Or lumineux (`{colors.or-lumineux}`)** — l'unique accent de marque. Réservé aux actes de Génération : bouton d'action principal de chaque étape, étape active du stepper, barre de progression de l'attente, lueur autour de la Révélation qui se joue. Jamais pour du chrome, jamais décoratif, jamais pour un état neutre. L'or veut dire « la magie opère ici ». `[ASSUMPTION]`
- **Masque overlay (`{colors.masque-overlay}`)** — fuchsia saturé, affiché à **45 % d'opacité** sur la Photo originale, avec un contour plein 1,5 px en `{colors.masque-contour}`. Choix motivé par FR-5 (« contraste suffisant pour juger de sa précision ») : les photos d'intérieur sont dominées par des neutres chauds (bois, beige, blanc) et des verts de plantes ; le fuchsia n'existe pratiquement jamais dans une pièce meublée, il reste lisible sur tout écran desktop courant. Le contour plein garantit que la limite du Masque ne dépend pas de la couleur seule. `[ASSUMPTION : couleur et opacité — aucune spec source.]`
- **Succès (`{colors.succes}`)** / **erreur (`{colors.erreur}`)** — états système, usage texte + icône uniquement, jamais en aplat plein écran. `{colors.erreur}` ne remplace pas le `destructive` shadcn (boutons destructifs) ; il colore l'accent du bandeau d'erreur.

À éviter : gradients décoratifs, deuxième couleur d'accent, aplats de couleur derrière la photo.

## Typography

Geist Sans partout (héritage shadcn). Trois rôles ajoutés :

- **`display`** — titres d'étape (« Votre Masque », « Votre Pièce vide », « Votre Révélation »). 30px/600, tracking léger négatif. Un seul par surface.
- **`carton-titre`** — le rôle « carton de cinéma » : petites capitales trackées (0.12em) pour les labels du stepper, les légendes des cartes de comparaison et les libellés d'étape. C'est lui qui porte le caractère cinématique, pas une fonte d'apparat.
- **`attente`** — corps 16px confortable pour les messages du panneau d'attente : la phrase qu'on lit pendant 1 à 3 minutes mérite une taille de lecture, pas une taille de label.

Corps, boutons, formulaires : ramp shadcn inchangée. Pas d'italique, pas de serif, pas de fantaisie. `[ASSUMPTION : choix intégral, sources muettes.]`

## Layout & Spacing

Échelle Tailwind héritée. Un token nommé : **`{spacing.scene-gap}`** (48px) — l'espace minimal entre la « scène » (photo, canvas, lecteur) et tout chrome d'interface. La photo respire ; rien ne la colle.

Layout desktop : une colonne centrée, largeur de contenu max `max-w-5xl` (1024 px) pour que la photo occupe le maximum de largeur utile ; le stepper du Parcours en bandeau fixe en haut ; l'action principale de l'étape toujours sous la scène, alignée à droite. Pas de sidebar, pas de navigation secondaire : le Parcours est linéaire, le layout aussi. `[ASSUMPTION : max-width et placement — création UX.]`

## Elevation & Depth

Pas d'ombres portées comme hiérarchie : sur fond quasi noir, elles sont invisibles. La profondeur se fait par **ton** (fond → surface-carte → surface-elevee) et par une seule exception lumineuse : la scène active (canvas, lecteur) peut porter une **lueur douce** dérivée de `{colors.or-lumineux}` (blur large ≥ 40px, opacité ≤ 8 %) au moment de la Révélation uniquement — le halo du projecteur. Nulle part ailleurs. `[ASSUMPTION]`

## Shapes

Défauts shadcn pour les contrôles (sm/md). **`{rounded.lg}`** (12px) pour tous les cadres média — zone d'upload, canvas du Masque, cartes de comparaison, lecteur de la Révélation, panneau d'attente : les surfaces « écran de cinéma » partagent le même rayon, ce qui les identifie comme membres de la même famille. Pas de pilules sur les surfaces ; `full` réservé aux points d'étape du stepper.

## Components

Composants shadcn utilisés tels quels : `Button` (variantes secondary/outline/ghost/destructive), `Progress`, `Slider`, `Tooltip`, `Dialog`, `Toast`. Le contrat : ne pas les personnaliser.

Références visuelles : [mockups/mock-etape-masque.html](mockups/mock-etape-masque.html) (étape Masque) et [mockups/mock-etape-video.html](mockups/mock-etape-video.html) (étape Vidéo — états attente et Révélation). Mocks indicatifs ; les spines font foi.

Composants de marque (spec visuelle ici ; comportement dans EXPERIENCE.md) :

- **Stepper du Parcours** — bandeau horizontal 4 étapes : Upload → Masque → Pièce vide → Vidéo. Points ronds (radius `full`) reliés par un connecteur `{components.stepper-parcours.connecteur}`. Étape active : fond `{colors.or-lumineux}`, chiffre en `{colors.or-lumineux-foreground}`. Étapes accomplies : coche + label `{colors.texte-principal}`, cliquables. Étapes futures : `{colors.texte-secondaire}`, non cliquables. Labels en `{typography.carton-titre}`.
- **Zone d'upload** — grande carte `{rounded.lg}`, fond `{colors.surface-carte}`, bordure pointillée `{colors.bordure}` qui passe à `{colors.or-lumineux}` au survol/drag-over. Icône ligne fine + une phrase + les formats acceptés en `{colors.texte-secondaire}`. C'est la seule surface où l'app est vide de photo : elle a le droit d'être accueillante, pas bavarde.
- **Canvas du Masque** — la Photo originale plein cadre `{rounded.lg}`, overlay `{colors.masque-overlay}` à 45 % + contour `{colors.masque-contour}`. Le curseur est un cercle à la taille de l'outil. Aucune étiquette de catégorie sur les zones détectées — décision canonique : les catégories sont masquées, seul l'overlay compte.
- **Barre d'outils du Masque** — flottante sous le canvas, fond `{colors.surface-elevee}`. Deux boutons-icônes (pinceau, gomme) : actif = fond `{colors.or-lumineux}` / icône `{colors.or-lumineux-foreground}` ; inactif = icône `{colors.texte-secondaire}`. Slider shadcn pour la taille. Boutons annuler/rétablir en ghost.
- **Cartes de comparaison** — deux cartes côte à côte de même taille : « Photo originale » / « Pièce vide », légendes en `{typography.carton-titre}` sous l'image, fond `{colors.surface-carte}`. Aucune décoration : les deux images se comparent d'elles-mêmes.
- **Lecteur de la Révélation** — la vidéo plein cadre `{rounded.lg}`, contrôles sobres en `{colors.texte-principal}` sur fond semi-transparent, lueur or au premier lancement (voir Elevation & Depth). Sous le lecteur, trois actions dans cet ordre (la plus forte en dernier) : « Nouvelle Génération » (ghost), « Revoir » (outline), « Télécharger le MP4 » (style `{components.bouton-generation}`).
- **Panneau d'attente** — carte `{colors.surface-elevee}` centrée sur la scène : barre de progression `{colors.or-lumineux}`, message en `{typography.attente}`, durée annoncée en clair (« 1 à 3 minutes »), phase courante nommée. Jamais un spinner seul.
- **Bandeau d'erreur** — carte `{colors.surface-elevee}` avec filet gauche `{colors.erreur}` 3px, message en `{colors.texte-principal}` et un seul bouton d'action (relancer l'étape concernée). Pas de rouge plein écran, pas d'icône alarmiste géante : une erreur est une information, pas un drame.
- **Bouton de Génération** — le bouton primaire de chaque étape (« Valider le Masque », « Créer ma vidéo »…) : fond `{colors.or-lumineux}`, texte `{colors.or-lumineux-foreground}`, `{rounded.lg}`. Un seul par surface.

## Do's and Don'ts

| À faire | À éviter |
|---|---|
| La photo est l'élément le plus lumineux de l'écran — l'UI reste dans l'ombre | Aplats clairs, cartes blanches, tout ce qui concurrence la photo |
| Or `{colors.or-lumineux}` uniquement pour les actes de Génération | Or sur le chrome, les liens, les états neutres |
| Annoncer l'attente en toutes lettres (« 1 à 3 minutes ») avec progression | Spinner muet, pourcentage inventé, attente masquée (FR-14) |
| Vocabulaire du glossaire PRD : Masque, Pièce vide, Révélation, Parcours | Jargon technique : « inpainting », « segmentation », « FLF », « timeout » dans l'UI |
| Overlay Masque fuchsia + contour plein — lisible sans dépendre de la couleur seule | Overlay discret, transparent ou « esthétique » qui empêche de juger la précision |
| Un bouton d'or par surface, une action évidente | Deux actions primaires en concurrence sur la même étape |
| Erreurs en français, compréhensibles, avec l'action de relance | Trace technique brute, code d'erreur, ton culpabilisant (FR-17) |
