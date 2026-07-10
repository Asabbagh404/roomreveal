---
baseline_commit: NO_VCS
---

# Story 1.1: Socle applicatif & identité visuelle RoomReveal

Status: done

## Story

As a développeur de RoomReveal,
I want un projet Next.js initialisé avec le socle de design et la structure en couches,
so that toutes les stories suivantes se construisent sur une base cohérente, brandée et testable.

## Acceptance Criteria

1. **Given** un poste de développement vierge **When** le projet est initialisé via `create-next-app` **Then** l'application démarre avec Next.js 16.2.x (App Router), React 19.2.x, Tailwind CSS 4.3.x et shadcn/ui en **mode dark unique** **And** l'arborescence respecte les couches AR-LAYERS : `src/components/`, `src/state/`, `src/pipeline/`, `src/app/api/fal/proxy/`, `src/lib/`
2. **Given** l'application démarrée **When** une page est rendue **Then** les tokens de design sont appliqués : palette (`fond-projection #0B0D12`, `surface-carte #141821`, `surface-elevee #1B2130`, `texte-principal #EDEFF4`, `texte-secondaire #98A2B3`, `bordure #252C3B`, `or-lumineux #F2C14E`, `or-lumineux-foreground #1A1305`, `masque-overlay #FF2E9E`, `masque-contour #FF7AC2`, `succes #3DDC97`, `erreur #F87171`), rôles typographiques (`display` 30px/600/1.2/-0.01em, `carton-titre` 13px/500/1.4/0.12em petites capitales, `attente` 16px/400/1.6 — tous sur Geist Sans), `rounded.lg` 12px et `spacing.scene-gap` 48px (UX-DR1, UX-DR2, UX-DR3)
3. **And** le layout desktop est une colonne centrée `max-w-5xl`, emplacement de stepper en bandeau fixe en haut, action principale sous la scène alignée à droite (UX-DR4)
4. **Given** l'application ouverte **When** la largeur de la fenêtre est inférieure à ~1024 px **Then** un message plein écran « RoomReveal est conçu pour un écran d'ordinateur » s'affiche sans tentative d'adaptation (UX-DR17)
5. **Given** l'application ouverte sur desktop **When** l'utilisateur regarde le pied de page **Then** une ligne discrète indique « Vos photos sont supprimées automatiquement après 24 heures » (UX-DR16, NFR-4)
6. **Given** le dépôt de code **When** on lance la suite de tests **Then** Vitest est configuré et exécute au moins un test de fumée qui passe (AR-TESTS) **And** toute variable d'environnement (dont `FAL_KEY`) est lue une seule fois côté serveur (AR-CONFIG)

## Tasks / Subtasks

