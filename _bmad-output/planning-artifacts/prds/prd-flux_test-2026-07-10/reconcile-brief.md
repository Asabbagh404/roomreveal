---
title: "Réconciliation Brief → PRD — RoomReveal"
status: done
created: 2026-07-10
source: ../../briefs/brief-flux_test-2026-07-10/brief.md
targets:
  - ./prd.md
  - ./addendum.md
---

# Réconciliation documentaire : brief → PRD + addendum

**Objectif** : vérifier qu'aucune idée du brief RoomReveal (2026-07-10) n'a été perdue lors de la transformation en PRD. Rappel du contrat documenté en §0 du PRD : *« la justification marché et l'analyse concurrentielle restent dans le brief »* — les éléments purement marché sont donc considérés **hors périmètre légitime** (verdict « OK — brief »).

**Légende des verdicts** :
- ✅ **Couvert** — l'idée est présente (souvent renforcée) dans le PRD ou l'addendum.
- 📄 **OK — brief** — justification marché/concurrentielle, volontairement laissée dans le brief (conforme §0 du PRD).
- ⚠️ **Affaibli** — l'idée existe mais a perdu une nuance en route.
- ❌ **Perdu** — l'idée n'apparaît dans aucune cible et n'est pas légitimement hors périmètre.

---

## 1. Résumé exécutif

| Élément source | Couverture | Verdict |
|---|---|---|
| Photo de pièce meublée → vidéo cinématique de révélation (pièce vide puis meubles flottants côtés + plafond, position réelle exacte) | PRD §1 (vision, reprise quasi mot à mot), FR-10, §5 (invariant) | ✅ Couvert |
| « En moins de quatre minutes » | NFR-1, SM-4 | ✅ Couvert |
| Visuel « premium », prêt à publier | PRD §1 (« clip MP4 premium, prêt à montrer ou à publier »), §2.1 émotionnel | ✅ Couvert |
| Destination « annonce ou réseaux sociaux » | PRD §2.1 mentionne « photo d'annonce » ; les réseaux sociaux du brief ne sont plus cités comme canal de publication | ⚠️ Affaibli (mineur — la v1 interne ne change rien au produit, mais le canal social disparaît du cadrage) |
| Marché du virtual staging saturé d'images fixes, service banalisé (0,12–0,30 $/image), acteurs établis sans vidéo | PRD §0 renvoie explicitement au brief pour la justification marché ; PRD §1 en garde l'essence (« images fixes banalisées » vs « mouvement crédible ») | 📄 OK — brief |
| Génération « à l'envers », contrainte first/last frame, garantie d'atterrissage exact | PRD §1, §3 (glossaire Génération FLF), §5 | ✅ Couvert (renforcé : section contractuelle) |
| Partir d'une **seule photo meublée** (vs concurrents exigeant deux images) | PRD §2.1 (« à partir d'une seule photo »), addendum §Contexte concurrentiel | ✅ Couvert |

## 2. Le problème

| Élément source | Couverture | Verdict |
|---|---|---|
| Agents immobiliers / home stagers en quête d'attention sur des flux saturés | PRD §2.1 JTBD (fonctionnel + émotionnel), UJ-1 (persona Claire) | ✅ Couvert |
| Alternatives actuelles : vidéaste, photos retouchées, staging virtuel statique | Justification marché — reste dans le brief | 📄 OK — brief |
| **Particuliers en déménagement** : besoin de projection (voir un espace sans mobilier) | Absent du PRD §2 (ni cible, ni non-utilisateur) | ❌ Perdu (voir écart E1) |
| **Architectes d'intérieur** : même besoin de projection | Absent du PRD §2 (voir aussi §4 audience) | ❌ Perdu (voir écart E1) |
| Coût du statu quo : annonces interchangeables, pas d'effet « wow », retouche manuelle longue et technique | Effet « wow » repris en PRD §2.1 (JTBD émotionnel) ; le reste = justification marché | ✅ Couvert / 📄 OK — brief |

## 3. La solution (parcours en 4 étapes)

