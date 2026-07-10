---
type: architecture-review
lens: adversarial
target: ../ARCHITECTURE-SPINE.md
project: RoomReveal
reviewer: Reviewer Gate — lentille adversariale
created: '2026-07-10'
verdict: REJECT-AS-IS — spine solide sur les invariants produit, mais le contrat reducer ↔ adaptateurs et le cycle de vie du Masque laissent passer des paires d'unités conformes et incompatibles
---

# Revue adversariale — Spine RoomReveal

**Méthode.** Pour chaque attaque, je construis deux unités de build (epics/stories un niveau sous la spine) réalisées par deux équipes indépendantes. Chacune obéit à TOUTES les AD à la lettre. Si elles ne s'emboîtent pas, la spine a un trou : une AD à créer ou à resserrer. Sévérités : **CRITIQUE** = intégration impossible ou bug produit garanti ; **MAJEURE** = rework significatif d'une des deux unités ; **MINEURE** = friction résolvable en revue de code.

**Bilan : 8 attaques, 8 trous confirmés** (2 critiques, 4 majeures, 2 mineures). Aucune AD existante n'est fausse ; elles sont insuffisamment resserrées sur les coutures inter-unités.

---

## ATTAQUE 1 — Qui appelle `fal.subscribe` ? Qui tient l'AbortController ? Que devient un job en vol ?

**Sévérité : CRITIQUE**

### Les deux unités

- **U-A « Stepper + reducer Génération »** (`src/state/`) — construit selon AD-3, AD-10, AD-11.
- **U-B « Adaptateur video »** (`src/pipeline/video`) — construit selon AD-5, AD-8, AD-10.

### Choix conformes mais incompatibles

**U-A** lit AD-3 (« la Génération est un objet unique tenu par un reducer React ») et AD-11 (« sémantique d'invalidation définie dans le reducer seul ») et en déduit que l'orchestration asynchrone lui appartient : un dispatcher type thunk dans `src/state/` appelle les adaptateurs, tient un `AbortController` par étape, et sur `INVALIDATE_DOWNSTREAM` (avancer à nouveau depuis une étape antérieure) il aborte le job vidéo en vol puis purge les artefacts aval. Il suppose que les adaptateurs acceptent un `AbortSignal` et sont annulables.

**U-B** lit AD-5 (« le module pipeline est le seul propriétaire des appels modèles ») et AD-10 (« les appels longs passent par `fal.subscribe` ») et en déduit que le cycle de vie du job lui appartient : `videoAdapter.generate(inputs, onQueueUpdate)` encapsule entièrement `fal.subscribe`, gère lui-même timeout et reprise de polling, et ne prend **pas** d'`AbortSignal` — la queue fal n'offre de toute façon pas d'annulation fiable une fois le job `IN_PROGRESS`. Sa promesse résout toujours, tard ou jamais.

### Ce qui casse à l'intégration

1. Le reducer croit annuler ; l'adaptateur ne s'annule pas. Un job Kling de 1–3 min continue en arrière-plan (et **coûte 0,56 $**, NFR-2).
2. Pire : l'utilisateur revient au Masque, revalide (AD-11 invalide l'aval), régénère une Pièce vide — puis le **job vidéo périmé se résout** et son `onQueueUpdate`/résolution écrit une Révélation obsolète dans un état frais. Aucune AD ne définit d'identité de job ni de protection contre les résultats périmés. Bug produit garanti (la Révélation affichée ne correspond pas à la Pièce vide affichée — violation silencieuse d'AD-1 telle que perçue par l'utilisateur).
3. AD-3 dit « reducer React » — un reducer React est pur, il ne peut pas appeler `fal.subscribe`. La spine ne nomme jamais la couche qui exécute les effets. Troisième lecture possible (hooks dans `components/`) tout aussi conforme : « les composants dispatchent des intentions » n'interdit pas qu'un hook de composant appelle le pipeline puisque le graphe autorise C→S→P par transitivité… ou pas ? Trois équipes, trois réponses.

### AD à créer — **AD-12 « Contrat d'exécution asynchrone »**

