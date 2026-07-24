---
title: "Améliorations différées — découpe epics/stories RoomReveal"
status: todo
created: 2026-07-11
source: bmad-advanced-elicitation (Assumption Audit) sur epics.md
---

# Améliorations différées à appliquer à `epics.md`

Issues de l'audit d'hypothèses (Advanced Elicitation) du 2026-07-11. À traiter dans une passe ultérieure avant de démarrer le dev, ou lors du sprint planning.

## 1. Ajouter Story 1.5 — Spike pipeline fal de bout en bout `[priorité haute]`

**Pourquoi :** le choix du modèle FLF est une décision Architect au build ; l'arch note `[ASSUMPTION : le modèle FLF préserve le ratio d'entrée — à vérifier au build sur photo 4:3]`. Aujourd'hui ce risque (SM-1 + ratio AD-2) n'est levé qu'en Story 4.1, la dernière. Dé-risque A6 et A5.

**Proposition :** une story très tôt (fin Epic 1) enchaînant `detect → inpaint → video` sur 1–2 vraies photos (dont une 4:3) avec les modèles cibles (`sam-3`, `flux-pro/v1/fill`, `kling-video/o1`), sans UI raffinée, pour vérifier : mode FLF strict opérationnel, ratio préservé, COGS réel, temps de bout en bout. Résultat = go/no-go sur les modèles avant de construire l'UI.

## 2. Renforcer Story 4.1 — AC protocole de jugement humain (SM-1) `[priorité haute]`

**Pourquoi :** SM-1 (cohérence vidéo) repose sur un protocole de jugement humain, pas sur des tests automatisés (arch : « le pipeline étant non déterministe, SM-1 repose sur un protocole de jugement humain »). Aucune story n'inscrit ce protocole comme livrable.

**Proposition :** ajouter un AC — panel ≥ 10 photos de salons meublés réelles, 2 juges extérieurs au dev, Révélation jugée cohérente sur ≥ 7/10 (meubles flottants, positions finales exactes, pas d'artefact choquant).

## 3. Renforcer Story 2.3 — AC vérification pixel-exacte (SM-2) `[priorité moyenne]`

**Pourquoi :** SM-2 exige que le Masque édité soit respecté à 100 % par l'Inpainting. L'AC actuel décrit le comportement mais pas le test de vérification.

**Proposition :** ajouter un AC de vérification pixel — comparer le masque validé (PNG binaire) aux zones effectivement modifiées par l'inpainting : zéro pixel hors-masque altéré, tout pixel intra-masque candidat à l'effacement.

## 4. Clarifier Story 1.3 — cible de l'auto-avance `[priorité basse]`

**Pourquoi :** l'auto-avance Upload → Masque pointe vers une surface (Masque) qui n'existe qu'en Epic 2, rendant 1.3 « incomplète » en isolation (hypothèse A3).

**Proposition :** préciser dans l'AC que la cible est une surface placeholder jusqu'à l'Epic 2 (le stepper passe à 2/4, la surface Masque arrive en 2.1), ou déplacer l'acte d'auto-avance en Story 2.1.

## 5. Contrôle de mouvement explicite par masques/trajectoires — « approche B » `[différé — candidate epic, ajouté 2026-07-24]`

**Pourquoi :** en FLF pur (kling o1), le modèle ne reçoit que deux frames et du texte — aucun conditionnement spatial. Le morphing « feverish dream » persiste malgré la calibration des prompts (variantes benchées dans `prompts.ts`, samples dans `resultat/`). La Story 4.6 (prompt de mouvement piloté par les détections) est la réponse la moins chère ; si elle plafonne, la vraie solution est de **donner au modèle vidéo les masques par objet et leurs trajectoires** — « dire à l'IA exactement quoi bouger ». Anthony tient beaucoup à cette piste (conversation du 2026-07-24).

**Proposition :** remplacer/compléter le modèle vidéo par un modèle à contrôle de mouvement explicite (piste principale : Wan VACE ou équivalent trajectory/motion-brush disponible sur fal — à réévaluer au moment du chantier, l'offre évolue vite). Entrées : pièce vide + photo canonique + masques par instance + trajectoire d'entrée par objet (droite/gauche/plafond, dérivable de la même heuristique que 4.6). Prérequis déjà en place après 4.6 : le service `local-detect` connaît chaque instance (labels + boîtes ; les masques par instance existent dans `_segment_union` avant l'union — extension triviale du contrat). Contraintes : tout remplaçant doit satisfaire AD-1 (FLF strict : première ET dernière frame contraintes) et AD-2 (ratio préservé) — c'est le critère d'acceptation non négociable de la spine ; re-calibration complète à prévoir (qualité kling perdue), coût/5 s à comparer au 0,56 $ actuel (NFR-2). Dimensionnement : un epic court (spike modèle → adaptateur → calibration SM-1), pas une story.