| Élément source | Couverture | Verdict |
|---|---|---|
| Parcours complétable seul par un non-technique | NFR-3, SM-3, UJ-1 | ✅ Couvert |
| Étape 1 — Upload JPEG/PNG, redimensionnement automatique | FR-1, FR-2 (précisé : côté long ≤ 1024 px, ratio préservé) | ✅ Couvert (précisé) |
| Étape 2 — Détection + segmentation par catégorie, affinage pinceau/gomme | FR-4, FR-5, FR-6, FR-7 | ✅ Couvert (renforcé : FR-7 « le masque validé fait foi ») |
| Étape 3 — Inpainting + bouton « régénérer » | FR-8, FR-9 (précisé : régénérations illimitées en v1, hypothèse confirmée §11.3) | ✅ Couvert (précisé) |
| Étape 4 — Clip ~5 s, 24 fps, prévisualisation in-app, téléchargement MP4 | FR-10, FR-11, FR-12 | ✅ Couvert |
| Progression visible à chaque étape, états de chargement clairs | FR-13, FR-14 | ✅ Couvert |
| Attente vidéo 1–3 min « assumée et expliquée » | FR-14 + §4.5 (« jamais masquée derrière un spinner muet ») | ✅ Couvert (renforcé) |

## 4. Ce qui rend RoomReveal différent

| Élément source | Couverture | Verdict |
|---|---|---|
| FLF = contrainte technique transformée en garantie visuelle ; interpolation pièce vide → photo originale | PRD §1, §3, §5 | ✅ Couvert |
| « Une génération vidéo libre produirait des incohérences » | PRD §5 (« aucune story ne doit remplacer la Génération FLF par une génération vidéo libre ») | ✅ Couvert (renforcé en interdit explicite) |
| **Invariant à préserver tel quel lors de la découpe epics/stories** | PRD §5 — section contractuelle dédiée, avec conséquences non négociables (photo originale jamais retouchée, ordre du pipeline fixe) | ✅ Couvert (renforcé) |
| Honnêteté concurrentielle : le concept générique existe déjà (Home Design AI, workflows DIY) | Addendum §Contexte concurrentiel (Home Design AI cité) + renvoi vers l'addendum du brief | ✅ Couvert |
| Différenciateur : partir d'une seule photo meublée | Addendum §Contexte concurrentiel + PRD §2.1 | ✅ Couvert |
| **Moat non technologique (modèles publics sur fal.ai) — moat de workflow et d'exécution : « packager ce pipeline en un clic pour un public non technique »** | L'addendum garde le fait concurrentiel mais pas la qualification du moat ; le PRD n'en parle pas | ⚠️ Affaibli (voir écart E4 — positionnement, arguablement du ressort du brief, mais cette nuance guide les arbitrages produit : la valeur est dans le packaging du parcours, pas dans les modèles) |
| Renvoi à l'analyse concurrentielle détaillée (addendum du brief) | Addendum PRD renvoie explicitement au même document | ✅ Couvert |

## 5. À qui ça s'adresse

| Élément source | Couverture | Verdict |
|---|---|---|
| Primaire : agents immobiliers et home stagers | UJ-1 (Claire, agente immobilière) ; home stagers non nommés mais assimilables | ✅ Couvert (les home stagers ne sont plus cités nommément — mineur) |
| Secondaire : **architectes d'intérieur, marques déco, créateurs de contenu** (usage ponctuel, projection / contenu spectaculaire) | Absent du PRD : §2.2 liste les non-utilisateurs, §2.1 ne parle que du cas annonce immobilière. L'audience secondaire n'est ni incluse ni explicitement exclue | ❌ Perdu (voir écart E1) |

## 6. Critères de succès

