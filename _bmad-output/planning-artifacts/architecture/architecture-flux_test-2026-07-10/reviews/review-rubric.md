---
type: architecture-review
lens: rubric
target: ../ARCHITECTURE-SPINE.md
project: RoomReveal
reviewer: Reviewer Gate — rubric walker
created: '2026-07-10'
verdict: >-
  APPROVE-WITH-CONDITIONS — spine dense et cohérente, les 8 trous adversariaux
  sont correctement fermés (AD-12/13/14 + resserrages vérifiés) ; aucun finding
  critique, mais 2 findings high (exposition du proxy de l'instance démo ;
  sémantique de « Régénérer » vs Révélation existante dans AD-11) à fermer
  avant la découpe en epics — chacun se ferme en une ou deux phrases.
---

# Revue rubric — Spine RoomReveal

**Méthode.** Passage systématique des 7 items de la checklist du Reviewer Gate, sources en main (PRD + addendum, EXPERIENCE.md, DESIGN.md), sans refaire le travail de la revue adversariale (AD-12/13/14 et resserrages AD-2/5/7/8 vérifiés comme intégrés — ils le sont, fidèlement et parfois mieux que le texte proposé, ex. AD-8 qui précise « l'UI ne pose jamais de chronomètre d'échec »).

**Bilan : 0 critique, 2 high, 5 medium, 4 low.**

---

## Verdict par item de checklist

| # | Item | Verdict | Findings |
|---|---|---|---|
| 1 | Points de divergence pour le niveau epics fixés, aucun manqué | **Presque** — un point résiduel réel (Régénérer vs Révélation existante) | H2, L1 |
| 2 | Rules applicables/vérifiables, Prevents réellement prévenus | **Oui, à une hypothèse non marquée près** (préservation du ratio par le modèle vidéo) | M4, L3 |
| 3 | Rien dans Deferred ne laisse deux unités diverger | **Presque** — chaque item différé pointe vers un point de décision unique, sauf que « Tests E2E » différé masque le silence total sur le reste de la stratégie de test | M2 |
| 4 | Cohérence interne | **Une tension** : le repli d'AD-9 contredit AD-3 et le seed | M3 |
| 5 | Toute dimension décidée / différée / question ouverte | **Deux silences** : CI/CD ; exposition réseau de l'instance démo | H1, M1 |
| 6 | Capability Map couvre FR-1..17, NFR-1..6 | **FR : complet. NFR : troué** (NFR-1/3/5 sans porteur nulle part) | M5 |
| 7 | Diagrammes mermaid valides et porteurs | **Porteurs, oui ; validité : un risque de parse** (`subgraph fal.ai` non quoté) | L4 |

Points forts à acter (pas des findings) : la frontière Blob/URL (« toute URL fal naît dans `pipeline/` »), le jeton d'époque AD-12, la double vie du Masque AD-13 et le contrat de sortie de `detect` (AD-5) forment ensemble un contrat de coutures qui rend les epics `state/`, `components/masque` et `pipeline/` réellement écrivables indépendamment. La décision AD-2 d'écarter le « 16:9 supposé » de l'UX est explicite et répond proprement à l'Open Question 1 d'EXPERIENCE.md. Le COGS (0,005 + 0,05 + 0,56 ≈ 0,62 $) est arithmétiquement correct et dans la cible NFR-2.

---

## Findings

### CRITICAL

Aucun.

### HIGH

**H1 — Le proxy fal de l'instance démo est un proxy ouvert sur la clé de facturation ; l'enveloppe d'exposition réseau est silencieuse.**
*Réf. : AD-4, Structural Seed (« instance démo auto-hébergée »), Deferred (« auth, quotas — hors périmètre »), checklist item 5.*
L'app n'a ni authentification (PRD §6, assumé) ni quota (Deferred, correctement adossé au PRD). Mais `@fal-ai/server-proxy` relaie vers fal ce que le client lui demande : quiconque atteint l'URL de l'instance démo peut invoquer **n'importe quel** endpoint fal aux frais de `FAL_KEY` — pas seulement les 3 modèles du produit. Le Deferred couvre auth/quotas comme *features produit* ; il ne couvre pas la question opérationnelle « qui peut atteindre l'instance démo ». Deux équipes divergeront : l'une déploie sur un VPS public « puisque pas d'auth par décision produit », l'autre suppose un réseau interne. C'est le seul endroit où le silence coûte de l'argent réel et expose la clé à l'épuisement.
**Recommandation :** une phrase dans Structural Seed ou une AD courte : « l'instance démo n'est jamais exposée publiquement (réseau interne / VPN / IP allowlist) ; à défaut, le proxy restreint les cibles aux 3 modèles de `pipeline/config.ts` + storage ». Le second membre est de toute façon un durcissement bon marché (le proxy custom de `@fal-ai/server-proxy` permet de filtrer la target URL).

