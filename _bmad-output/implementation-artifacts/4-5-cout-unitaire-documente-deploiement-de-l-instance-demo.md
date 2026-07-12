# Story 4.5: Coût unitaire documenté & déploiement de l'instance démo

Status: ready-for-dev

## Story

As a responsable de la démo,
I want connaître le coût par Génération et disposer d'une instance démo déployable,
so that je puisse présenter RoomReveal en séance et justifier son économie.

## Acceptance Criteria

1. **Given** le pipeline complet fonctionnel **When** une Génération de bout en bout est exécutée **Then** le **coût unitaire par Génération** est mesuré et documenté dans le `README.md` (cible NFR-2 0,30–1,25 $ ; COGS estimé ≈ 0,62 $, +0,05 $/régé d'Inpainting) (NFR-2, SM-5, AR-README-COGS) **And** le **temps de bout en bout** sur photo standard est documenté comme **< 4 minutes** (NFR-1, SM-4).
2. **Given** le même artefact applicatif **When** on déploie **Then** deux environnements existent — `dev` local (`next dev`) et **instance démo auto-hébergée** (`next start` ou Docker) **sur réseau privé** — ne différant que par la variable `FAL_KEY` (AR-DEPLOY, AR-PROXY) **And** aucune CI en v1 : **lint, typecheck et tests Vitest passés localement avant push** (AR-DEPLOY, AR-TESTS).

## Tasks / Subtasks

- [ ] Task 1 : Réécrire `README.md` — projet RoomReveal (remplace le boilerplate create-next-app) (AC: 1, 2)
  - [ ] **Overview** : ce qu'est RoomReveal (photo meublée → déclutter → Révélation FLF), stack (Next.js 16 App Router, React 19, Tailwind 4, shadcn dark-only, fal.ai), le Parcours Upload → Masque → Pièce vide → Vidéo.
  - [ ] **Getting started (dev)** : prérequis (Node, `npm install`), copier `.env.local.example` → `.env.local`, remplir `FAL_KEY` (server-only, AD-4), `npm run dev` → http://localhost:3000. Mentionner `NEXT_PUBLIC_DETECT_BACKEND` (`fal` défaut | `local` → voir `local-detect/README.md`).
  - [ ] **Coût unitaire par Génération (AR-README-COGS)** : tableau des coûts par appel des **modèles réellement câblés** — détection (`fal-ai/sam-3` OU backend local GPU = 0 $), inpaint `fal-ai/bria/eraser` = **0,04 $/gen** (vérifié fal 2026-07-12), vidéo `fal-ai/kling-video/o1/image-to-video` = **0,56 $/5 s** (dominant), upload/storage ≈ 0 $. **Total ≈ 0,60 $/Génération** (backend détection local) — dans la cible NFR-2 (0,30–1,25 $) ; **+0,04 $ par régénération d'Inpainting** (nouvel appel bria eraser). Noter la divergence vs COGS spine (0,62 $, calculé sur flux-pro/v1/fill) : l'inpaint a été basculé sur bria eraser (voir Change Log 3.1) et la détection peut tourner en local (gratuit).
  - [ ] **Temps de bout en bout (NFR-1/SM-4)** : mesuré cette session (temps machine, hors édition manuelle du Masque) — détection ~10-15 s (local GPU) · inpaint ~8 s · **vidéo kling ~2-3 min (dominant)** · uploads qq s → **≈ 3 min, < 4 min** ✓. Préciser que le temps utilisateur d'édition du Masque est variable et non compté.
  - [ ] **Déploiement (AR-DEPLOY / AR-PROXY)** : deux environnements du **même artefact**, ne différant que par `FAL_KEY` — (a) **dev** : `next dev` ; (b) **démo auto-hébergée** : `npm run build` puis `next start` (ou Docker), **sur réseau privé** (le proxy `/api/fal/proxy` n'a ni auth ni rate-limit par design AD-4 → l'instance NE DOIT PAS être exposée publiquement, sinon fuite de dépense `FAL_KEY`). `FAL_KEY` en variable d'environnement serveur (jamais commitée).
  - [ ] **Qualité avant push (AR-TESTS)** : pas de CI en v1 → exécuter **localement** `npm run lint`, `npx tsc --noEmit`, `npm test` (Vitest) avant chaque push. Les vérifs live (FAL_KEY) sont manuelles.
- [ ] Task 2 : Vérification (AC: 1, 2)
  - [ ] `README.md` contient : coût unitaire (tableau + total dans la cible), temps < 4 min, les 2 environnements (dev/démo, réseau privé, diffèrent par FAL_KEY), la note « pas de CI, lint/typecheck/vitest local avant push ».
  - [ ] Cohérence : `npm run build` + `next start` documentés fonctionnent (build déjà vert) ; `.env.local.example` référencé existe. `npm test`/`tsc`/`lint` verts (aucune régression — 4.5 ne touche pas le code applicatif).

## Dev Notes

### État en place (NE PAS recréer)

- **`README.md`** : encore le **boilerplate create-next-app** → à réécrire entièrement pour RoomReveal.
- **`.env.local.example`** : **existe déjà** (documente `FAL_KEY`, `NEXT_PUBLIC_DETECT_BACKEND`, `NEXT_PUBLIC_LOCAL_DETECT_URL`) — le référencer, ne pas le dupliquer.
- **`local-detect/README.md`** : existe (backend détection local GPU) — y renvoyer.
- **Scripts `package.json`** : `dev`/`build`/`start`/`lint`/`test` déjà là.
- **Modèles câblés** (`pipeline/config.ts`) : detect `fal-ai/sam-3/image` (ou local), inpaint `fal-ai/bria/eraser` (0,04 $), video `fal-ai/kling-video/o1/image-to-video` (0,56 $/5 s).
- **Coûts** : kling o1 0,56 $/5 s (spine ligne 165) ; bria eraser 0,04 $/gen (fal, vérifié) ; SAM 3 / local ; total ≈ 0,60 $. Temps mesuré cette session.
- **Pas de Dockerfile** aujourd'hui : l'AC accepte « `next start` **ou** Docker » → documenter `next start` (le plus simple) suffit ; un Dockerfile est optionnel (ne PAS l'imposer).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AR-DEPLOY** : un seul artefact, deux environnements (dev / démo self-host) ne différant que par `FAL_KEY` ; pas de CI en v1 (lint/typecheck/tests locaux avant push). [Source: ARCHITECTURE-SPINE.md#AR-DEPLOY]
- **AD-4 / AR-PROXY** : le proxy n'a ni auth ni rate-limit → **réseau privé obligatoire** pour la démo (sinon n'importe qui dépense `FAL_KEY`). `FAL_KEY` server-only. [Source: ARCHITECTURE-SPINE.md#AD-4, ligne 74]
- **NFR-2 / AR-README-COGS** : coût unitaire documenté dans le README, cible 0,30–1,25 $. [Source: ARCHITECTURE-SPINE.md ligne 167, prd NFR-2]
- **NFR-1 / SM-4** : bout en bout < 4 min. [Source: prd NFR-1]
- **Périmètre** : 4.5 est **documentation + process** — aucune modification du code applicatif (pas de régression possible).

### Pièges connus

- **Coûts à jour** : documenter les modèles **réellement câblés** (bria eraser + kling o1 + detect local/fal), pas les modèles d'origine du COGS spine (flux-pro/v1/fill). Noter la divergence.
- **Réseau privé** : insister — la démo ne doit jamais être exposée publiquement (proxy ouvert, AD-4).
- **Pas de secret dans le README** : ne jamais y mettre de `FAL_KEY` réelle ; référencer `.env.local.example`.
- **Docker optionnel** : ne pas bloquer sur un Dockerfile ; `next start` documenté satisfait l'AC.
- **Ne pas casser** les liens/refs existants (`.env.local.example`, `local-detect/README.md`).

### Testing Requirements

- **Pas de test unitaire** (story documentaire). Vérifier `npm test`/`tsc`/`lint`/`build` restent verts (aucune modif code). Relecture du README pour la présence des éléments AC1/AC2.
- Idéalement, une **Génération de bout en bout live** pour reconfirmer le temps < 4 min et le coût (déjà observé cette session).

### Project Structure Notes

- **Modif** : `README.md` (réécriture). Aucun fichier code touché. Dockerfile non requis.

### References

- [Source: epics.md#Story 4.5]
- [Source: ARCHITECTURE-SPINE.md#AR-DEPLOY, AD-4/AR-PROXY (ligne 74), ligne 165 (prix modèles), ligne 167 (COGS), ligne 185 (Docker/self-host)]
- [Source: prd.md#NFR-1, NFR-2, SM-4, SM-5 ; .env.local.example ; local-detect/README.md ; [[inpaint-declutter-quality]] (bascule bria eraser)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-12 : Story 4.5 créée (create-story) — coût unitaire + temps documentés dans README, deux environnements (dev/démo réseau privé, FAL_KEY), note pas-de-CI. Documentation pure. Statut → ready-for-dev.
