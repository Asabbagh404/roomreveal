---
baseline_commit: 683e995
---

# Story 4.3: Téléchargement du MP4

Status: done

## Story

As a utilisateur,
I want télécharger ma Révélation en MP4,
so that je puisse la publier ou la montrer hors de l'application.

## Acceptance Criteria

1. **Given** une Révélation prête (`generation.reveal`) **When** l'utilisateur clique « Télécharger le MP4 » **Then** le fichier est récupéré depuis l'URL fal (**fetch client → Blob → objectURL → `<a download>`**, **jamais re-hébergé côté serveur**, l'objectURL est révoqué après) et téléchargé (FR-12, AR-EPHEMERAL, AD-4).
2. **Given** le MP4 téléchargé **When** il est ouvert **Then** il se lit dans les lecteurs standards (VLC, QuickTime, lecteur natif OS) (FR-12) — *propriété du MP4 kling, vérif live*.

## Tasks / Subtasks

- [x] Task 1 : `src/lib/download-file.ts` (nouveau) — utilitaire de téléchargement navigateur (AC: 1)
  - [x] `downloadFile(url: string, filename: string): Promise<void>` : `fetch(url)` → si `!res.ok` throw → `res.blob()` → `URL.createObjectURL(blob)` → créer un `<a href=objectUrl download=filename>`, `appendChild`, `click()`, `remove()` → révoquer l'objectURL (en différé, ex. `setTimeout(revoke, ~4 s)`, pour ne pas annuler le téléchargement dans certains navigateurs). **Aucun appel fal API / aucun proxy** : c'est un simple GET public de l'URL storage (AD-4). Feuille `lib/` (browser), pas dans `pipeline/`.
- [x] Task 2 : `src/components/reveal-player.tsx` — bouton d'or « Télécharger le MP4 » (AC: 1)
  - [x] Sous le lecteur, dans la **rangée d'actions**, ajouter le bouton d'or « Télécharger le MP4 » (`GenerationButton`, style bouton-génération = l'action d'or de la surface Vidéo, UX-DR13/DESIGN) **après** « Revoir ». Ordre canonique cible (DESIGN, la plus forte en dernier) : « Nouvelle Génération » (ghost, Story 4.4) · « Revoir » (outline, 4.2) · « Télécharger le MP4 » (or, 4.3). Regrouper « Revoir » + « Télécharger » dans un conteneur `flex items-center gap-3` ; laisser la place à « Nouvelle Génération » en tête (4.4).
  - [x] `onClick` : état local `downloading` → label « Téléchargement… » + désactivé pendant le fetch ; appelle `downloadFile(src, "roomreveal.mp4")` ; `catch` → message inline discret « Le téléchargement a échoué. Réessayez. » (`role="alert"`, motif `mask-surface` validateError) ; `finally` downloading=false. AR-LAYERS : le composant appelle un util `lib/`, pas `pipeline/`.
- [x] Task 3 : Vérification (AC: 1, 2)
  - [x] `npm test` + `tsc` + `lint` + `build` verts (aucune régression Epics 1–4.2).
  - [x] **Live (FAL_KEY)** : Révélation prête → « Télécharger le MP4 » (or) → un fichier `roomreveal.mp4` se télécharge (fetch de l'URL fal, blob local, pas d'appel serveur/proxy — vérifier dans l'onglet réseau qu'aucune route serveur ne relaie) ; ouvrir le fichier → **se lit dans VLC/QuickTime/lecteur natif** (AC2). Erreur simulée (URL coupée) → message inline, pas de crash. 0 erreur console.

## Dev Notes

### État en place (NE PAS recréer)

- **`reveal-player.tsx`** (4.2) : rendu du lecteur + rangée d'actions contenant **« Revoir »** (`Button variant="outline"`, replay). C'est LÀ qu'on ajoute « Télécharger le MP4 ». `src` = `generation.reveal` (URL MP4 fal publique). État local `isPlaying`/`firstPlayGlow` déjà présents ; ajouter `downloading`/`downloadError`.
- **`GenerationButton`** (`components/generation-button.tsx`) : bouton d'or (UX-DR13), props `children`/`disabled`/`tooltip`/`subtext`/`onClick`. À utiliser pour « Télécharger le MP4 » (pas de subtext).
- **`ui/button.tsx`** : `variant` outline (Revoir) / ghost (future Nouvelle Génération) / default (or).
- **`generation.reveal`** : URL fal du MP4 (24 h, AD-9). Chargement/fetch **direct** (GET public, AD-4) — jamais via `/api/fal/proxy`, jamais re-hébergé.
- **Motif erreur inline** : `mask-surface.tsx` `validateError` (`<p role="alert" aria-live="assertive" className="text-sm text-erreur">`).

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-4** : le chargement direct des URLs publiques du storage fal (affichage, lecteur, **téléchargement du MP4**) est permis — GET non authentifié, **hors proxy**. NE PAS router le download par `/api/fal/proxy` (réservé aux appels API fal). [Source: ARCHITECTURE-SPINE.md#AD-4, ligne 74]
- **AR-EPHEMERAL / AD-9** : « l'application ne copie rien ; les URLs fal sont périssables — le MP4 se télécharge depuis l'URL fal, **jamais re-hébergé** (téléchargement = fetch client → Blob → objectURL, l'attribut `download` étant **ignoré en cross-origin**, d'où le passage par un blob: same-origin ; jamais de route serveur de relais) ». C'est le contrat EXACT de cette story. [Source: ARCHITECTURE-SPINE.md#AD-9, ligne 105]
- **AR-LAYERS** : présentation + util `lib/`. Le download n'est PAS un adaptateur pipeline (aucun `@fal-ai/client`, aucun `FAL_KEY`) → `lib/download-file.ts` (feuille browser), appelé par `reveal-player`. Reducer/pipeline inchangés. [Source: 4-1/4-2 Dev Notes]

### Contraintes UX (font foi)

- **« Télécharger le MP4 »** = style bouton-génération (or), la plus forte des 3 actions sous le lecteur ; ordre canonique « Nouvelle Génération » (ghost) · « Revoir » (outline) · « Télécharger le MP4 » (or) (DESIGN.md:160). En 4.3, « Nouvelle Génération » n'existe pas encore (Story 4.4) — laisser sa place en tête de rangée. [Source: DESIGN.md:160, EXPERIENCE.md:72]
- Fichier lisible VLC/QuickTime/natif (FR-12). [Source: epics.md#4.3, EXPERIENCE.md:72]
- Pas de confetti/toast (UX-DR15, hérité 4.2) — un simple téléchargement.

### Pièges connus

- **Cross-origin `download`** : `<a href="https://fal.media/…" download>` **ne télécharge PAS** (l'attribut `download` est ignoré cross-origin → le navigateur navigue/ouvre au lieu de télécharger). D'où **obligatoire** : `fetch` → `blob` → `URL.createObjectURL` (URL `blob:` **same-origin**) → `<a download>` → révoquer. NE PAS pointer l'`<a>` directement sur l'URL fal.
- **Révocation de l'objectURL** : ne pas révoquer **avant** que le click ait initié le téléchargement. Révoquer en différé (setTimeout) après le click.
- **Pas de proxy / pas de re-hébergement** : fetch **direct** de l'URL fal ; aucune route serveur (`/api/…`) ne relaie le MP4 (AD-9).
- **URL expirée (24 h)** : un fetch d'une Révélation périmée → 404 → `!res.ok` → throw → message inline (pas de crash). Acceptable (l'utilisateur régénère).
- **AR-LAYERS** : ne pas mettre le download dans `pipeline/` (ce n'est pas un appel fal API). `lib/download-file.ts`.
- **Ne pas ajouter « Nouvelle Génération »** ici (Story 4.4).

### Testing Requirements

- **Pur (Vitest)** : `download-file.test.ts` — mock `global.fetch` (→ `{ ok:true, blob:() => Blob }`), stub `URL.createObjectURL`/`revokeObjectURL` (non implémentés en jsdom), espionner la création d'un `<a>` avec `download === filename` et `href === objectUrl` + `click()` appelé ; cas `!res.ok` → rejette. (jsdom supporte `createElement('a')`/`click()` ; `createObjectURL` à stubber.)
- **Non testable jsdom → live (FAL_KEY)** : téléchargement réel + lecture VLC/QuickTime (AC2), absence de relais serveur. Vérif live.
- Régression : suites 1.x/2.x/3.x/4.x vertes ; `tsc`/`lint`/`build`.

### Project Structure Notes

- **Nouveau** : `src/lib/download-file.ts` (+ `.test.ts`).
- **Modif** : `src/components/reveal-player.tsx` (bouton « Télécharger le MP4 » + rangée d'actions + état downloading/erreur).
- Nommage anglais. Réutilise `GenerationButton`, `ui/button`, motif erreur inline. Ne réinvente rien.

### References

- [Source: epics.md#Story 4.3]
- [Source: ARCHITECTURE-SPINE.md#AD-4 (ligne 74), AD-9/AR-EPHEMERAL (ligne 105), AR-LAYERS]
- [Source: prd.md#FR-12 ; EXPERIENCE.md:72 ; DESIGN.md:160 (ordre des actions, bouton-génération)]
- [Source: src/components/reveal-player.tsx (4.2, rangée d'actions), generation-button.tsx, mask-surface.tsx (erreur inline)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Test `download-file` : capture de l'`<a>` via un spy `document.createElement` (pas d'alias de `this` sur le spy `click` → évite l'erreur lint `no-this-alias`).

### Completion Notes List

- **`lib/download-file.ts`** (nouveau) : `downloadFile(url, filename)` — `fetch(url)` (throw si `!res.ok`) → `res.blob()` → `URL.createObjectURL` → `<a href download>` détaché, `click()`, `remove()` → `URL.revokeObjectURL` **différé** (`setTimeout` 10 s, pour ne pas annuler le téléchargement). Feuille `lib/` browser, aucun proxy/pipeline (GET public AD-4, jamais re-hébergé AD-9).
- **`reveal-player.tsx`** : rangée d'actions `flex gap-3` — « Revoir » (outline) + **« Télécharger le MP4 »** (`GenerationButton` or). État `downloading` (label « Téléchargement… » + désactivé) + `downloadError` inline (`role="alert"`). `onClick` → `downloadFile(src, "roomreveal.mp4")`. AR-LAYERS (appelle `lib/`, pas `pipeline/`). Place laissée en tête pour « Nouvelle Génération » (4.4).
- **Tests** : `download-file.test.ts` (2 — fetch→blob→objectURL→`<a download>` cliqué + attributs ; `!res.ok`→rejette ; `createObjectURL` stubé car absent de jsdom). **143 tests verts** (+2), `tsc`/`lint`/`build` OK. Téléchargement réel + lecture VLC/QuickTime = **vérif live**.

### File List

- `src/lib/download-file.ts` (nouveau)
- `src/lib/download-file.test.ts` (nouveau)
- `src/components/reveal-player.tsx` (modifié — bouton « Télécharger le MP4 » + rangée d'actions + état downloading/erreur)

## Change Log

- 2026-07-12 : Story 4.3 créée (create-story) — téléchargement du MP4 (fetch→Blob→objectURL→`<a download>`, jamais re-hébergé, AD-4/AD-9). `lib/download-file.ts` + bouton d'or dans `reveal-player`. Statut → ready-for-dev.
- 2026-07-12 : Story 4.3 implémentée (dev-story) — `lib/download-file.ts` + bouton d'or « Télécharger le MP4 » dans `reveal-player` (busy/erreur inline). 143 tests, tsc/lint/build verts. Statut → review. Vérif live en attente.
- 2026-07-12 : Revue adversariale (passe unique, surface réduite). ACs 1-2 PASS (AC2 live-only). 0 CRITICAL/HIGH. 2 correctifs, reste noté/différé. 144 tests verts. Statut → **done**. Vérif live en attente.

## Senior Developer Review (AI)

**Date :** 2026-07-12 · **Résultat :** Approuvé après 2 correctifs · **Verdict ACs :** AC1 PASS statiquement (fetch direct fal → blob → objectURL → `<a download>` → révoc différée ; hors proxy, jamais re-hébergé, AD-4/AD-9 ; `lib/` pas `pipeline/`, AR-LAYERS ; bouton d'or, busy, erreur inline, garde double-clic). AC2 (lecture VLC/QuickTime) = live-only correctement scopée.

### Correctifs appliqués

- [x] **[Moyen]** setState-après-unmount : `finally { setDownloading(false) }` (et `setDownloadError`) s'exécutent après l'`await` ; si l'utilisateur quitte pendant un gros téléchargement → warning React. Ajout d'un `mountedRef` (ré-initialisé à `true` dans l'effet pour StrictMode) gardant les deux setState. (Review)
- [x] **[Moyen]** Test : la révocation différée n'était pas asservie → un `setTimeout(revoke)` supprimé passait inaperçu. Ajout d'un test `vi.useFakeTimers()` : `revokeObjectURL` non appelé avant, puis appelé avec l'objectURL après `runAllTimers`. (Review)

### Écartés / Différés (documentés)

- **`setTimeout` de révocation non annulé à l'unmount** (Moyen) : bénin — `revokeObjectURL` est idempotent/no-op sur une URL déjà consommée, et le blob est tenu par le gestionnaire de téléchargement ; annuler exigerait de plomber un handle → sur-ingénierie pour ce périmètre.
- **Pas de timeout/AbortController sur le `fetch`** (Bas) : un réseau bloqué laisse « Téléchargement… » indéfiniment. Gap de complétude, hors périmètre 4.3 — à envisager si besoin (AbortController + timeout ~60 s lié à l'unmount).
- **`downloading` dans les deps du `useCallback`** (Bas) : pas un bug (`disabled={downloading}` empêche le double-clic d'atteindre la garde) ; un `useRef` serait plus propre mais non nécessaire.
- **Nom de fichier fixe `roomreveal.mp4`** (Bas) : défaut raisonnable ; aucune AC n'exige un nom dynamique.
