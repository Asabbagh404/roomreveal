---
baseline_commit: NO_VCS
---

# Story 1.1: Socle applicatif & identité visuelle RoomReveal

Status: ready-for-dev

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

- [ ] Task 1 : Initialiser le projet Next.js à la racine du repo (AC: 1)
  - [ ] `create-next-app` avec Next.js 16.2.x, App Router, TypeScript, Tailwind CSS 4.3.x, `--src-dir`, sans ESLint config exotique (defaults). ⚠️ La racine `flux_test/` n'est pas vide (`_bmad/`, `_bmad-output/`, `docs/`, `test-assets/`) : `create-next-app` refuse les dossiers non standards → scaffolder dans un dossier temporaire (scratchpad) puis déplacer les fichiers générés à la racine du repo. Ne PAS créer de sous-dossier `roomreveal/` : `src/` vit à la racine du repo.
  - [ ] `git init` + `.gitignore` Next.js standard (le repo n'est pas encore un dépôt git) ; ajouter `_bmad-output/` et `_bmad/` au `.gitignore` ? NON — les garder versionnés (artefacts de planning du projet). Commit initial après scaffold.
  - [ ] Initialiser shadcn/ui via `npx shadcn@latest init` (style default, base color neutral, CSS variables) — mode dark UNIQUE : `<html class="dark">` en dur dans `src/app/layout.tsx`, aucun toggle, aucun mode clair.
  - [ ] Créer les répertoires de couches avec un `.gitkeep` ou un fichier index minimal : `src/components/`, `src/state/`, `src/pipeline/`, `src/app/api/fal/proxy/`, `src/lib/` (AR-LAYERS).
- [ ] Task 2 : Design tokens Tailwind 4 + shadcn (AC: 2)
  - [ ] Dans `src/app/globals.css` (Tailwind 4 = config CSS-first via `@theme` / variables CSS) : définir les 12 couleurs de la palette comme tokens (`--color-fond-projection: #0B0D12`, etc.) ET mapper les variables shadcn du dark (`--background` → fond-projection, `--card` → surface-carte, `--popover`/surfaces élevées → surface-elevee, `--foreground` → texte-principal, `--muted-foreground` → texte-secondaire, `--border` → bordure, `--primary` → or-lumineux, `--primary-foreground` → or-lumineux-foreground). Tokens non listés = défauts dark shadcn (DESIGN.md).
  - [ ] `--radius-lg: 12px` (cadres média) ; token d'espacement `--spacing-scene-gap: 48px`.
  - [ ] Rôles typographiques en classes utilitaires ou variables : `display` (30px/600/1.2/-0.01em), `carton-titre` (13px/500/1.4/0.12em, `font-variant-caps: all-small-caps` ou `uppercase` + tracking), `attente` (16px/400/1.6). Geist Sans est fourni par `create-next-app` (package `geist`) — la conserver, pas d'autre fonte.
- [ ] Task 3 : Layout applicatif (AC: 3, 5)
  - [ ] `src/app/layout.tsx` : `<html lang="fr" class="dark">`, fond `fond-projection`, Geist Sans.
  - [ ] `src/app/page.tsx` + composant shell dans `src/components/` : colonne centrée `max-w-5xl mx-auto`, bandeau fixe en haut (emplacement du futur Stepper — placeholder discret acceptable), zone « scène » centrale, emplacement action principale sous la scène aligné à droite. Pas de sidebar, pas de nav secondaire. Profondeur par ton, pas d'ombres.
  - [ ] Pied de page : ligne discrète en `texte-secondaire` : « Vos photos sont supprimées automatiquement après 24 heures. »
- [ ] Task 4 : Garde « écran trop petit » (AC: 4)
  - [ ] Composant `src/components/` affichant plein écran « RoomReveal est conçu pour un écran d'ordinateur » quand `viewport width < 1024px` — CSS pur recommandé (media query : en dessous de 1024px masquer l'app et afficher le message ; pas de JS resize listener nécessaire). Aucune adaptation responsive du reste de l'UI.
- [ ] Task 5 : Config env & lecture unique (AC: 6)
  - [ ] Module serveur unique de config env (ex. `src/lib/env.ts` ou co-localisé côté serveur) : lit `process.env.FAL_KEY` une seule fois, exporté ; `server-only` import guard pour interdire l'import client. Créer `.env.local.example` documentant `FAL_KEY`. NE PAS créer le proxy fal (Story ultérieure) — seulement le répertoire `src/app/api/fal/proxy/` vide.
- [ ] Task 6 : Vitest + test de fumée (AC: 6)
  - [ ] Installer Vitest (+ `@vitejs/plugin-react`, environnement `jsdom` ou `happy-dom`, `@testing-library/react` optionnel pour le smoke test de rendu). Script `npm test`.
  - [ ] Un test de fumée qui passe (ex. rendu du shell ou test trivial d'un util `lib/`).
  - [ ] Vérifier `npm run lint`, `npx tsc --noEmit`, `npm test` et `npm run build` passent tous.

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

### Debug Log References

### Completion Notes List

### File List
