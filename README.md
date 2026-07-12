# RoomReveal

Transforme la photo d'une pièce **meublée** en une courte **Révélation** cinématique : les meubles disparaissent pour révéler la pièce nue, puis « atterrissent » en mouvement pour reconstituer la pièce — la dernière image est exactement la photo d'origine.

Le parcours est une machine à états linéaire vécue entièrement dans le navigateur :

**Upload → Masque → Pièce vide → Vidéo**

1. **Upload** — dépôt d'une photo (redimensionnée une seule fois côté client, côté long ≤ 1024 px).
2. **Masque** — détection automatique des meubles, éditable au pinceau/gomme (binaire, sans anti-aliasing).
3. **Pièce vide** — l'inpainting efface les meubles (comparaison côte à côte, régénération illimitée).
4. **Vidéo** — génération FLF (première frame = Pièce vide, dernière frame = Photo originale) ; lecteur avec autoplay + téléchargement du MP4.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind 4** · **shadcn/ui** (radix), thème sombre unique
- **fal.ai** pour les modèles (détection, inpainting, vidéo) via un proxy serveur qui garde la clé
- **Vitest** pour les tests

Le serveur Next.js se réduit à un **proxy fal** (`/api/fal/proxy`) qui garde `FAL_KEY` et injecte la politique d'expiration 24 h. Aucune base de données, aucune session, aucun fichier serveur — l'état de la Génération vit dans un reducer React (perte au rafraîchissement assumée en v1).

## Démarrage (développement)

```bash
npm install
cp .env.local.example .env.local   # puis renseigner FAL_KEY
npm run dev
```

Ouvrir http://localhost:3000.

Variables d'environnement (voir `.env.local.example`) :

- **`FAL_KEY`** — clé fal, **serveur uniquement**, jamais exposée au navigateur (AD-4). Requise.
- **`NEXT_PUBLIC_DETECT_BACKEND`** — `fal` (défaut, SAM 3 hébergé) ou `local` (service Grounded-SAM auto-hébergé sur GPU, gratuit — voir [`local-detect/README.md`](./local-detect/README.md)).
- **`NEXT_PUBLIC_LOCAL_DETECT_URL`** — URL du service local (dev), utilisée seulement si le backend est `local`.

## Modèles

Référencés par rôle dans `src/pipeline/config.ts` (changer de modèle = éditer ce seul fichier) :

| Rôle | Modèle | Notes |
|------|--------|-------|
| Détection | `fal-ai/sam-3/image` (ou backend local Grounded-SAM) | le local unionne toutes les catégories gratuitement |
| Inpainting | `fal-ai/bria/eraser` | object-eraser (remplit par le fond) — meilleur que les inpainters génériques pour *supprimer* |
| Vidéo | `fal-ai/kling-video/o1/image-to-video` | mode FLF strict (start + end frames contraints) |

## Coût unitaire par Génération

Mesuré/vérifié le 2026-07-12 sur les modèles réellement câblés. Cible NFR-2 : **0,30–1,25 $**.

| Étape | Appel | Coût |
|-------|-------|------|
| Détection | SAM 3 hébergé *ou* **backend local GPU** | ~0 $ en local · petit coût en `fal` |
| Inpainting | `fal-ai/bria/eraser` | **0,04 $** / génération |
| Vidéo | `fal-ai/kling-video/o1` | **0,56 $** / 5 s (coût dominant) |
| Upload / storage | fal storage (rétention 24 h) | ≈ 0 $ |
| **Total** | | **≈ 0,60 $ / Génération** (backend détection local) |

**+ 0,04 $ par régénération d'Inpainting** (nouvel appel bria eraser). Dans la cible et proche du COGS estimé initial (≈ 0,62 $ dans la spine, calculé alors sur `flux-pro/v1/fill` ; l'inpainting a depuis été basculé sur `bria/eraser`, et la détection peut tourner en local gratuitement).

## Temps de bout en bout

Mesuré cette session (**temps machine**, hors édition manuelle du Masque qui est variable) :

| Étape | Durée |
|-------|-------|
| Détection (GPU local) | ~10–15 s |
| Inpainting (bria eraser) | ~8 s |
| **Vidéo (kling o1)** | **~2–3 min (dominant)** |
| Uploads | quelques s |
| **Total** | **≈ 3 min — < 4 min** (NFR-1/SM-4 ✔) |

## Déploiement

Le **même artefact** applicatif sert deux environnements ; ils ne diffèrent que par la variable d'environnement **`FAL_KEY`** :

- **Développement** : `npm run dev` (`next dev`).
- **Instance démo (auto-hébergée)** :

  ```bash
  npm run build
  npm run start        # next start
  ```

  (ou une image Docker équivalente exécutant `next start`.)

> ⚠️ **Réseau privé obligatoire.** Le proxy `/api/fal/proxy` n'a **ni authentification ni rate-limit** par design (v1, outil interne) : il borne seulement les modèles atteignables via une allowlist. L'instance démo **ne doit jamais être exposée publiquement** — sinon n'importe qui peut dépenser `FAL_KEY`. `FAL_KEY` reste une variable d'environnement serveur, jamais commitée.

## Qualité avant push (pas de CI en v1)

Il n'y a **pas de CI** en v1. Avant chaque push, exécuter localement :

```bash
npm run lint          # eslint
npx tsc --noEmit      # typecheck
npm test              # Vitest
npm run build         # build de production
```

Les vérifications « live » (avec une vraie `FAL_KEY`) sont manuelles — le parcours complet se teste dans le navigateur sur le serveur de dev.
