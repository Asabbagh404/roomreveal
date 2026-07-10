# PRD Quality Review — RoomReveal (prd-flux_test-2026-07-10)

## Verdict global

PRD solide et honnête pour son enjeu calibré (outil interne / démo) : la thèse produit — le pipeline FLF rétro-conçu comme invariant (§5) — irrigue réellement les FR, les métriques et les non-objectifs, et la calibration assumée (un seul UJ, pas d'auth, périmètre desktop) est documentée plutôt que subie. Le point de vigilance est la clarté du « done » : la métrique primaire SM-1 et quelques formulations (FR-5, FR-8, « photo standard ») restent sans borne vérifiable, ce qui est la seule zone où les stories aval devront improviser. Une incohérence mineure entre §10 (question ouverte n°4) et §11 (hypothèse confirmée) est à résorber avant transmission.

## Decision-readiness — strong

Les décisions sont posées comme des décisions, pas comme des « considérations » : durée vidéo unique de 5 s et preset unique (« La durée est unique en v1 : pas de choix utilisateur », FR-10), régénérations illimitées avec la limite explicitement datée (« à revoir si ouverture publique », FR-9), purge fixe 24 h (NFR-4), navigation arrière bornée à la Génération en cours (FR-15). Les questions ouvertes (§10) sont réellement ouvertes : le choix du modèle FLF est délégué à l'Architect avec la raison (« disponibilité et prix évoluant vite »), et la question 3 (exposer ou non la catégorie des meubles) porte un `[NOTE FOR PM]` à une vraie tension, pas à un point de passage sûr. Les arbitrages nomment ce qui a été sacrifié (§6 liste six renoncements explicites, §7.2 les différés v2 avec candidat prioritaire).

### Findings
- **medium** Question ouverte n°4 contredit l'Index des hypothèses (§10.4 vs §11.2) — La limite d'upload de 20 Mo est à la fois « question ouverte » (« Limite de taille de fichier exacte à l'upload (FR-3, hypothèse 20 Mo) ») et hypothèse « confirmée par Anthony le 2026-07-10 » devenue « décision produit ». Un lecteur aval ne sait pas si 20 Mo est arbitré ou à trancher. *Fix :* supprimer la question 4, ou la requalifier (« la valeur 20 Mo est actée ; seule la révision post-v1 reste ouverte »).

## Substance over theater — strong

Rien ne ressemble à du mobilier. Pas de personas de façade : §2.1 tient en trois JTBD qui pilotent des exigences réelles (le JTBD contextuel « en séance, sans préparation » fonde directement FR-13/FR-14 et NFR-3), et la cible secondaire est explicitement « servie par le même Parcours sans exigence dédiée » — l'inverse du persona theater. Les NFR portent des seuils propres au produit (< 4 min bout en bout, purge 24 h, COGS 0,30–1,25 $ sourcé dans l'addendum) et non du boilerplate « scalable/sécurisé ». La Vision (§1) n'est pas interchangeable : « générée "à l'envers", contrainte entre une première frame […] et une dernière frame » ne pourrait figurer dans aucun autre PRD de la catégorie. La différenciation n'est pas re-plaidée ici mais renvoyée au brief (§0), avec le strict nécessaire repris dans l'addendum (moat « de workflow et d'exécution », pas technologique) — la bonne répartition.

## Strategic coherence — strong

Le PRD a une thèse et la traite comme telle : §5 est marqué « section contractuelle pour la découpe en epics et stories » et interdit explicitement la dérive la plus probable (« Aucune story ne doit remplacer la Génération FLF par une génération vidéo libre »). Les 17 FR servent tous l'arc Upload → Masque → Pièce vide → Vidéo ; aucune capacité orpheline. Les métriques valident la thèse et non l'activité : SM-1 (cohérence de la Révélation) et SM-2 (respect du Masque à 100 %) mesurent exactement la promesse de crédibilité, et les contre-métriques SM-C1/SM-C2 verrouillent les deux optimisations perverses évidentes (vitesse contre cohérence, coût contre qualité). Le périmètre MVP est de type « problem-solving demo » et la logique de scope suit (§7.1 = le parcours complet plus la robustesse de base, rien d'autre).

## Done-ness clarity — adequate

La majorité des FR portent des conséquences réellement testables : FR-2 (« côté long ≤ 1024 px », ratio préservé), FR-7 (« Une zone retirée du Masque à la gomme n'est jamais effacée »), FR-10 (première/dernière frame identiques aux bornes), FR-14 (« Aucune opération de plus de 2 secondes ne se déroule sans indicateur visuel »), FR-17 (« ne montre jamais de trace technique brute »). C'est le bon niveau pour la création de stories. Mais quelques formulations restent des adjectifs sans borne, et surtout la métrique primaire SM-1 — celle qui décide si la démo est un succès — n'a ni panel défini ni seuil chiffré. C'est la dimension sur laquelle l'aval s'appuiera le plus fort ; elle est bonne mais pas irréprochable.

### Findings
- **medium** SM-1 sans seuil ni protocole (§9) — « jugée cohérente […] sur la majorité des essais » : combien de photos dans le panel, quel seuil (« majorité » = 51 % ? 80 % ?), qui juge ? En l'état, la métrique primaire n'est pas falsifiable et FR-8 (« rendu plausible ») s'appuie dessus. *Fix :* fixer un protocole minimal — ex. panel de 10 photos de salons réelles, ≥ 7/10 jugées cohérentes par 2 personnes hors équipe.
- **medium** FR-5 : « contraste suffisant » et « tout écran desktop courant » sans borne (§4.2) — la seule conséquence testable reformule l'adjectif (« peut être distingué visuellement »). Un dev ne sait pas quand c'est done. *Fix :* critère concret — ex. overlay de couleur/opacité fixées, vérifié sur les trois navigateurs cibles de NFR-5 ; ou opacité réglable par l'utilisateur.
- **low** NFR-1 / SM-4 : « photo standard » non défini (§8, §9) — le seuil < 4 min dépend d'une entrée non spécifiée. *Fix :* définir (ex. JPEG ≤ 20 Mo de pièce meublée, cf. FR-3), sinon le chrono n'est pas reproductible.
- **low** FR-8 : « rendu plausible » subjectif (§4.3) — acceptable pour de la génération IA non déterministe, et partiellement couvert par SM-1 ; le lien n'est fait qu'en §9. *Fix :* renvoyer explicitement FR-8 → SM-1 dans le corps du FR pour que la story hérite du critère.

## Scope honesty — strong

C'est la dimension la plus soignée du document. §6 nomme six non-objectifs sans euphémisme (« n'est **pas** un SaaS public : pas de comptes, pas d'authentification, pas de paiement ni de quotas »), §7.2 distingue le différé du renoncé avec un `[NOTE FOR PM]` sur le premier candidat v2. Les huit hypothèses inférées sont indexées en §11 avec date de confirmation et pointeurs de section — le passage d'hypothèse à décision est tracé, pas escamoté. La densité de points ouverts (4 questions + 2 NOTE FOR PM + 0 assumption résiduelle) est basse et cohérente avec un enjeu « outil interne / démo » : rien n'est laissé à l'inférence du lecteur. Seule la friction §10.4/§11.2 (déjà relevée en Decision-readiness) entame légèrement cette propreté.

### Findings
- **low** §7.1 : « Coût unitaire par Génération documenté dans le README » est un livrable de process, pas une capacité produit — il n'a pas de FR porteur et risque d'être perdu à la découpe en stories. *Fix :* le porter comme tâche explicite dans l'epic correspondant (il valide SM-5/NFR-2).

## Downstream usability — strong

Le glossaire (§3) fait un vrai travail : neuf termes, chacun défini par son rôle dans le pipeline (« sert de dernière frame à la Génération FLF »), et utilisés avec majuscule de manière quasi systématique dans les FR. Les ID sont contigus et uniques (FR-1→17, NFR-1→6, SM-1→5 + SM-C1/C2, UJ-1), toutes les références croisées résolvent (SM-2→FR-7, SM-3→FR-13/FR-14/NFR-3, UJ-1→FR-16, NFR-2→addendum). Chaque section 4.x s'extrait seule : description, rattachement à UJ-1, FR autonomes. L'addendum sépare proprement la matière Architecture (modèles, coûts fal.ai, contrainte de centralisation des prompts) du contrat produit — exactement ce que `bmad-architecture` attend. §5 est directement consommable par la découpe epics/stories.

## Shape fit — strong

La forme épouse le produit. Enjeu annoncé dès §0 (« outil interne / démo — la rigueur porte sur le parcours et la robustesse perçue, pas sur l'industrialisation ») et tenu : un seul UJ avec protagoniste nommée (Claire) là où le parcours est réellement porteur, forme capability-spec pour le reste, métriques opérationnelles (SM-3 « un testeur non technique ») plutôt que métriques d'usage — le bon registre pour une démo interne. Ni sur-formalisation (pas de matrice de personas, pas de NFR de scalabilité fantômes) ni sous-formalisation (le cas limite de UJ-1 est bien raccordé à FR-16). Le PRD assume son rôle de tête de chaîne (§0 nomme les trois ateliers aval) et c'est cohérent avec le soin mis en Downstream usability.

## Notes mécaniques

- **Dérive glossaire légère « Génération » / « génération »** : le terme glossaire « Génération » (exécution complète du parcours) coexiste avec « génération » minuscule au sens d'appel modèle (« la génération de la Pièce vide » FR-9, « la génération vidéo » FR-14, §4.5). Le contexte désambiguïse toujours, mais l'aval extrait par terme : préférer « Inpainting » / « Génération FLF » (déjà au glossaire) pour les appels unitaires.
- **ID continuity** : aucune lacune ni doublon (FR-1→17, NFR-1→6, SM-1→5, SM-C1/C2, UJ-1). §7.1 cite « FR-1 à FR-15 » pour le parcours et liste FR-3/16/17 séparément en robustesse — FR-3 apparaît dans les deux, sans ambiguïté réelle.
- **Roundtrip Index des hypothèses** : pas de tags `[ASSUMPTION]` inline — cohérent, puisque §11 les déclare toutes confirmées et requalifiées en décisions ; les huit entrées de l'index pointent vers des sections qui contiennent bien la décision correspondante. Roundtrip valide sous cette convention.
- **Protagoniste UJ** : UJ-1 porte une protagoniste nommée (Claire) avec son contexte inline. Pas d'UJ flottant.
- **Sections requises** : toutes présentes pour l'enjeu convenu (vision, cible, glossaire, FR, invariant, non-objectifs, MVP, NFR, SM, questions ouvertes, index). Les `[NOTE FOR PM]` (§7.2, §10.3) sont aux bons endroits.