| Élément source | Couverture | Verdict |
|---|---|---|
| Vidéo cohérente : meubles flottants, positions finales exactes | SM-1 (+ FR-8, FR-10) | ✅ Couvert |
| Masque édité respecté par l'inpainting | SM-2, FR-7 | ✅ Couvert |
| Utilisateur non technique autonome | SM-3, NFR-3 | ✅ Couvert |
| Bout en bout < 4 minutes | SM-4, NFR-1 | ✅ Couvert |
| Coût unitaire connu, documenté dans le README | SM-5, NFR-2, §7.1 | ✅ Couvert |
| Coût « **raisonnable face aux offres concurrentes** » | NFR-2 = « mesuré et documenté » ; SM-C2 plafonne à ~1,25 $/Génération (issu du COGS addendum). La comparaison explicite aux offres concurrentes (0,12–0,30 $/image côté staging statique) a disparu des cibles | ⚠️ Affaibli (voir écart E3 — le plafond compense en partie, mais le référentiel « face aux concurrents » n'est plus un critère) |
| « À affiner par l'Architect au moment du build » | NFR-2 (« le choix final des modèles revient à l'Architect »), §10.1 | ✅ Couvert |

## 7. Périmètre

| Élément source | Couverture | Verdict |
|---|---|---|
| Dans v1 : parcours 4 étapes complet (F1–F8 du brief) | FR-1 à FR-15, §7.1 — remappé et enrichi (17 FR) | ✅ Couvert (enrichi) |
| Robustesse : aucun meuble détecté, timeout API, image trop grande, échec de génération | FR-3, FR-16 (fallback masque 100 % manuel), FR-17, §7.1 | ✅ Couvert (renforcé : fallback manuel explicite) |
| Hors v1 : comptes/auth, paiement/quotas, batch, édition avancée, mobile, génération vidéo/plan 3D | §6 — reprise intégrale, point par point | ✅ Couvert |
| Confidentialité : pas de stockage durable, purge après X h [ASSUMPTION 24 h] | NFR-4 (purge 24 h), hypothèse confirmée §11.7, question résiduelle §10.2 | ✅ Couvert (hypothèse levée) |

## 8. Questions ouvertes du brief