**H2 — AD-11 ne dit pas ce que devient une Révélation existante quand l'utilisateur clique « Régénérer » (étape 3 après retour depuis l'étape 4).**
*Réf. : AD-11, AD-12 (jeton d'époque), UX Flow 4, checklist items 1 et 2.*
Chemin atteignable : Révélation produite → retour au stepper vers Pièce vide (AD-11 : « revenir en arrière conserve tous les artefacts » — la Révélation survit) → « Régénérer ». AD-11 dit seulement « “Régénérer” remplace la Pièce vide sans toucher au Masque » — silence total sur l'aval. Deux lectures conformes : (a) Régénérer **est** une invalidation AD-11 → incrémente l'époque, détruit la Révélation, le stepper repasse 3/4 ; (b) la Révélation survit jusqu'au prochain « avancer à nouveau » → l'état contient une Révélation dont la première frame ne correspond plus à la Pièce vide affichée, et le stepper montre l'étape 4 accomplie/atteignable. La lecture (b) recrée exactement le bug que le « Prevents » d'AD-12 annonce empêcher (Révélation incohérente avec la Pièce vide affichée — violation perçue d'AD-1), sans qu'aucun job périmé soit en cause. Le reducer et la surface Pièce vide seront écrits par des stories différentes : divergence garantie si la spine ne tranche pas.
**Recommandation :** compléter AD-11 : « “Régénérer” est une invalidation au sens de cette AD pour tout artefact aval de la Pièce vide : la Révélation existante est détruite, le jeton d'époque incrémenté » (ou la lecture inverse, mais l'écrire). Préciser au passage si la confirmation (`Dialog`) s'applique aussi à ce cas.

### MEDIUM

**M1 — CI/CD entièrement silencieux.**
*Réf. : checklist item 5 ; Structural Seed (environnements) ; aucune AD, aucune convention, aucun Deferred.*
Déploiement/environnements, infra, secrets, observabilité et sécurité applicative sont tous soit décidés (AD-4, AD-9, seed, conventions Logging/Config) soit différés avec justification. CI/CD est la seule dimension de l'enveloppe opérationnelle sans aucune trace : ni « pas de CI en v1 », ni pipeline minimal. Deux epics inventeront chacun leur réponse (l'un ajoute une GitHub Action lint+build, l'autre livre du Docker manuel).
**Recommandation :** une ligne, même « v1 : pas de CI — build Docker manuel, lint/typecheck locaux avant push » suffit ; l'important est que ce soit *dit*.

**M2 — Le Deferred « Tests E2E » masque le silence sur toute la stratégie de test.**
*Réf. : Deferred dernier item ; checklist items 3 et 5.*
Seul l'E2E est différé (à raison, avec justification SM-1). Mais rien n'est dit des tests unitaires/intégration : framework (Vitest ? Jest ?), doctrine de mock de fal (les adaptateurs passifs AD-12 et le reducer pur sont *conçus* pour être testables — la spine ne capitalise pas dessus), périmètre attendu. À la découpe, chaque epic peut choisir son harnais, et l'unification a posteriori est un rework transverse.
**Recommandation :** une convention : « tests unitaires au framework X ; le reducer se teste pur (aucun mock) ; les adaptateurs se mockent à la frontière AD-12 (`(inputs, {signal,onPhase})`) ; jamais de mock de `@fal-ai/client` hors de `pipeline/` ». La ligne « stratégie E2E décidée à la découpe » peut rester.

**M3 — Le repli d'AD-9 (« stockage local + purge cron ») contredit AD-3 et le seed.**
*Réf. : AD-9 `[ASSUMPTION … repli si faux : stockage local + purge cron]` vs AD-3 (« le serveur ne persiste rien — ni DB, ni session, ni fichier ») et seed (« hébergement serverless possible ») ; checklist item 4.*
L'assumption est correctement marquée, mais son plan B renverse un invariant structurant : fichiers serveur, cron, serveur à état, serverless exclu. Tel quel, une story « upload » qui découvre au build que le header d'expiration ne fonctionne pas appliquera le repli *localement*, en violation silencieuse d'AD-3 — pendant que les autres unités continuent de construire sur « serveur sans état ».
**Recommandation :** requalifier le repli : « si l'assumption tombe, ce n'est pas une décision locale — amendement de spine obligatoire (AD-3 et le seed sont impactés) ». Éventuellement mentionner l'alternative moins invasive à explorer d'abord (positionner l'expiration via appel storage explicite côté pipeline plutôt que header proxy).

**M4 — AD-2 repose sur une hypothèse non marquée : le modèle vidéo préserve le ratio d'entrée.**
*Réf. : AD-2 (« jamais de crop vers un 16:9 forcé … une photo 4:3 donne une vidéo 4:3 »), Stack (Kling O1) ; checklist item 2.*
AD-9 marque honnêtement son assumption ; AD-2 non. Or « la Révélation conserve le ratio de la photo canonique de bout en bout » n'est vérifiable que si Kling O1 (et **chaque repli** : wan 2.7, wan-flf2v) accepte des frames 4:3/3:4 et sort ce ratio. Si le modèle retenu force un ratio de sortie, AD-2 devient insatisfiable au build et chaque équipe improvisera (letterbox ? crop ? refus des photos non 16:9 à l'upload ?), trois réponses divergentes.
**Recommandation :** ajouter à AD-2 un marqueur du même régime qu'AD-9 : `[ASSUMPTION : le modèle FLF préserve le ratio d'entrée — critère d'acceptation du modèle au même titre que le mode FLF d'AD-1 ; à vérifier au build sur photo 4:3]`, et l'ajouter à la clause « tout repli doit satisfaire » de la ligne Stack (aujourd'hui seul AD-1 y figure).

**M5 — Capability Map : les FR sont tous couverts, mais NFR-1, NFR-3 et NFR-5 n'ont de porteur nulle part.**
*Réf. : Capability → Architecture Map ; frontmatter `binds: [FR-1..17, NFR-1..6]` ; checklist item 6.*
Vérification ligne à ligne : FR-1..17 tous mappés ✓ ; NFR-2 mappé ✓ ; NFR-4 non mappé mais gouverné par AD-9 ✓ ; NFR-6 non mappé mais dans les Conventions ✓. Restent : **NFR-1** (< 4 min bout en bout — implicitement porté par le choix Kling « queue 1–3 min » et les timeouts AD-8, mais jamais rattaché), **NFR-3** (utilisabilité — délégable à l'UX, mais alors le dire), **NFR-5** (Chrome/Firefox/Safari — totalement absent de la spine, alors que le canvas binaire sans anti-aliasing d'AD-7 et l'encodage `toBlob('image/jpeg', 0.92)` d'AD-2 sont précisément les endroits où Safari diverge de Chrome).
**Recommandation :** trois lignes dans la map : NFR-1 → Stack (latence modèle) + AD-8 (timeouts) ; NFR-3 → délégué aux spines UX (EXPERIENCE.md fait foi) ; NFR-5 → convention nouvelle « support = 3 navigateurs desktop d'EXPERIENCE.md ; les primitives canvas/encodage de `lib/` se vérifient sur les trois ».

### LOW

**L1 — La forme des champs de `generation` hors Masque est laissée à l'inférence.**
*Réf. : AD-13 (fixe `maskDraft` + `mask`), AD-5 (Blob jusqu'à la frontière, sortie de `detect` contractualisée), AD-8 (« photo canonique conservée ») ; checklist item 1.*
On *peut* dériver la réponse cohérente (photo canonique = Blob dans le reducer ; `emptyRoom` et `reveal` = URLs fal nées dans `pipeline/` ; entrées d'`inpaint`/`video` = mix Blob local + URL fal amont), mais seule la sortie de `detect` est écrite noir sur blanc. Le même soin d'une ligne pour les contrats d'entrée d'`inpaint` et `video` et pour les champs de `generation` fermerait le dernier interstice de la couture state↔pipeline.
**Recommandation :** une ligne dans AD-5 ou AD-13, ex. : `generation = { originalPhoto: Blob, maskDraft: buffer, mask: URL, emptyRoom: URL, reveal: URL }` ; `inpaint(photo: Blob, mask: URL)`, `video(emptyRoom: URL, photo: Blob)` (ou tout autre choix, mais écrit).

**L2 — Téléchargement du MP4 : l'attribut `download` est ignoré en cross-origin.**
*Réf. : AD-4 (GET direct permis), AD-9 (« jamais re-hébergé »), FR-12.*
`<a download>` vers une URL fal cross-origin navigue au lieu de télécharger. Une équipe qui bute dessus sera tentée d'ajouter une route serveur de téléchargement — violation d'AD-9. La solution conforme existe (fetch → Blob → objectURL, GET permis par AD-4) ; autant la nommer.
**Recommandation :** une parenthèse dans AD-4 ou AD-9 : « téléchargement MP4 = fetch client → Blob → objectURL ; jamais de route serveur de relais ».

**L3 — AD-14 « monotonie » vs relance d'étape : une relance repart légitimement à `uploading`.**
*Réf. : AD-14 (« le reducer refuse toute transition de phase régressive »), AD-8 (relance limitée à l'étape) ; checklist item 2.*
Lue strictement, la règle interdit la régression `generating → uploading` qu'impose toute relance FR-17 (et toute régénération FR-9). L'intention est claire (monotone *au sein d'une tentative*), mais c'est exactement le genre de lettre qu'une équipe applique au pied.
**Recommandation :** préciser « monotone par tentative (la relance/l'époque AD-12 réinitialise la phase) ».

**L4 — Mermaid : `subgraph fal.ai` non quoté dans le diagramme du Structural Seed.**
*Réf. : second diagramme mermaid ; checklist item 7.*
Le point dans un identifiant de subgraph non quoté est fragile selon les versions du parseur mermaid (les deux autres subgraphs à caractères spéciaux sont, eux, correctement quotés). Le premier diagramme (couches) est valide et exactement porteur ; le second est porteur (frontières navigateur/serveur/fal, TTL, tailles de body).
**Recommandation :** `subgraph "fal.ai"`. Optionnel : le Deferred « framerate » assume un écart vis-à-vis du FR-10 littéral (« 24 fps ») — c'est bien géré côté spine ; s'assurer seulement que la découpe en epics hérite du « ≥ 24 fps » et que l'amendement PRD proposé soit acté avant les stories vidéo.

---

## Synthèse

| Sév. | # | Trou | Remède |
|---|---|---|---|
| HIGH | H1 | Proxy démo ouvert / exposition réseau silencieuse | 1 phrase (réseau privé et/ou allowlist d'endpoints dans le proxy) |
| HIGH | H2 | « Régénérer » vs Révélation existante — AD-11 muette sur l'aval | compléter AD-11 (Régénérer = invalidation aval + époque) |
| MED | M1 | CI/CD silencieux | 1 ligne (même « pas de CI v1 ») |
| MED | M2 | Stratégie de test unitaire/mocks silencieuse | 1 convention (framework, mock à la frontière AD-12) |
| MED | M3 | Repli AD-9 contredit AD-3/seed | requalifier le repli en amendement de spine |
| MED | M4 | Hypothèse non marquée : le modèle vidéo préserve le ratio (AD-2) | marquer `[ASSUMPTION]` + critère de repli Stack |
| MED | M5 | NFR-1/3/5 sans porteur (map et spine) | 3 lignes dans la Capability Map + convention navigateurs |
| LOW | L1 | Formes des champs `generation` et contrats d'entrée inpaint/video implicites | 1 ligne de signatures |
| LOW | L2 | `a[download]` cross-origin → tentation d'une route serveur | nommer le mécanisme client conforme |
| LOW | L3 | Monotonie AD-14 vs relance | « monotone par tentative » |
| LOW | L4 | `subgraph fal.ai` non quoté | quoter |

**Verdict : APPROVE-WITH-CONDITIONS.** La spine fait le travail d'une spine : les invariants produit (AD-1/2/7), les coutures async (AD-12/13/14 post-adversarial) et le périmètre serveur sont fixés au bon niveau, les Deferred sont presque tous adossés à un point de décision unique, et la Capability Map couvre 17/17 FR. Fermer H1 et H2 (deux phrases) avant la découpe en epics ; M1–M5 se ferment dans la même passe d'édition (< 1 h de travail sur le document) ; les LOW peuvent suivre au fil de l'eau.
