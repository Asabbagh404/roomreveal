---
title: "Réconciliation — Addendum du brief → PRD + Addendum PRD (RoomReveal)"
status: done
created: 2026-07-10
---

# Réconciliation documentaire — RoomReveal

**Source** : `_bmad-output/planning-artifacts/briefs/brief-flux_test-2026-07-10/addendum.md`
**Cibles** : `prds/prd-flux_test-2026-07-10/prd.md` et `prds/prd-flux_test-2026-07-10/addendum.md`
**Date de vérification** : 2026-07-10

## 1. Matrice de traçabilité F1–F8 → FR

| Source | Détail source | FR cible(s) | Détails préservés ? | Verdict |
|---|---|---|---|---|
| **F1** | Upload JPEG/PNG ; redimensionnement auto côté long ≤ 1024 px | FR-1 (formats JPEG/PNG, refus explicite des autres formats), FR-2 (côté long ≤ 1024 px, ratio préservé, sans intervention) | Formats ✔, 1024 px ✔, automatisme ✔ | ✅ Couvert |
| **F2** | Détection automatique des meubles par catégorie (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…) | FR-4 + glossaire §3 « Détection » | Liste des catégories reprise à l'identique dans le glossaire (canapé, chaise, table, lit, lampe, étagère, meuble bas, tapis, plante, TV…) ✔ ; catégorie nommée par zone ✔ | ✅ Couvert |
| **F3** | Segmentation précise avec masque affiché en overlay | FR-5 (overlay contrasté sur la Photo originale) ; précision de la segmentation portée par SAM 2 dans l'addendum PRD | Overlay ✔ ; « segmentation précise » traduite en conséquence testable (contraste, jugement de précision) + choix de modèle dans l'addendum ✔ | ✅ Couvert |
| **F4** | Édition manuelle du masque : pinceau ajouter / gomme retirer, taille réglable, avant validation | FR-6 (pinceau/gomme, taille d'outil réglable, effet immédiat) + FR-7 (le masque validé fait foi) | Pinceau ✔, gomme ✔, taille réglable ✔, « avant validation » ✔ ; FR-7 renforce même la source | ✅ Couvert (renforcé) |
| **F5** | Inpainting → image pièce vide, bouton « régénérer » | FR-8 (pièce vide, zones hors masque intactes), FR-9 (bouton régénérer, même masque, illimité en v1) | Inpainting ✔, bouton régénérer ✔ | ✅ Couvert |
| **F6** | Vidéo ~5 s / 24 fps, meubles flottants depuis côtés et plafond | FR-10 (~5 s, 24 fps, contrainte FLF, mouvement de flottement, preset « mix côtés + plafond ») + glossaire « Révélation » | ~5 s ✔, 24 fps ✔, flottement côtés + plafond ✔ (formalisé en preset unique v1) | ✅ Couvert |
| **F7** | Prévisualisation dans l'app + téléchargement MP4 | FR-11 (lecture/pause/relecture dans le navigateur), FR-12 (MP4 lisible dans lecteurs standards) | Préviz ✔, MP4 ✔ | ✅ Couvert |
| **F8** | Progression étape par étape (upload → masque → pièce vide → vidéo), états de chargement clairs (vidéo : 1 à 3 min) | FR-13 (progression 4 étapes visible), FR-14 (états de chargement explicites, « 1 à 3 minutes » annoncées, indicateur dès 2 s) | Ordre des 4 étapes ✔, 1–3 min ✔ | ✅ Couvert |

**Conclusion F1–F8 : les 8 exigences source sont tracées, sans perte de détail fonctionnel.** Le PRD ajoute même des exigences dérivées absentes de la numérotation source mais issues du même esprit (FR-3 rejet d'images inexploitables, FR-15 retour en arrière, FR-16/FR-17 robustesse).

## 2. Préférences techniques → Addendum PRD

| Élément source | Présent dans l'addendum PRD ? |
|---|---|
| fal.ai privilégié, Replicate en fallback documenté | ✅ Repris mot pour mot |
| Grounding DINO + prompt texte `"sofa. chair. table. bed. lamp. shelf. cabinet. rug. plant. tv."` | ✅ Prompt intégral repris |
| SAM 2 (segmentation) | ✅ |
| FLUX.2 Klein 4B en mode édition/inpainting | ✅ |
| Vidéo FLF : Wan 2.1 FLF2V, Kling FLF ou équivalent, « choisir le plus fiable au moment du build » | ✅ (relayé aussi en Question ouverte n°1 du PRD, décision Architect) |
| Prompts centralisés dans un fichier facilement éditable, pas dispersés dans le code | ✅ (« Contrainte d'organisation du code ») |
| Web app uniquement (pas de desktop / mobile natif) | ✅ Addendum PRD + PRD §2.2 et §6 (non-objectifs) + NFR-5 |
| Caractère « non contraignant — l'Architect tranche » | ✅ Titre de section identique |

**Conclusion : aucune perte.**

## 3. NFR source → PRD

| NFR source | Cible PRD | Verdict |
|---|---|---|
| Temps total < 4 min de bout en bout | NFR-1 (+ SM-4, + contre-métrique SM-C1) | ✅ |
| Coût par génération estimé et documenté dans le README (tarifs fal.ai) | NFR-2 (README, fourchette 0,30–1,25 $, renvoi addendum) + §7.1 + SM-5 + SM-C2 | ✅ |
| Robustesse : aucun meuble détecté / timeout API / image trop grande / échec génération vidéo | FR-16 (aucun meuble → fallback masque manuel), FR-17 (échec/timeout de tout appel IA, y compris vidéo, relance de l'étape seule), FR-3 (image trop grande/corrompue, limite 20 Mo) | ✅ Les 4 modes de dégradation sont couverts |
| UX : parcours 4 étapes, utilisable par un non-technicien sans aide | NFR-3 + FR-13 + SM-3 + UJ-1 | ✅ |
| Confidentialité : pas de stockage durable, purge après X heures (à définir) | NFR-4 : purge fixée à 24 h (hypothèse n°7, confirmée le 2026-07-10) ; politique définitive en Question ouverte n°2 | ✅ Le « X à définir » a été tranché et tracé |

**Conclusion : aucune perte.**

## 4. Invariant pipeline FLF

| Élément source | PRD | Verdict |
|---|---|---|
| Pipeline en 3 étapes : segmentation/détection → inpainting → génération FLF | §5 : (1) Détection → Masque ; (2) Inpainting → Pièce vide ; (3) Génération FLF. Ordre déclaré fixe. | ✅ |
| Première frame = pièce vide | §5, glossaire « Pièce vide », FR-10 (« première frame visuellement identique à la Pièce vide ») | ✅ |
| Dernière frame = photo originale meublée, intouchée | §5 (« jamais retouchée… position finale au pixel près »), glossaire « Photo originale », FR-10 | ✅ |
| Interpolation → meubles à leur position finale exacte, sans hallucination | §5 (« sans hallucination de position »), §1 Vision (« au pixel près ») | ✅ |
| « Sans le FLF, meubles au hasard, vidéo incohérente » | §5 : interdiction explicite de remplacer la Génération FLF par un image-to-video libre ; §1 : « sans lui, RoomReveal n'a pas de raison d'être » | ✅ |
| **« À préserver lors de la découpe en stories »** | §5 en-tête : « Section contractuelle pour la découpe en epics et stories — à préserver telle quelle » + « Conséquences non négociables pour le découpage aval » | ✅ Avertissement intégralement préservé et renforcé |

**Conclusion : invariant intégralement préservé.**

## 5. Paysage concurrentiel et coûts fal.ai

- **Paysage concurrentiel** : non dupliqué dans le PRD (choix assumé et déclaré en §0 : « l'analyse concurrentielle reste dans le brief »). L'addendum PRD référence explicitement le chemin de l'addendum du brief et conserve l'essentiel décisionnel (Home Design AI = concurrent le plus proche ; différenciateur = photo meublée unique / pipeline rétro-conçu). **Couvert par référence — pas de perte fonctionnelle.**
- **Coûts fal.ai** : Wan-2.1 FLF2V (0,20 $/480p, 0,40 $/720p) ✔ ; Kling O3/3.0 Pro/V3 4K ✔ ; Veo 3.1 (endpoint, prix non relevé) ✔ ; FLUX.1 [pro] Fill 0,05 $/MP et [dev] 0,035 $/MP ✔ ; COGS 0,30–1,25 $ ✔ ; mention « à rafraîchir au build » ✔.

## 6. Écarts identifiés (réels mais mineurs)

1. **FLUX Pro Erase omis** — la source mentionne « FLUX Pro Erase disponible pour suppression d'objets » dans les données de coût ; cette option n'apparaît pas dans l'addendum PRD alors que les autres lignes inpainting y sont reprises. Option pertinente pour l'Architect (alternative dédiée à l'effacement d'objets).
2. **Détail du tarif Kling perdu** — la source donne « ~0,084 $/s → ~0,42 $ pour 5 s (sans audio) » ; l'addendum PRD ne garde que « ~0,42 $ pour 5 s », perdant le tarif à la seconde et la précision « sans audio » (utile si la durée vidéo devient configurable en v2, cf. §7.2 du PRD).
3. **Décomposition du COGS perdue** — la source détaille « ~0,10 $ (déclutter) + 0,20–1,12 $ (vidéo 5 s) » ; l'addendum PRD ne conserve que le total 0,30–1,25 $. La ventilation par étape aiderait l'Architect à arbitrer modèle par modèle. La mention « marge confortable face aux abonnements concurrents 16–20 $/mois » n'est pas reprise non plus (jugée acceptable : le contexte concurrentiel vit dans le brief, référencé).

Aucun écart sur les exigences fonctionnelles (F1–F8), les NFR, les préférences techniques ni l'invariant FLF.

## 7. Verdict global

**Réconciliation quasi complète.** Toute l'information contractuelle (F1–F8, NFR, préférences techniques, invariant FLF avec son avertissement de découpe) est tracée sans perte. Les seuls écarts sont trois détails de données de coût fal.ai dans l'addendum PRD (FLUX Pro Erase, tarif Kling à la seconde / « sans audio », ventilation du COGS) — recommandation : les réintégrer dans la section « Données de coût fal.ai » de l'addendum PRD avant le workflow architecture.