| Élément source | Couverture | Verdict |
|---|---|---|
| Modèle FLF précis sur fal.ai (dispo/prix au build, décision Architect) | §10.1 + addendum (candidats et prix mi-2026) | ✅ Couvert |
| Durée vidéo 3/5/8 s [ASSUMPTION 5 s] | FR-10 (5 s unique), §7.2 (choix de durée différé v2), §11.4 | ✅ Couvert (tranché) |
| Un ou plusieurs presets d'animation [ASSUMPTION mix côtés + plafond] | FR-10, §7.2 (presets multiples différés v2 + note PM), §11.4 | ✅ Couvert (tranché) |
| File d'attente multi-utilisateurs (si app publique) | §6 (non-objectif : un utilisateur actif à la fois), §11.6 | ✅ Couvert (tranché) |
| Politique de rétention exacte | NFR-4 (24 h fixe en v1) + §10.2 (à revoir si dépassement de l'usage interne) | ✅ Couvert |

## 9. Vision (v2+)

| Élément source | Couverture | Verdict |
|---|---|---|
| Presets d'animation multiples | §7.2 (différé v2, premier candidat si demandes) | ✅ Couvert |
| Traitement par lot pour les agences | §6 (non-objectif v1) et §2.2 (non-utilisateur v1) — mais uniquement comme exclusion, jamais comme direction v2 | ⚠️ Affaibli (l'exclusion est là, l'intention future a disparu) |
| **Intégration aux plateformes d'annonces** | Absent du PRD et de l'addendum | ❌ Perdu (voir écart E2) |
| **Déclinaison du pipeline FLF à d'autres transformations (avant/après rénovation, changement de style déco)** | Absent du PRD et de l'addendum | ❌ Perdu (voir écart E2) |
| Ambition : devenir « la brique révélation vidéo du marketing immobilier » | PRD §1 dit seulement « avant toute ambition d'ouverture publique » | ⚠️ Affaibli (voir écart E2) |

## 10. Divers (ton, exigences implicites)

| Élément source | Couverture | Verdict |
|---|---|---|
| Ton : attente honnête, pas de sur-promesse | PRD §4.5 (« linéaire, visible et honnête sur l'attente ») | ✅ Couvert |
| Photo originale = référence intouchée (implicite dans le brief : « position exacte ») | PRD §3 (glossaire) + §5 (« jamais retouchée ») | ✅ Couvert (explicité) |
| Préférences techniques (fal.ai, modèles, prompts centralisés) — présentes dans l'addendum du brief, référencées | Addendum PRD §Préférences techniques | ✅ Couvert |

---

## Synthèse des écarts réels

### E1 — Audience secondaire perdue (❌)
Le brief nomme deux populations au-delà des agents immobiliers : les **particuliers en déménagement** (§Problème) et le segment secondaire **architectes d'intérieur / marques déco / créateurs de contenu** (§À qui ça s'adresse). Le PRD §2 ne les mentionne ni comme cibles, ni comme non-utilisateurs assumés. Pour une v1 interne l'impact est faible, mais la conception UX (`bmad-ux`) travaillera sur la seule persona « agente immobilière » sans savoir que le besoin de « projection » (voir un espace sans mobilier, sans forcément vouloir la vidéo) existait dans le brief.
**Correctif suggéré** : une ligne en PRD §2.2 (« audience secondaire du brief — consciemment non adressée en v1 ») ou en §2.1.

### E2 — Vision v2 tronquée (❌ / ⚠️)
Le brief trace quatre directions v2 : presets multiples (✅ repris), batch agences (⚠️ seulement en exclusion), **intégration aux plateformes d'annonces** (❌) et **déclinaison du pipeline FLF à d'autres transformations** — avant/après rénovation, changement de style déco (❌). Ces deux dernières sont absentes des deux cibles. Or l'idée que le pipeline FLF est généralisable est une information d'**extensibilité** précieuse pour `bmad-architecture` (ne pas coder le pipeline en dur autour du seul cas « meubles »).
**Correctif suggéré** : 2–3 lignes « Perspectives v2 (non contractuelles) » en fin de PRD §7 ou dans l'addendum.

### E3 — Critère de coût affaibli (⚠️)
Le brief exige un coût « **raisonnable face aux offres concurrentes** ». Le PRD le traduit en « mesuré et documenté » (NFR-2, SM-5) avec un plafond ~1,25 $ (SM-C2). Le plafond joue le rôle de garde-fou, mais le référentiel concurrentiel explicite (staging statique à 0,12–0,30 $/image) a disparu ; « documenté » n'implique pas « raisonnable ».
**Correctif suggéré** : ancrer SM-C2 ou NFR-2 sur la comparaison concurrentielle du brief (une demi-phrase suffit).

### E4 — Nature du moat estompée (⚠️, à la marge du périmètre PRD)
Le brief qualifie le moat : **pas technologique** (modèles publics), mais **de workflow et d'exécution** — « packager ce pipeline en un clic pour un public non technique ». L'addendum PRD garde les faits (Home Design AI, photo unique) mais pas cette qualification. C'est du positionnement, donc défendable au titre du §0 ; néanmoins cette nuance oriente les arbitrages aval (investir dans la fluidité du parcours plutôt que dans la sophistication des modèles). Verdict : affaiblissement toléré mais signalé.

### Non-écarts notables (vérifiés conformes)
- L'invariant FLF est non seulement préservé mais durci (PRD §5, section contractuelle).
- L'honnêteté concurrentielle survit via l'addendum (Home Design AI cité, renvoi à l'analyse du brief).
- Toutes les hypothèses [ASSUMPTION] du brief sont tranchées et indexées (PRD §11).
- Tous les « hors v1 » et toutes les questions ouvertes du brief ont une destination identifiable.

**Bilan** : 2 idées perdues (audience secondaire ; extensions v2 du pipeline FLF), 2 nuances affaiblies (coût vs concurrence ; moat d'exécution), 1 affaiblissement mineur (canal réseaux sociaux). Aucune exigence fonctionnelle ni contrainte du brief n'a été perdue.
