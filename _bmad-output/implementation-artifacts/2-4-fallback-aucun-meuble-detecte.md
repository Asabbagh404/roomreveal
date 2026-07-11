---
baseline_commit: 762a0d0
---

# Story 2.4: Fallback « aucun meuble détecté »

Status: done

## Story

As a utilisateur dont la photo ne contient aucun meuble reconnu,
I want être informé et pouvoir peindre moi-même les zones à effacer,
so that le Parcours reste praticable au lieu de me bloquer.

## Acceptance Criteria

1. **Given** une détection qui retourne `initialMask === null` **When** l'étape Masque s'affiche **Then** un bandeau neutre annonce « Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. » (FR-16, UX-DR12) **And** ce cas n'est jamais traité comme une erreur (AR-ERRORS).
2. **Given** le cas « aucun meuble détecté » **When** l'étape Masque s'ouvre **Then** le mode pinceau est pré-activé sur un Masque vierge et le Parcours reste praticable jusqu'au bout (FR-16, Flow 2).
3. **Given** un Masque vierge non peint dans le cas fallback **When** l'utilisateur n'a rien peint **Then** « Valider le Masque » reste désactivé et l'utilisateur peut revenir à l'étape Upload pour changer de photo — jamais d'état sans issue (FR-16, Flow 2).

## Tasks / Subtasks

- [x] Task 1 : Bandeau neutre « aucun meuble détecté » (AC: 1)
  - [x] `src/components/mask-surface.tsx` : quand `state.maskDraft?.detectedMaskUrl === null` (cas FR-16 canonique, AD-5), rendre `<ErrorBanner variant="neutral" message="Aucun meuble détecté. Peignez vous-même les zones à faire disparaître." />` **au-dessus** de l'éditeur (dans le flux de la surface, pas l'overlay transverse). Réutiliser le composant existant (`variant="neutral"` = `role="status"`, aucune action, ce n'est pas une erreur). Ne s'affiche que dans le cas null ; jamais quand un masque a été détecté.
- [x] Task 2 : Vérifier/garantir le comportement fallback déjà en place (AC: 2, 3)
  - [x] Confirmer que `detectedMaskUrl === null` seed un **buffer vierge** (`createBlankBuffer`, déjà fait Story 2.2 `mask-surface`) et que l'outil par défaut est **pinceau** (`DEFAULT_BRUSH`/`tool="brush"`, déjà le défaut). Aucun changement de logique attendu — juste couvrir par un test/vérif.
  - [x] Confirmer que « Valider le Masque » reste **désactivé** sur buffer vierge (`isBufferEmpty`, déjà Story 2.3) tant que rien n'est peint, et que le Stepper permet le **retour à Upload** (`GO_TO_STEP` arrière, déjà Epic 1). Jamais d'état sans issue.
  - [x] `initialMask === null` n'est **jamais** une erreur : vérifier qu'aucun `SET_ERROR` n'est émis (l'adaptateur `detect`/`detectLocal` renvoie `{ initialMask: null }`, `runDetect` dispatche `DETECT_SUCCEEDED { detectedMaskUrl: null }` — déjà le cas, AR-ERRORS).
- [x] Task 3 : Tests + vérification (AC: 1, 2, 3)
  - [x] Test composant léger si extractible (le bandeau apparaît quand `detectedMaskUrl===null`, absent sinon) — sinon couvrir la logique du prédicat + `[LIVE-VERIFY]` du rendu.
  - [x] `npm test` + `tsc` + `lint` + `build` verts.
  - [x] Live (FAL_KEY) : une photo sans meuble reconnu → étape Masque affiche le bandeau neutre (pas d'erreur), Masque vierge, pinceau actif, « Valider » désactivé ; peindre une zone → « Valider » s'active → validation OK ; sans peindre → retour Upload possible.

## Dev Notes

### ⚠️ La plus grande partie est DÉJÀ en place

L'architecture des stories 2.1→2.3 gère nativement le cas `initialMask === null` (AD-5 : c'est LA définition canonique de FR-16). Cette story n'ajoute **que le bandeau neutre** (Task 1) ; Tasks 2 vérifie que le reste tient déjà. NE PAS réimplémenter le seed/outil/validation.