- [x] Task 1 : Initialiser le projet Next.js à la racine du repo (AC: 1)
  - [x] `create-next-app` avec Next.js 16.2.x, App Router, TypeScript, Tailwind CSS 4.3.x, `--src-dir`, sans ESLint config exotique (defaults). ⚠️ La racine `flux_test/` n'est pas vide (`_bmad/`, `_bmad-output/`, `docs/`, `test-assets/`) : `create-next-app` refuse les dossiers non standards → scaffolder dans un dossier temporaire (scratchpad) puis déplacer les fichiers générés à la racine du repo. Ne PAS créer de sous-dossier `roomreveal/` : `src/` vit à la racine du repo.
  - [x] `git init` + `.gitignore` Next.js standard (le repo n'est pas encore un dépôt git) ; ajouter `_bmad-output/` et `_bmad/` au `.gitignore` ? NON — les garder versionnés (artefacts de planning du projet). Commit initial après scaffold.
  - [x] Initialiser shadcn/ui via `npx shadcn@latest init` (style default, base color neutral, CSS variables) — mode dark UNIQUE : `<html class="dark">` en dur dans `src/app/layout.tsx`, aucun toggle, aucun mode clair.
  - [x] Créer les répertoires de couches avec un `.gitkeep` ou un fichier index minimal : `src/components/`, `src/state/`, `src/pipeline/`, `src/app/api/fal/proxy/`, `src/lib/` (AR-LAYERS).
- [x] Task 2 : Design tokens Tailwind 4 + shadcn (AC: 2)
  - [x] Dans `src/app/globals.css` (Tailwind 4 = config CSS-first via `@theme` / variables CSS) : définir les 12 couleurs de la palette comme tokens (`--color-fond-projection: #0B0D12`, etc.) ET mapper les variables shadcn du dark (`--background` → fond-projection, `--card` → surface-carte, `--popover`/surfaces élevées → surface-elevee, `--foreground` → texte-principal, `--muted-foreground` → texte-secondaire, `--border` → bordure, `--primary` → or-lumineux, `--primary-foreground` → or-lumineux-foreground). Tokens non listés = défauts dark shadcn (DESIGN.md).
  - [x] `--radius-lg: 12px` (cadres média) ; token d'espacement `--spacing-scene-gap: 48px`.
  - [x] Rôles typographiques en classes utilitaires ou variables : `display` (30px/600/1.2/-0.01em), `carton-titre` (13px/500/1.4/0.12em, `font-variant-caps: all-small-caps` ou `uppercase` + tracking), `attente` (16px/400/1.6). Geist Sans est fourni par `create-next-app` (package `geist`) — la conserver, pas d'autre fonte.
- [x] Task 3 : Layout applicatif (AC: 3, 5)
  - [x] `src/app/layout.tsx` : `<html lang="fr" class="dark">`, fond `fond-projection`, Geist Sans.
  - [x] `src/app/page.tsx` + composant shell dans `src/components/` : colonne centrée `max-w-5xl mx-auto`, bandeau fixe en haut (emplacement du futur Stepper — placeholder discret acceptable), zone « scène » centrale, emplacement action principale sous la scène aligné à droite. Pas de sidebar, pas de nav secondaire. Profondeur par ton, pas d'ombres.
  - [x] Pied de page : ligne discrète en `texte-secondaire` : « Vos photos sont supprimées automatiquement après 24 heures. »
- [x] Task 4 : Garde « écran trop petit » (AC: 4)
  - [x] Composant `src/components/` affichant plein écran « RoomReveal est conçu pour un écran d'ordinateur » quand `viewport width < 1024px` — CSS pur recommandé (media query : en dessous de 1024px masquer l'app et afficher le message ; pas de JS resize listener nécessaire). Aucune adaptation responsive du reste de l'UI.
- [x] Task 5 : Config env & lecture unique (AC: 6)
  - [x] Module serveur unique de config env (ex. `src/lib/env.ts` ou co-localisé côté serveur) : lit `process.env.FAL_KEY` une seule fois, exporté ; `server-only` import guard pour interdire l'import client. Créer `.env.local.example` documentant `FAL_KEY`. NE PAS créer le proxy fal (Story ultérieure) — seulement le répertoire `src/app/api/fal/proxy/` vide.