> Les adaptateurs sont des fonctions asynchrones **passives** : `(inputs, { signal, onPhase }) → Promise<Output | StepError>`. Ils acceptent obligatoirement un `AbortSignal` et cessent tout effet observable après abort (le job fal distant peut survivre ; son résultat est ignoré). L'orchestration vit dans **une seule couche effectrice nommée** (ex. `src/state/effects.ts`) : elle seule appelle les adaptateurs, tient un `AbortController` par étape, et estampille chaque lancement d'un **jeton d'époque** incrémenté par toute invalidation AD-11 ; un résultat dont le jeton ne correspond plus à l'époque courante du reducer est jeté sans dispatch. `INVALIDATE_DOWNSTREAM` aborte systématiquement les jobs aval en vol.

---

## ATTAQUE 2 — Deux propriétaires du Masque : brouillon éditable vs artefact validé

**Sévérité : CRITIQUE**

### Les deux unités

- **U-A « Canvas du Masque »** (`components/masque`) — construit selon AD-2, AD-3, AD-7 et l'UX (zoom, pan, undo 20 actions, effet immédiat au trait).
- **U-B « Stepper + reducer »** (`src/state/`) — construit selon AD-3, AD-11 et FR-15.

### Choix conformes mais incompatibles

**U-A** lit AD-3 (« aucun composant ne tient d'état pipeline local ») et tranche : le masque **en cours d'édition** n'est pas un artefact pipeline — c'est de l'état d'interaction UI (comme la position d'un curseur). Il garde donc les coups de pinceau dans un canvas offscreen local + une pile d'undo locale, et ne commet vers le reducer qu'au clic « Valider le Masque » : un PNG encodé (AD-7), point final. Conforme à la lettre : l'état *pipeline* (le Masque validé) est bien dans le reducer.

**U-B** lit FR-15 / AD-11 (« revenir à Masque depuis Pièce vide restaure le Masque précédent tel quel », « revenir en arrière conserve tous les artefacts ») et modélise le Masque dans le reducer comme la seule source de vérité — car si le composant Masque est démonté à l'étape 3, son état local est mort. U-B stocke donc `mask: <URL fal du PNG validé>` (conforme à la convention « les artefacts circulent en URLs fal »).

### Ce qui casse à l'intégration

Le retour arrière est **irréalisable proprement** avec ces deux choix pourtant conformes : au retour à l'étape Masque, U-A reçoit une URL fal d'un PNG niveaux de gris et doit re-hydrater son canvas éditable depuis un fetch réseau (latence, CORS, URL périssable AD-9 — un retour après expiration casse), et la pile d'undo de la session précédente est perdue alors que l'UX promet le masque « tel quel » repris à l'édition. Deux représentations de la même entité — masque-comme-strokes et masque-comme-PNG-URL — sans conversion spécifiée ni propriétaire désigné. Et le Flow 4 de l'UX (retour au Masque après trois régénérations pour élargir une zone) traverse exactement ce trou.

### AD à créer — **AD-13 « Double vie du Masque »**

> Le Masque a deux formes canoniques et un seul propriétaire par forme : (1) le **brouillon** — un buffer binaire aux dimensions canoniques (AD-2), tenu dans le reducer (`generation.maskDraft`, transférable en `ImageData`/`ImageBitmap`), survivant au démontage du composant ; le canvas est une **vue** de ce buffer, jamais son propriétaire ; la pile d'undo est UI locale et assumée perdue à la navigation. (2) l'**artefact validé** — PNG AD-7 uploadé au storage fal, référencé par URL dans `generation.mask`. « Valider le Masque » = encoder le brouillon → uploader → stocker l'URL. Le retour arrière ré-affiche le brouillon depuis le reducer, jamais depuis l'URL fal.

*(Note : cela oblige à amender la phrase d'AD-3 « aucun composant ne tient d'état pipeline local » en désignant explicitement le brouillon du Masque comme état pipeline.)*

---

## ATTAQUE 3 — Sémantique des pixels du masque : anti-aliasing, dpr, et le « niveaux de gris » piégé

**Sévérité : MAJEURE**

### Les deux unités

- **U-A « Canvas du Masque »** — construit selon AD-7 et l'UX (traits doux, zoom 100–400 %).
- **U-B « Adaptateur inpaint »** (`pipeline/inpaint` + `lib/encodage masque`) — construit selon AD-7, SM-2.

### Choix conformes mais incompatibles

**U-A** dessine avec l'API Canvas standard : traits anti-aliasés (bords gris), buffer alloué à la résolution d'affichage × `devicePixelRatio` pour des traits nets à l'écran, puis **rééchantillonné** vers les dimensions canoniques à l'export — ce qui produit encore plus de valeurs grises intermédiaires. Le PNG exporté est bien « niveaux de gris, blanc = zone à effacer, dimensions canoniques » : **conforme AD-7 au mot près**, car AD-7 autorise littéralement les niveaux de gris.

**U-B** transmet ce PNG verbatim (AD-7 lui interdit toute altération, y compris un seuillage « utile » !) à `flux-pro/v1/fill`, dont le comportement sur les gris intermédiaires est indéfini (seuillage interne ? masquage partiel ?).

### Ce qui casse à l'intégration

Un coup de gomme laisse un halo gris-30 sur ses bords → l'inpainting efface partiellement une zone « retirée à la gomme » → **violation directe de FR-7 et SM-2** (« le Masque édité est respecté à 100 % »), alors que chaque unité est irréprochable. L'ironie : AD-7, écrite pour protéger SM-2, interdit à U-B le seuillage qui l'aurait sauvé. De plus, deux résolutions de buffer (dpr × affichage vs canonique) donnent des coordonnées de trait incohérentes si U-B fournit un jour un masque initial (Détection) à recharger dans le canvas.

### AD à resserrer — **AD-7**

> Le Masque est **binaire** : chaque pixel vaut 0 ou 255, aucune valeur intermédiaire. Le buffer d'édition vit **en résolution canonique 1:1** (AD-2) pendant toute l'édition ; zoom et dpr sont des transformations d'affichage, jamais de rééchantillonnage du buffer. Dessin sans anti-aliasing (composition binaire) ou binarisation au trait — mais jamais de binarisation différée à l'export, pour que ce que l'utilisateur voit soit exactement ce qui part. « Verbatim » s'applique à ce buffer binaire.

---

## ATTAQUE 4 — Sortie de l'adaptateur `detect` : N segments ou UN Masque ?

**Sévérité : MAJEURE**

### Les deux unités

- **U-A « Adaptateur detect »** — construit selon AD-5 (« entrées/sorties = URLs fal » + « liste des catégories détectées »).
- **U-B « Éditeur de Masque »** — construit selon le glossaire PRD (« **Un seul** Masque par Génération ») et l'UX (« aucune liste de catégories, aucun toggle par objet »).

### Choix conformes mais incompatibles

**U-A** reste fidèle au modèle : `fal-ai/sam-3/image` retourne un segment par instance détectée. L'adaptateur expose donc `{ masks: Array<{ url, category }> }` — parfaitement conforme à AD-5 (« URLs fal », pluriel non interdit, catégories exigées). Il laisse la composition au consommateur, comme un bon adaptateur mince.

**U-B** attend « le Masque initial » : **une** URL (ou un buffer) d'un unique PNG binaire aux dimensions canoniques, prêt à charger dans le brouillon. Il n'a nulle part où compositer N segments — le compositing est du traitement d'image, pas de l'UI, et AD-7/AD-2 ne désignent personne.

### Ce qui casse à l'intégration

Personne ne possède l'aplatissement N segments → 1 Masque (union binaire, redimensionnement éventuel si SAM sort d'autres dimensions, seuillage des scores de confiance — quel seuil ?). Chaque équipe l'attend de l'autre. Second clash embarqué : la définition de « aucun meuble détecté » (FR-16) — pour U-A c'est `masks.length === 0` ; pour U-B qui recevrait un PNG composité, c'est « PNG entièrement noir », deux prédicats qui divergent dès qu'un segment sous le seuil de confiance existe.

### AD à resserrer — **AD-5**

> Le contrat de sortie de `detect` est : `{ initialMask: <PNG binaire unique, dimensions canoniques AD-2, sémantique AD-7> | null, categories: string[] }`. La composition (union des segments, seuil de confiance, mise aux dimensions canoniques) appartient à l'adaptateur `detect` — jamais à l'UI ni au reducer. `initialMask === null` (zéro segment retenu) est LA définition canonique du cas FR-16.

---

## ATTAQUE 5 — Les phases nommées du Panneau d'attente : trois vocabulaires pour une attente

**Sévérité : MAJEURE**

### Les deux unités

- **U-A « Panneau d'attente »** (`components/attente`) — construit selon l'UX : phases « Envoi de vos images » → « Génération de la Révélation » → « Finalisation », temps écoulé, barre qui ne recule jamais.
- **U-B « Adaptateur video »** — construit selon AD-10 : « les événements de statut queue alimentent les phases nommées ».

### Choix conformes mais incompatibles

**U-B** relaie les statuts queue fal tels que normalisés par lui : `IN_QUEUE` / `IN_PROGRESS` / `COMPLETED` (ou son propre enum anglais `queued/running/done` — la convention de nommage anglais l'y encourage). Il ne peut par construction **pas** émettre « Envoi de vos images » : l'upload des frames au storage n'est pas un événement de queue — AD-10 dit pourtant que les événements de queue « alimentent les phases », laissant croire que c'est suffisant.

**U-A** attend les trois phases UX, en français, y compris la première (l'upload), plus la sémantique « ne recule jamais ». Il doit soit inventer son propre mapping statut→phase (dupliquant une connaissance pipeline dans l'UI — permis, rien ne l'interdit), soit afficher des trous.

### Ce qui casse à l'intégration

Le type même de la « phase d'attente » n'existe nulle part : est-ce un enum du pipeline, du state, de l'UI ? Qui mappe `IN_QUEUE` → quelle phrase ? La phase « Envoi de vos images » n'a pas d'émetteur. Deux enums naissent (un par équipe), le reducer stocke l'un, le composant switche sur l'autre. Même trou, en plus petit, pour Détection et Inpainting (« Détection des meubles… », « Génération de la Pièce vide… ») dont les phases ne viennent d'aucune queue.

### AD à créer — **AD-14 « Vocabulaire des phases d'attente »**

> Un enum unique `WaitPhase` (`uploading | queued | generating | finalizing`) vit dans `src/state/` (types du domaine). Les adaptateurs émettent des `WaitPhase` via le callback `onPhase` (AD-12) — l'émission de `uploading` incombe à l'adaptateur dès qu'il pousse des entrées au storage ; les statuts queue fal sont mappés vers `WaitPhase` **dans l'adaptateur**, jamais en amont. La traduction `WaitPhase` → microcopie française appartient au Panneau d'attente seul (mapping par étape, microcopies d'EXPERIENCE.md). Monotonie : le reducer refuse toute transition de phase régressive.

---

## ATTAQUE 6 — `StepError.step` : quel enum ? Et qui tient le chronomètre du timeout ?

**Sévérité : MAJEURE**

### Les deux unités

- **U-A « Reducer + Bandeau d'erreur »** — construit selon AD-8, FR-17, et le stepper 4 étapes.
- **U-B « Adaptateurs »** — construit selon AD-5, AD-8.

### Choix conformes mais incompatibles

**U-B** émet `StepError{ step }` avec ses noms d'adaptateurs : `'detect' | 'inpaint' | 'video'` — les seules « étapes » qu'il connaît (AD-5 nomme exactement ces trois-là).

**U-A** modélise `step` sur le Parcours : `'upload' | 'mask' | 'emptyRoom' | 'reveal'` — les seules étapes que le glossaire et le stepper connaissent (convention de nommage : étape→`step`, et le Parcours EST 4 étapes). Or les deux espaces ne sont pas isomorphes : un échec `detect` survient pendant la **transition** Upload→Masque ; « relancer l'étape concernée » (FR-17) signifie pour lui… relancer quoi, sur quelle surface, le stepper affichant quoi ? Chaque équipe a une réponse différente et conforme.

Second front : le **timeout**. L'UX exige « 3 min 30 → message ; timeout technique → Bandeau ». AD-8 ne dit pas qui détecte le timeout. U-A pose un chronomètre dans l'effet/composant et dispatch un abort+erreur à N minutes ; U-B enveloppe `fal.subscribe` dans son propre `Promise.race` avec timeout interne. À l'intégration : deux chronomètres, deux valeurs de N différentes, double bandeau d'erreur (ou celui de U-B qui tire pendant que U-A affiche encore l'attente).

### AD à resserrer — **AD-8**

> `StepError.step` est typé sur l'enum pipeline `'detect' | 'inpaint' | 'video'` ; le reducer possède la table de correspondance canonique vers les étapes du Parcours (`detect`→surface Masque, relance = re-`detect` depuis la photo canonique conservée ; `inpaint`→Pièce vide ; `video`→Vidéo). Le timeout est détecté **par l'adaptateur seul** (valeurs par étape dans `pipeline/config.ts` : detect/inpaint 60 s, video 6 min `[à calibrer au build]`), converti en `StepError{ retryable: true }` ; la couche effectrice et l'UI ne posent jamais de chronomètre d'échec — le seuil UX « 3 min 30, message doux » est un affichage sur temps écoulé, sans effet sur le job.

---

## ATTAQUE 7 — Qui uploade au storage fal ? (l'exception « hors encodage initial upload/masque »)

**Sévérité : MINEURE→MAJEURE**

### Les deux unités

- **U-A « Upload/resize »** (`components/upload` + `lib/resize`) — construit selon AD-2, AD-4, AD-9.
- **U-B « Adaptateur detect »** — construit selon AD-5 et la convention « les artefacts circulent en URLs fal ».

### Choix conformes mais incompatibles

**U-A** lit AD-9 (« tous les artefacts vivent sur le storage fal ») + AD-4 (« tout appel API fal — y compris upload storage — passe par le proxy », ce qui ne réserve l'upload à personne) et uploade la photo canonique au storage **dès l'étape 1**, via `fal.storage.upload` appelé depuis un utilitaire `lib/`. Il passe une URL fal au reducer. Problème : `lib/` (ou le composant) importe alors `@fal-ai/client` — or le diagramme interdit à l'UI d'importer `@fal-ai/client`, mais `lib/` n'apparaît **pas dans le diagramme de couches** : zone grise, U-A se croit conforme.

**U-B** lit AD-5 (« le pipeline est le seul propriétaire de fal ») et la convention (« jamais de base64 entre couches, **hors encodage initial upload/masque** ») comme : les couches amont me passent le Blob/base64 initial, et **moi** je l'uploade. Son adaptateur signe `detect(photo: Blob)`.

### Ce qui casse à l'intégration

L'un envoie une URL, l'autre attend un Blob. L'exception « hors encodage initial upload/masque » a été écrite pour permettre le second modèle mais se lit aussi comme une simple tolérance de transport — elle ne désigne pas le propriétaire de `fal.storage.upload`, et `src/lib/` est hors du graphe de dépendances. Même ambiguïté, dupliquée, pour l'upload du PNG Masque (attaque 2). Conséquence secondaire : si U-A uploade à l'étape 1 et U-B ré-uploade par sécurité, chaque artefact existe en double sur le storage (inoffensif mais TTL/urls divergents).

### AD à resserrer — **AD-5 + diagramme de couches**

> `src/pipeline/` est le seul importeur de `@fal-ai/client`, **upload storage compris** : il expose `uploadArtifact(blob) → fal URL` en plus des trois adaptateurs. `src/lib/` entre au diagramme comme couche feuille importable par tous mais n'important ni `pipeline/` ni `@fal-ai/client`. Les couches amont manipulent des `Blob` locaux jusqu'à la frontière pipeline ; toute URL fal naît dans `pipeline/`.

---

## ATTAQUE 8 — « Photo originale strictement intouchée » (AD-1) vs photo re-encodée ≤ 1024 px (AD-2)

**Sévérité : MINEURE**

### Les deux unités

- **U-A « Adaptateur video »** — construit selon AD-1, lue à la lettre.
- **U-B « Upload/resize »** — construit selon AD-2.

### Choix conformes mais incompatibles

Le glossaire PRD définit la Photo originale comme « l'image uploadée par l'utilisateur, **jamais modifiée** » ; AD-1 exige « dernière frame = Photo originale **strictement intouchée** ». **U-A**, zélé sur l'invariant contractuel, garde le `File` d'origine et l'envoie comme last frame — pleine résolution 4000×3000. **U-B**, lui, ne conserve après resize **que** la version canonique ≤ 1024 px re-encodée (et laquelle : `canvas.toBlob('image/jpeg', q?)` ou PNG ? Non spécifié — un JPEG q=0.8 dégrade la « dernière frame au pixel près » ; un PNG photo pèse 2–3 Mo et fait mentir « aucun body > ~1 Mo »). Les deux frames FLF arrivent alors en dimensions différentes — le modèle croppe ou refuse, AD-2 est violée à l'exécution alors que chaque unité cite une AD pour se défendre.

### Ce qui casse

Conflit de lettre entre AD-1 et AD-2 sur ce que désigne « Photo originale » côté pipeline, plus un paramètre d'encodage (format/qualité du canonique) laissé libre alors qu'il touche l'invariant « au pixel près ».

### AD à resserrer — **AD-2 (+ note de terminologie dans AD-1)**

> Terminologie liante : la **photo canonique** (sortie unique du resize AD-2) est LA « Photo originale » au sens du pipeline ; « intouchée » (AD-1) signifie : aucune retouche de contenu **après** la canonisation. Le `File` d'origine est jeté après resize. Encodage canonique : `image/jpeg`, qualité 0.92 `[à calibrer]` — un seul encodage, à l'upload, jamais ré-encodé ensuite (le Masque, lui, reste PNG par AD-7).

---

## Synthèse

| # | Trou | Paire | Sévérité | Remède |
|---|---|---|---|---|
| 1 | Contrat async : owner de `fal.subscribe`, AbortController, jobs en vol / résultats périmés à l'invalidation | reducer ↔ adaptateur video | **CRITIQUE** | **AD-12** (nouvelle) |
| 2 | Deux représentations du Masque (brouillon vs artefact), retour arrière FR-15 impossible proprement | canvas masque ↔ reducer | **CRITIQUE** | **AD-13** (nouvelle) + amender AD-3 |
| 3 | Masque « niveaux de gris » : anti-aliasing + dpr + resampling → FR-7/SM-2 violés | canvas masque ↔ adaptateur inpaint | MAJEURE | resserrer **AD-7** (binaire, buffer canonique 1:1) |
| 4 | `detect` : N segments vs Masque unique ; définition de « aucun meuble » | adaptateur detect ↔ éditeur Masque | MAJEURE | resserrer **AD-5** (contrat de sortie `initialMask|null`) |
| 5 | Phases d'attente : trois vocabulaires, phase « Envoi » sans émetteur | panneau attente ↔ adaptateur video | MAJEURE | **AD-14** (nouvelle, enum `WaitPhase`) |
| 6 | Enum `StepError.step` (3 adaptateurs vs 4 étapes) ; double chronomètre de timeout | reducer/bandeau ↔ adaptateurs | MAJEURE | resserrer **AD-8** |
| 7 | Propriétaire de `fal.storage.upload` ; `lib/` hors diagramme | upload/resize ↔ adaptateur detect | MIN→MAJ | resserrer **AD-5** + compléter le diagramme |
| 8 | « Photo originale intouchée » vs canonique re-encodée ; format/qualité du canonique | adaptateur video ↔ upload/resize | MINEURE | resserrer **AD-2** (terminologie + encodage) |

**Verdict.** La spine tient bien les invariants produit (AD-1, AD-7 dans l'esprit, AD-11) et le périmètre serveur, mais elle sous-spécifie systématiquement **les coutures** : chaque frontière reducer↔pipeline et composant↔reducer admet au moins deux lectures conformes et incompatibles. Les attaques 1 et 2 sont bloquantes pour la découpe en epics : sans AD-12 et AD-13, les stories « stepper/reducer », « canvas masque » et « adaptateur video » ne peuvent pas être écrites indépendamment. Les six autres se ferment par resserrement de texte, une demi-journée de travail sur la spine avant toute découpe.
