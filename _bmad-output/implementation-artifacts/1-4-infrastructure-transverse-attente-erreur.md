---
baseline_commit: fe764f9
---

# Story 1.4: Infrastructure transverse d'attente & d'erreur

Status: review

## Story

As a développeur de RoomReveal,
I want des composants transverses de Panneau d'attente et de Bandeau d'erreur branchés sur le reducer,
so that chaque étape aval hérite d'une attente honnête et d'une gestion d'erreur uniforme sans les réimplémenter.

## Acceptance Criteria

1. **Given** une opération en cours exposant un `WaitPhase` dans l'état **When** le Panneau d'attente est rendu **Then** il affiche une barre de progression or **par phases nommées** (traduction française du `WaitPhase` : « Envoi de vos images » → « Génération de la Révélation » → « Finalisation ») et le temps écoulé, jamais un spinner muet ni un faux pourcentage (FR-14, UX-DR11, AR-WAITPHASE) **And** la barre ne recule jamais (monotonie par tentative imposée par le reducer)
2. **Given** une attente longue en cours depuis plus de 3 min 30 s **When** le Panneau d'attente est affiché **Then** il ajoute « C'est plus long que prévu — encore quelques instants » (UX-DR11)
3. **Given** un `StepError { step, retryable, userMessage }` présent dans l'état **When** le Bandeau d'erreur est rendu **Then** il affiche `userMessage` en français + **une seule action** : relancer l'étape concernée, sans jamais montrer de trace technique (FR-17, UX-DR12, AR-ERRORS) **And** les artefacts déjà acquis restent visibles derrière le bandeau
4. **Given** un résultat « aucun meuble détecté » **When** il est présenté **Then** le Bandeau utilise une variante neutre (accent `texte-secondaire`) et n'est pas traité comme une erreur (UX-DR12, préparation FR-16)
5. **Given** les changements d'étape, fins d'attente et erreurs **When** ils surviennent **Then** ils sont annoncés via `aria-live` (`polite` pour étapes/fin d'attente, `assertive` pour erreurs) (UX-DR18) **And** le Bouton de Génération suit le patron canonique : primaire or unique par surface, désactivé tant que la précondition n'est pas remplie avec tooltip (UX-DR13)

## Tasks / Subtasks

- [x] Task 1 : Traduction WaitPhase → microcopie (pure, AD-14) (AC: 1)
  - [x] `src/components/wait-copy.ts` (ou co-localisé) : fonction PURE `waitPhaseLabel(step: Step, phase: WaitPhase): string`. La traduction appartient au Panneau SEUL (AD-14) — mapping **par étape** avec les microcopies d'EXPERIENCE.md : pour `video` : `uploading`→« Envoi de vos images », `queued`/`generating`→« Génération de la Révélation », `finalizing`→« Finalisation » ; pour `mask` (detect) : `generating`→« Détection des meubles… » ; pour `emptyRoom` (inpaint) : `generating`→« Génération de la Pièce vide… ». Défaut sobre pour les combinaisons non listées. Constante `LONG_WAIT_MS = 210_000` (3 min 30). Aucun jargon.
- [x] Task 2 : Panneau d'attente (AC: 1, 2, 5)
  - [x] `src/components/wait-panel.tsx` (`"use client"`) : rendu quand `state.waitPhase` est défini. Barre de progression **or** shadcn `Progress` positionnée par index de phase (`WAIT_PHASE_ORDER`), JAMAIS de faux pourcentage temporel ni de spinner muet (UX-DR11). Phase courante nommée via `waitPhaseLabel(state.step, state.waitPhase)`. Temps écoulé affiché (« 1 min 12 s ») via timer local (`setInterval` 1 s ; `Date.now()` autorisé en composant). Pour l'étape `video` : annoncer « 1 à 3 minutes » (FR-14). Au-delà de `LONG_WAIT_MS` : ajouter « C'est plus long que prévu — encore quelques instants » (AC2). La barre ne recule pas (garantie par la monotonie reducer AD-14 ; l'index de phase est monotone). `aria-live="polite"` sur l'annonce de phase/fin d'attente (AC5). Carte `surface-elevee`, texte `text-attente`.
- [x] Task 3 : Bandeau d'erreur (AC: 3, 4, 5)
  - [x] `src/components/error-banner.tsx` (`"use client"`) : deux modes. **Erreur** (`StepError`) : filet gauche `erreur` 3px, `userMessage` en `texte-principal`, **une seule action** « Relancer … » (variante outline), `role="alert"` `aria-live="assertive"`. **Neutre** (« aucun meuble détecté », pas une erreur) : accent `texte-secondaire`, pas de filet rouge, message informatif — NE PAS le traiter comme une erreur (AC4/UX-DR12). Jamais de trace technique (seul `userMessage` FR est affiché). Le bandeau se superpose SANS masquer les artefacts déjà acquis (rendu au-dessus de la scène, artefacts visibles derrière — AC3).
  - [x] Action de relance : la ré-exécution réelle (detect/inpaint/video) vit dans `effects.ts` (Epic 2+). Pour cette story, exposer une prop `onRetry: () => void` ; le câblage par défaut dans la scène dispatch `CLEAR_ERROR` (efface l'erreur pour re-tenter l'étape). Libellé de relance dérivé du `step` via la table `PIPELINE_STEP_TO_PARCOURS` (ex. `detect`→« Relancer la détection », `inpaint`→« Relancer la pièce vide », `video`→« Relancer la vidéo »).
- [x] Task 4 : Bouton de Génération canonique (AC: 5)
  - [x] `src/components/generation-button.tsx` : composant réutilisable = le patron canonique UX-DR13. Primaire **or** unique (style `bouton-generation`), `disabled` tant que `disabled` prop vrai, avec `Tooltip` shadcn expliquant la précondition quand désactivé. Props : `children` (libellé), `disabled`, `tooltip`, `onClick`. Un seul par surface (contrat consommé par les étapes mask/emptyRoom/video en Epic 2+).
- [x] Task 5 : Brancher les transverses dans la scène (AC: 1, 3, 4)
  - [x] `src/components/parcours-scene.tsx` : rendre `WaitPanel` quand `state.waitPhase` défini, et `ErrorBanner` quand `state.error` défini, superposés à la scène (les artefacts restent visibles derrière). Câbler `onRetry` → `dispatch(CLEAR_ERROR)`. (Aucune étape ne pose encore `waitPhase`/`error` — l'infra est prête pour Epic 2+.)
- [x] Task 6 : Tests (AC: 1, 2, 3, 4, 5)
  - [x] `src/components/wait-copy.test.ts` : `waitPhaseLabel` — video/uploading, video/generating, video/finalizing, mask/generating, emptyRoom/generating ; pas de jargon. PUR.
  - [x] `src/components/wait-panel.test.tsx` : rend la phase nommée (pas de « % » ni spinner) ; « 1 à 3 minutes » à l'étape video ; message « plus long que prévu » après `LONG_WAIT_MS` (`vi.useFakeTimers`). Provider seedé via `initialState`.
  - [x] `src/components/error-banner.test.tsx` : mode erreur affiche `userMessage` + une seule action, `role=alert` ; clic relance → `onRetry` appelé ; mode neutre (aucun meuble) sans filet rouge, pas `role=alert`.
  - [x] `src/components/generation-button.test.tsx` : désactivé quand `disabled`, tooltip présent ; actif déclenche `onClick`.
  - [x] Vérifier `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Dev Notes

### État en place (stories 1.1–1.3 — NE PAS recréer)

- Socle + tokens + shell + stepper + upload opérationnels. `src/state/` : reducer + types + contexte prêts.
- **Types déjà définis** (`src/state/types.ts`) : `WaitPhase` (`uploading|queued|generating|finalizing`), `WAIT_PHASE_ORDER`, `StepError { step, retryable, userMessage }`, `PipelineStep`, `PIPELINE_STEP_TO_PARCOURS` (table pipeline→Parcours), `Step`, `STEP_ORDER`. **NE PAS les redéfinir** — importer.
- **Reducer déjà prêt** : `SET_WAIT_PHASE` (monotone par tentative, AD-14), `SET_ERROR` (préserve l'amont, AD-8), `CLEAR_ERROR`. **NE PAS modifier le reducer.** Ces composants LISENT l'état et dispatchent `CLEAR_ERROR` pour la relance minimale.
- **Provider** monté ; `useGeneration()` donne `{ state, dispatch }`. Tests : seed via `GenerationProvider initialState={...}`.
- shadcn dispo : `Button`, `Tooltip`, `Dialog`. Installer `Progress` (`npx shadcn@latest add progress`) pour la barre du Panneau.
- Tokens : `bg-surface-elevee`, `bg-or-lumineux` (barre), `text-erreur`, `text-texte-secondaire`, `text-texte-principal`, `text-attente`, filet gauche via `border-l-[3px] border-erreur`.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AD-14 (WaitPhase)** : enum unique dans les types domaine (déjà là) ; la traduction WaitPhase → microcopie française appartient au **Panneau d'attente SEUL** (mapping par étape). Monotonie par tentative garantie par le reducer — la barre ne recule pas.
- **AD-8 (erreurs)** : `StepError` partout ; `userMessage` FR (glossaire) ; l'UI ne voit JAMAIS de trace fal native. Relance limitée à l'étape concernée. « Aucun meuble détecté » (`initialMask === null`) n'est PAS une erreur → variante neutre.
- **AR-LAYERS** : ces composants sont dans `components/`, importent `state/` (types + contexte) et `lib/utils`. PAS de `pipeline/` ni `@fal-ai/client`. L'orchestration de relance réelle (effects.ts) est hors périmètre de cette story.
- **FR-14 (attente honnête)** : aucune opération > 2 s sans indicateur ; jamais de spinner muet ni de faux pourcentage ; la Génération FLF annonce 1 à 3 minutes.
- **Nommage** : code/commentaires anglais ; UI 100 % français, glossaire, vouvoiement, pas de jargon (« WaitPhase », « StepError », « timeout », « retry » n'apparaissent jamais en UI).

### Contraintes UX (EXPERIENCE.md / DESIGN.md — font foi)

- **Panneau d'attente (UX-DR11, « Attente & Progression »)** : carte centrée, barre or par phases nommées, temps écoulé (« 1 min 12 s »), durée « 1 à 3 minutes » annoncée avant et pendant (étape video), message « plus long que prévu » à 3 min 30 s, jamais de spinner muet ni faux pourcentage. Phases : « Envoi de vos images » → « Génération de la Révélation » → « Finalisation ». (Étapes moyennes Détection/Inpainting : « Détection des meubles… », « Génération de la Pièce vide… », pas de durée annoncée.)
- **Bandeau d'erreur (UX-DR12)** : carte `surface-elevee`, filet gauche `erreur` 3px, message FR + **une seule action** (relancer l'étape). Variante neutre (accent `texte-secondaire`) pour « aucun meuble détecté ». Artefacts acquis restent visibles derrière. Pas de rouge plein écran, pas d'icône alarmiste, ton non culpabilisant.
- **Bouton de Génération (UX-DR13)** : primaire or unique par surface, désactivé tant que la précondition n'est pas remplie (tooltip). Ex. libellés : « Valider le Masque », « Créer ma vidéo », « Télécharger le MP4 » (consommés en Epic 2+).
- **Microcopies (EXPERIENCE.md Voice)** : « Votre Révélation se prépare — comptez 1 à 3 minutes. » ; « La vidéo n'a pas abouti. Votre Masque et votre Pièce vide sont conservés — relancez quand vous voulez. » ; « Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. ». Vouvoiement, pas d'emojis.
- **A11y (UX-DR18)** : `aria-live="polite"` (étapes, fin d'attente), `assertive` (erreurs) ; jamais la couleur seule (le message texte porte l'info) ; focus visible.

### Project Structure Notes

```text
src/components/wait-copy.ts          # waitPhaseLabel (pure) + LONG_WAIT_MS (NEW)
src/components/wait-copy.test.ts     # (NEW)
src/components/wait-panel.tsx        # Panneau d'attente (NEW)
src/components/wait-panel.test.tsx   # (NEW)
src/components/error-banner.tsx      # Bandeau d'erreur (2 modes) (NEW)
src/components/error-banner.test.tsx # (NEW)
src/components/generation-button.tsx # Bouton de Génération canonique (NEW)
src/components/generation-button.test.tsx (NEW)
src/components/ui/progress.tsx       # shadcn add progress (NEW)
src/components/parcours-scene.tsx    # render WaitPanel/ErrorBanner overlays (MODIFIED)
```

### Pièges connus

- **Faux pourcentage interdit** (FR-14/UX-DR11) : la barre est positionnée par **index de phase discret** (0..3), pas par un ratio de temps. Ne PAS animer un % basé sur le temps écoulé.
- **Timer élapsé** : `setInterval` 1 s dans un `useEffect`, nettoyé au démontage ; `Date.now()` est OK dans un composant React (l'interdiction ne concerne que les scripts de workflow). Démarrer le compteur quand `waitPhase` devient défini.
- **`vi.useFakeTimers`** pour tester le seuil 3 min 30 : avancer le temps, vérifier le message. Restaurer les timers réels après.
- **Ne pas traiter « aucun meuble » comme une erreur** : c'est une variante NEUTRE du bandeau, jamais `role="alert"`, jamais de filet rouge (AC4).
- **Ne pas modifier le reducer** : lire l'état + dispatcher `CLEAR_ERROR` uniquement.
- **Bouton de Génération** : composant d'infrastructure consommé par les surfaces d'Epic 2+ (pas d'usage en Epic 1) — c'est le livrable canonique d'AC5, testé isolément.

### Testing Requirements

- `waitPhaseLabel` pur, couvert (cœur d'AC1 traduction par étape).
- Panneau : phase nommée, pas de %/spinner, « 1 à 3 minutes » (video), message long (fake timers) (AC1, AC2).
- Bandeau : erreur (message + 1 action + role=alert + onRetry) et neutre (aucun meuble, pas d'alerte) (AC3, AC4).
- Bouton : disabled + tooltip + onClick (AC5).
- `npm test` + `tsc` + `lint` + `build` verts.

### References

- [Source: epics.md#Story 1.4] (ACs)
- [Source: ARCHITECTURE-SPINE.md#AD-8, AD-14, AR-LAYERS, Consistency Conventions]
- [Source: DESIGN.md#Components (Panneau d'attente, Bandeau d'erreur, Bouton de Génération), Colors]
- [Source: EXPERIENCE.md#Attente & Progression, Component Patterns (Bandeau d'erreur, Bouton de Génération), State Patterns, Voice and Tone, Accessibility Floor]
- [Source: prd.md#FR-14, FR-17, FR-16]

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5)

### Debug Log References

- Lint `react-hooks/set-state-in-effect` : `setElapsed(0)` synchrone dans l'effet du timer → refactorisé (intervalle seul dans l'effet, reset par remontage `key={epoch}` dans ParcoursScene).
- `Tooltip` shadcn (Root) exige un `TooltipProvider` ancêtre → inclus dans `GenerationButton` (autonome).

### Completion Notes List

- `wait-copy.ts` : `waitPhaseLabel(step, phase)` PURE (traduction par étape AD-14, microcopies EXPERIENCE.md) + `LONG_WAIT_MS=210000`.
- `WaitPanel` : rendu si `state.waitPhase` défini. Barre `Progress` positionnée par **index de phase discret** (jamais de faux % temporel ni spinner muet) ; barre or (via `--primary`→or-lumineux). Temps écoulé (timer local `setInterval`, remontage `key={epoch}` pour reset). Étape video : « comptez 1 à 3 minutes ». > 3 min 30 : « C'est plus long que prévu… ». `aria-live=polite`.
- `ErrorBanner` : mode **erreur** (filet gauche `erreur` 3px, `userMessage`, une seule action « Relancer … » via `PIPELINE_STEP_TO_PARCOURS`, `role=alert`/`assertive`) et mode **neutre** (« aucun meuble », accent `texte-secondaire`, pas d'alerte, pas de filet rouge — AC4). Jamais de trace technique.
- `GenerationButton` : patron canonique UX-DR13 (primaire or unique, `disabled` + `Tooltip` de précondition). Composant d'infra consommé par les surfaces Epic 2+.
- `ParcoursScene` : overlays `WaitPanel`/`ErrorBanner` superposés à la scène (artefacts visibles derrière, AC3), `onRetry`→`dispatch(CLEAR_ERROR)`. Reducer NON modifié.
- Erreurs pipeline = `StepError` (AD-8) ; « aucun meuble » traité en variante neutre, pas une erreur.
- Tests : `wait-copy` (4), `wait-panel` (3, dont fake timers pour le seuil 3 min 30), `error-banner` (3), `generation-button` (2). Suite 47/47. `tsc`, `lint`, `build` OK. Vérif Playwright : pas de régression sur la scène Upload, overlays absents sans `waitPhase`/`error`.

### File List

- `src/components/wait-copy.ts`, `src/components/wait-copy.test.ts` (nouveaux)
- `src/components/wait-panel.tsx`, `src/components/wait-panel.test.tsx` (nouveaux)
- `src/components/error-banner.tsx`, `src/components/error-banner.test.tsx` (nouveaux)
- `src/components/generation-button.tsx`, `src/components/generation-button.test.tsx` (nouveaux)
- `src/components/ui/progress.tsx` (nouveau — shadcn)
- `src/components/parcours-scene.tsx` (modifié — overlays transverses)

## Change Log

- 2026-07-11 : Story 1.4 implémentée — Panneau d'attente (phases nommées AD-14, temps écoulé, seuil 3 min 30), Bandeau d'erreur (erreur/neutre, AD-8), Bouton de Génération canonique (UX-DR13), overlays branchés. 47 tests verts. Statut → review.

## Change Log