- [x] Task 6 : Vitest + test de fumée (AC: 6)
  - [x] Installer Vitest (+ `@vitejs/plugin-react`, environnement `jsdom` ou `happy-dom`, `@testing-library/react` optionnel pour le smoke test de rendu). Script `npm test`.
  - [x] Un test de fumée qui passe (ex. rendu du shell ou test trivial d'un util `lib/`).
  - [x] Vérifier `npm run lint`, `npx tsc --noEmit`, `npm test` et `npm run build` passent tous.

## Dev Notes

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AR-LAYERS / AD-1 (diagramme)** : sens de dépendance strict `components/ → state/ → pipeline/ → api/fal/proxy` ; `lib/` = couche feuille pure importable par toutes, n'importe ni `pipeline/` ni `@fal-ai/client`. L'UI n'importe JAMAIS `pipeline/` ni `@fal-ai/client`. Cette story ne crée que la structure — aucun code pipeline/fal.
- **AR-CONFIG** : toute variable d'environnement lue une seule fois côté serveur. `FAL_KEY` n'apparaît jamais côté client (AD-4).
- **AR-TESTS** : Vitest. Les conventions de test aval : reducer testé pur sans mock ; adaptateurs mockés à la frontière `(inputs, {signal, onPhase})`. Pour cette story : juste le socle + smoke test.
- **Nommage** : code et commentaires en anglais ; mapping glossaire fixe : `originalPhoto`, `mask`, `emptyRoom`, `reveal`, `generation`, `step`. UI 100 % français (NFR-6), pas d'i18n.
- **Stack (versions vérifiées 2026-07-10)** : Next.js 16.2.x (App Router), React 19.2.x, Tailwind CSS 4.3.x, shadcn/ui CLI `shadcn@latest`, Node LTS. Ne pas installer `@fal-ai/client` ni `@fal-ai/server-proxy` dans cette story (stories aval).

### Contraintes design (DESIGN.md — fait foi)

- **Posture** : « salle de projection » — la photo utilisateur est la star, l'UI s'efface. Fond plus sombre que le dark shadcn. Hiérarchie par ton (fond → surface-carte → surface-elevee), PAS d'ombres portées.
- **Or `#F2C14E`** : réservé aux actes de Génération (bouton primaire d'étape, étape active du stepper, barre d'attente, lueur Révélation). Jamais pour chrome/liens/états neutres.
- **À éviter absolument** : gradients décoratifs, deuxième couleur d'accent, aplats clairs, cartes blanches, pilules sur les surfaces (`full` réservé aux points du stepper).
- **Composants shadcn utilisés tels quels** (contrat : ne pas les personnaliser) : `Button`, `Progress`, `Slider`, `Tooltip`, `Dialog`, `Toast`. Pour cette story, installer au minimum `Button` (utile au shell) ; les autres au fil des stories.
- Mockups de référence indicatifs : `_bmad-output/planning-artifacts/ux-designs/ux-flux_test-2026-07-10/mockups/mock-etape-masque.html` et `mock-etape-video.html` (les spines font foi en cas de conflit).

### Contraintes UX (EXPERIENCE.md)

- Microcopies : vouvoiement sobre, jamais de jargon technique, pas d'emojis. Seuil écran trop petit : 1024 px.
- Accessibilité plancher : focus visible (ring shadcn, jamais supprimé), traversable au clavier, `lang="fr"`.
- L'app est UNE seule vue (le wizard 4 étapes) — pas de routing multi-pages. `src/app/page.tsx` est la page unique.

### Project Structure Notes

- Racine du repo = racine de l'app Next.js (pas de sous-dossier `roomreveal/`). Contenu existant à préserver : `_bmad/`, `_bmad-output/`, `docs/`, `test-assets/`.
- Le repo n'est PAS encore un dépôt git → `git init` fait partie du setup.
- Structure cible (Structural Seed) :

```text
src/app/                # page unique du wizard + api/fal/proxy/route.ts (répertoire seul pour l'instant)
src/components/         # surfaces UX (shell + garde écran dans cette story)
src/state/              # (vide — Story 1.2)
src/pipeline/           # (vide — Epic 2+)
src/lib/                # env.ts ; primitives pures ensuite
```

### Pièges connus (recherche 2026-07-10)

- `create-next-app` refuse un dossier contenant des fichiers non-allowlistés → scaffold en dossier temporaire puis déplacement.
- Tailwind 4 : plus de `tailwind.config.js` par défaut — tokens via `@theme` dans le CSS. `npx shadcn@latest init` supporte Tailwind 4 et Next 16 ; il génère les variables dans `globals.css`.
- Dark unique : garder uniquement le bloc `.dark` (ou fusionner les valeurs dark dans `:root`) + `class="dark"` sur `<html>` ; supprimer toute logique de thème clair.
- Vitest + React 19 : utiliser `@vitejs/plugin-react` récent ; `environment: 'jsdom'` dans `vitest.config.ts` ; alias `@/` à répliquer dans la config Vitest (`resolve.alias` ou `vite-tsconfig-paths`).

### Testing Requirements

- Smoke test Vitest qui passe (`npm test`).
- Validation manuelle : `npm run dev` → page sombre `#0B0D12`, colonne `max-w-5xl`, pied de page confidentialité ; fenêtre < 1024 px → message plein écran.
- `npm run build` sans erreur avant de terminer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] (ACs, AR-*, UX-DR*)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-flux_test-2026-07-10/ARCHITECTURE-SPINE.md#Design Paradigm, #Consistency Conventions, #Stack, #Structural Seed]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-flux_test-2026-07-10/DESIGN.md] (frontmatter tokens + Brand & Style, Colors, Typography, Layout & Spacing, Elevation & Depth, Shapes)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-flux_test-2026-07-10/EXPERIENCE.md#Foundation, #Accessibility Floor, #Cycle de vie de la Génération]
- [Source: _bmad-output/planning-artifacts/prds/prd-flux_test-2026-07-10/prd.md#8 (NFR-4, NFR-5, NFR-6)]

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5)