### État en place (NE PAS recréer)

- **`detect`/`detectLocal`** renvoient `{ initialMask: null, categories: [] }` quand aucun segment (pas d'erreur). `runDetect` → `DETECT_SUCCEEDED { detectedMaskUrl: null }` (jamais `SET_ERROR`) — AR-ERRORS déjà tenu (test `detect.test.ts` « FR-16 »).
- **`mask-surface` seed effect (Story 2.2)** : `detectedUrl !== null ? rasterizeMaskUrl(...) : createBlankBuffer(w,h)` → un `detectedMaskUrl===null` seed déjà un **buffer vierge**. `dispatch(SET_MASK_BUFFER)`.
- **Outil par défaut** : `tool` initialisé à `"brush"` (`useState<StrokeMode>("brush")`), taille `DEFAULT_BRUSH=32` — pinceau **déjà pré-activé** (AC2).
- **`isBufferEmpty` (Story 2.2/2.3)** : « Valider le Masque » désactivé sur buffer vierge + tooltip « Peignez au moins une zone » (déjà). AC3 côté validation.
- **Stepper (Epic 1)** : `GO_TO_STEP` arrière vers Upload toujours possible (étape « behind ») — retour photo garanti, jamais d'impasse (AC3).
- **`ErrorBanner` (Epic 1)** expose **déjà** `variant="neutral"` (`role="status"`, `aria-live="polite"`, sans bouton) — conçu pour ce cas (commentaire du composant : « aucun meuble détecté … neutral variant, not an error »).

### Contraintes d'architecture (spine)

- **AR-ERRORS / AD-8** : « aucun meuble détecté » n'est PAS une erreur — bandeau **neutre**, jamais l'ErrorBanner variant error, jamais de `StepError`. [Source: ARCHITECTURE-SPINE.md#AD-8]
- **AD-5** : `initialMask === null` = définition canonique du cas FR-16. [Source: ARCHITECTURE-SPINE.md#AD-5]
- **AR-LAYERS** : le composant lit `state.maskDraft.detectedMaskUrl` et rend le bandeau ; pas d'appel pipeline. [Source: 2-1..2-3]

### Contraintes UX (font foi)

- **Bandeau neutre (UX-DR12)** : ton informatif, pas alarmant. Message exact : **« Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. »** [Source: epics.md#Story 2.4 AC1, EXPERIENCE.md]
- **Flow 2** : le Parcours reste praticable de bout en bout dans ce cas ; pinceau prêt, retour Upload possible. [Source: prd.md#FR-16, Flow 2]

### Pièges connus

- Distinguer `detectedMaskUrl === null` (aucun meuble, FR-16) de `maskDraft === undefined` (détection pas encore lancée/en cours). Le bandeau ne s'affiche que sur `maskDraft` défini **et** `detectedMaskUrl === null`.
- Ne PAS afficher le bandeau quand un masque a été détecté (`detectedMaskUrl` est une URL/data-URL).
- Le bandeau reste un indicateur de mode fallback ; l'afficher tant que `detectedMaskUrl===null` (même après que l'utilisateur a commencé à peindre) est acceptable — c'est le contexte de la photo, pas un état transitoire.
- Ne pas confondre avec le cas erreur de détection (StepError detect) qui, lui, passe par l'ErrorBanner variant error via l'overlay transverse.

### Testing Requirements

- **Pur/léger** : rendu conditionnel du bandeau (présent si `detectedMaskUrl===null`, absent sinon) ; ré-affirmer via test que `detect` null ne produit pas d'erreur (déjà couvert). 
- **Live** : rendu du bandeau + praticabilité (peindre → valider ; retour Upload). Provoquer un cas « aucun meuble » : photo sans meuble reconnu (mur nu, extérieur) OU baisser transitoirement le seuil inverse — sinon vérifier le rendu en forçant `detectedMaskUrl===null` en dev.
- Régression : suite 2.1/2.2/2.3 verte ; `tsc`/`lint`/`build`.

### Project Structure Notes

- Modif unique attendue : `src/components/mask-surface.tsx` (+ éventuel petit test). Aucun nouveau fichier ni action reducer. Réutilise `ErrorBanner`.

### References

- [Source: epics.md#Story 2.4]
- [Source: ARCHITECTURE-SPINE.md#AD-5, AD-8/AR-ERRORS]
- [Source: prd.md#FR-16, Flow 2 ; EXPERIENCE.md/DESIGN.md#UX-DR12]
- [Source: 2-1 (detect null contract), 2-2 (blank seed + brush default), 2-3 (isBufferEmpty validation)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- Aucune nouvelle logique de flux : le cas `initialMask===null` était déjà géré (seed buffer vierge, pinceau par défaut, `isBufferEmpty` désactive Valider, retour Upload via Stepper). Seul le bandeau neutre a été ajouté.

### Completion Notes List

- **`mask-surface.tsx`** : ajout du prédicat `noFurniture = maskDraft !== undefined && maskDraft.detectedMaskUrl === null` et rendu de `<ErrorBanner variant="neutral" message="Aucun meuble détecté. Peignez vous-même les zones à faire disparaître." />` au-dessus de l'éditeur (composant Epic 1, `role="status"`, aucune action → pas une erreur, AR-ERRORS/AC1).
- **AC2/AC3 déjà satisfaits** par 2.2/2.3 : buffer vierge seedé si null, `tool="brush"` par défaut, « Valider » désactivé (`isBufferEmpty`) + tooltip, retour Upload via `GO_TO_STEP` (Epic 1). Aucun `SET_ERROR` pour le cas null (`detect`/`detectLocal` renvoient `{initialMask:null}`, `runDetect`→`DETECT_SUCCEEDED`). 
- 109 tests verts, `tsc`/`lint`/`build` OK. Vérif live (FAL_KEY) en attente.

### File List

- `src/components/mask-surface.tsx` (modifié — bandeau neutre no-furniture)
- `test-assets/mur-vide-4x3.jpeg` (nouveau — image sans meuble pour la vérif live)

## Change Log

- 2026-07-11 : Story 2.4 implémentée — bandeau neutre « aucun meuble détecté » (FR-16/UX-DR12) dans la surface Masque ; reste du fallback déjà couvert par 2.1–2.3. 109 tests, tsc/lint/build verts. Statut → review.

## Senior Developer Review (AI)

**Date :** 2026-07-11 · **Résultat :** Approuvé (vérif live en attente) · **Verdict ACs :** AC1/AC2/AC3 PASS. 0 CRITICAL/HIGH. Toutes les affirmations « déjà en place » (2.1–2.3) vérifiées contre le code réel.

### Action Items

- [x] **[Bas]** Références « AC4/AC3 » périmées dans les commentaires de `error-banner.tsx` (héritées d'Epic 1) → corrigées en « FR-16, Story 2.4 » (cosmétique).

### Vérification live (2026-07-11, backend GPU local, seuil GDINO forcé à 0.98 pour provoquer 204→null puis rétabli à 0.25)

Bandeau neutre exact « Aucun meuble détecté. Peignez vous-même les zones à faire disparaître. » en `role="status"` (pas `alert` → pas une erreur) ; buffer **vierge** (0 % peint) ; **pinceau pré-activé** ; « Valider le Masque » **désactivé** ; étape **Upload cliquable** (issue de secours). Après un trait : buffer binaire (1,8 %, `nonBinary=0`), « Valider » **s'active**, bandeau conservé (contexte fallback), **0 erreur console**. Tous les ACs confirmés.

### Écartés / Différés (documentés)

- **Test composant `mask-surface`** : absent (canvas + `URL.createObjectURL` non exécutables en jsdom — décision assumée dès la Story 2.2). Le prédicat `noFurniture` et l'absence d'erreur pour le cas null sont couverts par la logique + les tests existants (`detect` null, reducer, `isBufferEmpty`) ; le **rendu du bandeau** et la praticabilité sont **vérifiés en live**. C'est l'unique écart à la règle 80 % (limité au composant canvas), cohérent avec 2.2/2.3.
- Collision bandeau erreur vs neutre : impossible (sources et sites de rendu distincts ; un détect en erreur laisse `maskDraft` undefined → `noFurniture` faux). Confirmé en revue.
