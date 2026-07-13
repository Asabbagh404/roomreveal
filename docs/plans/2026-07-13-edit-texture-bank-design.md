# Design — Opération « Modifier » + banque de textures (mode édition)

**Date :** 2026-07-13 · **Statut :** validé (brainstorming) · **Prochaine étape :** writing-plans → boucle BMAD par story.

## Contexte & objectif

Le mode **édition** (`editor`, Epic 5) est un éditeur itératif : on crée un masque sur l'image de travail — soit au **pinceau/gomme**, soit par **clic-pour-sélectionner** (SAM2, Story 5.6) — puis on **Enlève** (bria eraser) ou **Ajoute** (flux fill + prompt) un objet. Le résultat devient la base de la retouche suivante.

Nouveau besoin : après avoir **sélectionné** un élément, pouvoir **le modifier** — changer sa couleur/matière au texte, **et/ou** lui appliquer une **texture** choisie dans une banque (aujourd'hui un seul PNG, `bois.png`, destinée à grandir).

Décisions issues du brainstorming :
- **3ᵉ opération « Modifier »** dans le toggle existant (`Enlever · Ajouter · Modifier`), même famille qu'« Ajouter » (on régénère la zone masquée), donc on étend le même patron.
- **Hybride** : une texture = une **vraie image de référence** + un **prompt descriptif**. La banque n'est pas de simples presets texte.
- **Modèle = `fal-ai/flux-general/image-to-image`** : inpainting par masque (localité stricte, taille conservée) **+ IP-Adapter** (image de texture en référence) **+ prompt**. Résout gratuitement la localité — pas de guidage surbrillance ni de compositing. **Fallback documenté** : `nano-banana-2/edit` (image de travail + texture, maskless) + guidage par surbrillance de la zone, si l'IP-Adapter flux se révèle capricieux au calibrage (`scale` à régler live).
- **Entrée : texture OU prompt** (au moins un des deux, combinables) + zone masquée non vide.
- **Disposition UI : bande de textures inline**, visible uniquement sous « Modifier ».

Contraintes du spine respectées : single reducer (AD-3), fal confiné à `src/pipeline/` (AD-5), orchestration dans `effects.ts` (AD-12), masque verbatim binaire blanc=édité (AD-7/AD-13), espace pixel canonique ≤1024 (AR-PIXELS), taxonomie `StepError` (AD-8), `WaitPhase` (AD-14), invalidation/epoch (AD-11), rétention 24h (AD-9), prompts centralisés (AR-PROMPTS/AD-6), modèles par rôle (AR-MODELS).

## Approche retenue

Extension minimale de l'existant : on réutilise `EditorSurface`, `MaskCanvas`, `runEdit`, le patron adaptateur, `EditResult`, `StepError`, les overlays attente/erreur. On ajoute une opération, un adaptateur, un manifeste de textures, et une bande de sélection.

### 1. Banque de textures

- **Fichiers servis** depuis **`public/textures/`** (Next ne sert que `public/`). Créer le dossier et y **déplacer `bois.png`** (racine `textures/` → `public/textures/bois.png`).
- **Manifeste** `src/pipeline/textures.ts` — source unique de vérité :
  ```ts
  export interface Texture { id: string; label: string; file: string; prompt: string; }
  export const TEXTURES: readonly Texture[] = [
    { id: "bois", label: "Bois", file: "/textures/bois.png",
      prompt: "natural oak wood texture, visible wood grain, matte finish" },
  ];
  ```
  Ajouter une texture = déposer le PNG dans `public/textures/` + une ligne ici (le `prompt` fournit la moitié « texte » de l'hybride).
- **Upload fal lazy + mémoïsé** : à la première utilisation d'une texture, fetch du PNG (`file`) → blob → `uploadArtifact` → **URL fal mémoïsée pour la session** (les textures sont statiques ; une seule upload par texture et par session). Cache en module (`Map<id, Promise<string>>`) dans le pipeline, hors reducer (ce n'est pas de l'état de Génération).

### 2. Pipeline & modèle

`src/pipeline/edit.ts` gagne `editModify`, calqué sur `editAdd` :

```ts
editModify(
  imageUrl: string,
  { textureUrl, instruction }: { textureUrl?: string; instruction?: string },
  { signal, onPhase }: AdapterOptions,
): Promise<EditResult>
```

- Entrée `flux-general/image-to-image` : `image_url` (image de travail), **masque d'inpainting** (blanc=édité), `ip_adapters: [{ image_url: textureUrl, scale }]` **seulement si** `textureUrl`, `prompt` = `buildModifyPrompt(...)`, `strength` réglé live.
- Sortie : `data.images[0].url` (comme flux fill) → `{ image }`.
- Motif adaptateur canonique (identique aux autres) : `AbortController` chaîné au signal appelant, `timeoutPromise → makeStepError("edit", true)`, `Promise.race`, `onQueueUpdate → onPhase`, header rétention 24h, throw-on-empty, jamais d'erreur fal native (AD-8).
- **Noms exacts des champs IP-Adapter / masque + `scale`/`strength` : à pinner + calibrer live** (comme tout modèle de ce projet). Le fallback nano+surbrillance reste documenté dans le code.

`config.ts` :
- `MODELS.editModify = "fal-ai/flux-general/image-to-image"` (commentaire rôle : masque + IP-Adapter + prompt ; swappable/bench-gated ; fallback nano).
- `TIMEOUTS_MS.editModify` (~90 s).
- `FAL_ALLOWED_ENDPOINTS` : ajout `${MODELS.editModify}/**` + exact.

`index.ts` : exporte `editModify`. `@fal-ai/client` reste confiné à `src/pipeline/` (AD-5).

`prompts.ts` : `buildModifyPrompt(texturePrompt?: string, instruction?: string): string` — compose une consigne qui (a) borne le changement à l'élément masqué en conservant forme/éclairage/perspective, (b) intègre le `prompt` de la texture si présent, (c) intègre l'instruction utilisateur si présente. `[À calibrer live]`.

### 3. Orchestration (`effects.ts`)

`runEdit` accepte `operation === "modify"` avec un payload `{ textureId?: string; instruction?: string }` :
- Garde-fou : rejeter si zone vide, **et** si ni texture ni instruction.
- Upload lazy de l'image de travail (déjà géré) ; si `textureId`, résoudre l'**URL fal de la texture** via le cache mémoïsé (phase `uploading`).
- Appel `editModify(imageUrl, { textureUrl, instruction }, { signal, onPhase })`.
- Succès → `EDIT_APPLIED` (reducer réutilisé tel quel) ; échec → `SET_ERROR` step `edit` (AD-8). Invalidation par epoch inchangée (AD-11/AD-12).

Signature actuelle `{ operation: "remove" | "add"; prompt?: string }` → étendue à `"remove" | "add" | "modify"` avec `textureId?`/`instruction?`. Aucun changement de reducer (le résultat est un `EDIT_APPLIED` comme les autres).

### 4. UI (`EditorSurface` + nouveau `TextureBar`)

- **Toggle** passe à 3 : `Enlever · Ajouter · Modifier` (même pilule, même style ; « Appliquer » reste l'unique action or — UX-DR13).
- **Sous « Modifier »**, dans la colonne `max-w-md`, disposition **bande inline** :
  1. Libellé « Texture ».
  2. **`TextureBar`** — bande horizontale scrollable. Première vignette = **« Aucune »** (∅, désélection → cas *prompt seul*) ; puis une vignette par `Texture` (rendu du vrai PNG, libellé dessous). Sélection = anneau `or-lumineux`. `role="radiogroup"`, chaque vignette `role="radio"` + `aria-checked` + `aria-label` = libellé ; navigable au clavier ; utilisable souris seule (NFR-3). Thème sombre (surface-elevee/bordure).
  3. **Champ instruction** (même style que le champ « Ajouter ») ; placeholder « plus foncé, bleu marine, mat… (optionnel si texture) » ; `aria-label`.
- **État local** `EditorSurface` : `operation`, `selectedTextureId: string | null`, `instruction` (réutilise/renomme l'état `prompt`). Reset après application réussie (bump d'epoch), comme le prompt d'« Ajouter » ; préservé sur erreur pour re-essai.
- **Activation « Appliquer »** :
  - `remove` : zone non vide.
  - `add` : zone non vide **et** prompt non vide (inchangé).
  - `modify` : zone non vide **et** (`selectedTextureId !== null` **ou** instruction non vide).
- **Texte d'aide** adapté à `modify` : « Sélectionnez l'élément, choisissez une texture et/ou décrivez le changement, puis appliquez. »
- Le reste (galerie visible seulement sous l'opération concernée, actions de clôture Télécharger/Nouvelle image, dialog non-sauvé) inchangé.

### 5. Coût & non-régression

- **Coût** : un appel `flux-general` par « Modifier » (ordre de grandeur d'« Ajouter »/« Vider auto »). Hors chemin vidéo → n'affecte pas la cible NFR-2 par Génération. L'upload d'une texture n'a lieu qu'une fois par session (mémoïsé).
- **Non-régression** : `Enlever`/`Ajouter` inchangés (mêmes modèles, mêmes branches) ; le reducer, `MaskCanvas`, le clic-pour-sélectionner, les overlays sont réutilisés sans modification de contrat.

## Tests (cible 80 %, TDD)

- **`textures.ts`** : forme du manifeste (ids uniques, `file` sous `/textures/`, champs non vides).
- **`buildModifyPrompt`** : texture seule / instruction seule / les deux / aucune → chaînes attendues, bornage à la zone présent.
- **`editModify`** (mock `fal`, comme `edit.test.ts`) : payload IP-Adapter présent seulement si `textureUrl` ; masque toujours passé ; timeout/abort/no-image → `StepError` edit retryable ; jamais d'erreur fal native.
- **Cache d'upload texture** : une seule upload par id (2ᵉ appel réutilise la promesse).
- **`runEdit` modify** : garde-fou (rien si zone vide ou ni texture ni instruction) ; résolution URL texture ; `EDIT_APPLIED` sur succès ; `SET_ERROR`/epoch sur échec/supersession.
- **`EditorSurface`/`TextureBar`** : règle d'activation d'« Appliquer » ; galerie visible seulement sous « Modifier » ; sélection/désélection (« Aucune ») ; `radiogroup` accessible.

## Points à calibrer live (assumés, comme le reste du projet)

- Endpoint/champs exacts IP-Adapter + masque de `flux-general/image-to-image`, `scale` (force texture) et `strength`.
- Qualité du transfert de matière sur zone masquée ; bascule éventuelle vers le fallback **nano-banana + guidage surbrillance** si débordement/faible fidélité.
- Rédaction de `buildModifyPrompt`.