### Debug Log References

- Conflit peer npm : `@vitejs/plugin-react@6` (peerOptional babel 8 RC) vs package `shadcn@4.13` (babel 7, importé par le preset CSS `shadcn/tailwind.css`) → remplacé par `@vitejs/plugin-react-swc` (sans babel).
- Testing Library : cleanup automatique entre tests exige `globals: true` dans `vitest.config.ts` (sinon double rendu et `getByText` échoue sur éléments multiples).

### Completion Notes List

- Scaffold `create-next-app@16.2` réalisé en dossier temporaire puis déplacé à la racine (racine non vide) ; `git init` + commit initial inclus par le scaffold. Versions installées : Next.js 16.2.10, React 19.2.4, Tailwind CSS 4.3.2.
- shadcn CLI 4.13 (nouvelles options) : init `-b radix -p nova` (preset Lucide/Geist), composants `button` et `tooltip` ajoutés. Le preset installe le package npm `shadcn` (source de `shadcn/tailwind.css`).
- Mode dark unique : valeurs RoomReveal mappées directement dans `:root` (pas de bloc `.dark` séparé), `class="dark"` en dur sur `<html lang="fr">` pour les variantes `dark:` des composants shadcn.
- Tokens : 12 couleurs + `--spacing-scene-gap` dans `@theme` (utilities `bg-fond-projection`, `text-texte-secondaire`, `pt-scene-gap`…) ; `--radius-lg: 12px` ; rôles typo en `@utility` (`text-display`, `text-carton-titre` en uppercase tracké, `text-attente`).
- Shell wizard : `AppShell` (slots `stepper` / scène / `primaryAction` alignée à droite, footer confidentialité) + `ScreenTooSmall` en CSS pur (`max-lg`, seuil 1024 px). `page.tsx` affiche la promesse d'une ligne + placeholder de zone d'upload (remplacé en Story 1.3).
- `src/lib/env.ts` : lecture unique de `FAL_KEY` derrière `import "server-only"` ; `.env.local.example` documenté. Répertoires de couches `src/state/`, `src/pipeline/`, `src/app/api/fal/proxy/` créés (`.gitkeep`).
- Cycle TDD respecté : smoke tests écrits d'abord (RED sur le boilerplate), puis implémentation (GREEN). Validations finales : `npm test` (2/2), `npx tsc --noEmit`, `npm run lint`, `npm run build` tous OK. Vérification visuelle Playwright : rendu desktop 1280 px conforme (fond `#0B0D12`, colonne centrée, footer) et garde plein écran à 900 px.

### File List

- `package.json`, `package-lock.json` (nouveau — scaffold + deps : `server-only`, `shadcn`, vitest & co)
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`, `.gitignore` (nouveau — scaffold)
- `components.json` (nouveau — config shadcn)
- `vitest.config.ts` (nouveau)
- `.env.local.example` (nouveau)
- `src/app/globals.css` (modifié — tokens RoomReveal, dark unique, rôles typo)
- `src/app/layout.tsx` (modifié — lang fr, dark, Geist Sans, metadata RoomReveal)
- `src/app/page.tsx` (modifié — shell wizard + promesse + placeholder upload)
- `src/app/page.test.tsx` (nouveau — smoke tests)
- `src/components/app-shell.tsx` (nouveau)
- `src/components/screen-too-small.tsx` (nouveau)
- `src/components/ui/button.tsx`, `src/components/ui/tooltip.tsx` (nouveau — shadcn)
- `src/lib/utils.ts` (nouveau — shadcn), `src/lib/env.ts` (nouveau)
- `src/state/.gitkeep`, `src/pipeline/.gitkeep`, `src/app/api/fal/proxy/.gitkeep` (nouveau)
- `public/*` (scaffold), `README.md`, `AGENTS.md`, `CLAUDE.md` (scaffold)

## Change Log

- 2026-07-10 : Story 1.1 implémentée — socle Next.js 16.2 + shadcn dark unique, tokens DESIGN.md, shell wizard, garde écran, env serveur, Vitest. Commit `2cfc08c`. Statut → review.
- 2026-07-11 : Revue de code adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 4 findings corrigés, story → done.

## Senior Developer Review (AI)

**Date :** 2026-07-11 · **Résultat :** Approuvé après corrections · **Verdict ACs :** AC1–AC6 tous PASS (Acceptance Auditor).

3 couches adversariales lancées en parallèle. Après triage (sévérité recalibrée au contexte réel) : 4 findings retenus et corrigés, le reste écarté (faux positifs / conformes au spec) ou différé (consommateur dans une story ultérieure).

### Action Items

- [x] **[Moyen]** `.env.local.example` gitignoré (`.gitignore .env*`) → ajout de `!.env.local.example` + fichier committé (Auditor + Blind).
- [x] **[Moyen]** `--font-sans: var(--font-sans)` auto-référentiel → variable next/font renommée `--font-geist-sans`, mappée dans `@theme inline` (pattern shadcn) (Edge + Blind).
- [x] **[Bas]** `package-lock.json` désynchronisé (`name: roomreveal-scaffold`) → `npm install`, nom corrigé en `roomreveal` (Blind).
- [x] **[Bas]** SVG orphelins dans `public/` (aucune référence) → `next/vercel/file/globe/window.svg` supprimés (Edge).

### Écartés (faux positifs / conformes au spec)

- Tokens `succes`/`erreur` « morts » → AC2 exige les 12 tokens ; DESIGN.md précise que `erreur` ne remplace pas `destructive` shadcn.
- Double vocabulaire de tokens (brand vs sémantique) → source unique, les tokens sémantiques mappent vers les tokens brand.
- `class="dark"` + valeurs dark dans `:root` → dark-only intentionnel (UX-DR1) ; `class="dark"` requis par les variantes `dark:` des composants shadcn.
- `.gitkeep` des couches → AC1/AR-LAYERS exige `state/`, `pipeline/`, `api/fal/proxy/`.
- Footer « 24 heures » → exigé par AC5/UX-DR16/NFR-4 (purge fal TTL câblée en story aval, AD-9).
- sticky vs fixed, preset shadcn, branches falsy ReactNode théoriques → sans impact réel.

### Différés (réels, story ultérieure)

- **Validation fail-fast de `FAL_KEY`** → aucun consommateur avant la story proxy ; un throw au chargement casserait toutes les pages de la story 1.1. À câbler avec le proxy `/api/fal/proxy` (AD-4).
- **Couverture du breakpoint 1024 px** → jsdom n'applique pas le CSS ; les tests E2E du Parcours sont explicitement différés v1 par la spine. Garde vérifiée manuellement via Playwright (900 px → message plein écran).
