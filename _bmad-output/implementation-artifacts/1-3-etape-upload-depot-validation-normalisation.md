---
baseline_commit: 308acc1
---

# Story 1.3: Étape Upload — dépôt, validation & normalisation

Status: review

## Story

As a utilisateur non technique,
I want déposer la photo de ma pièce meublée et la voir acceptée ou clairement refusée,
so that j'entre dans le Parcours sans friction ni jargon.

## Acceptance Criteria

1. **Given** l'étape Upload affichée **When** l'utilisateur glisse-dépose ou parcourt un fichier **Then** un JPEG ou PNG valide est accepté et affiché ; tout autre format est refusé avec « Ce format n'est pas pris en charge. Utilisez une photo JPEG ou PNG. » dans la zone même (FR-1, UX-DR6, UX-DR14)
2. **Given** un fichier déposé **When** sa taille dépasse 20 Mo ou qu'il est corrompu **Then** un message clair s'affiche dans la zone d'upload et l'utilisateur peut réessayer immédiatement, sans état sans issue (FR-3, UX-DR15)
3. **Given** une photo valide (ex. 4000×3000) **When** elle est acceptée **Then** elle est redimensionnée silencieusement (côté long ≤ 1024 px, ratio préservé), encodée une seule fois en `image/jpeg` qualité ≈ 0,92, et conservée comme Blob dans `generation.originalPhoto` (FR-2, AR-PIXELS) **And** le redimensionnement n'est jamais mentionné à l'utilisateur
4. **Given** une photo acceptée et normalisée **When** la normalisation se termine **Then** le Parcours avance automatiquement vers l'étape Masque et le stepper passe à 2/4
5. **Given** la primitive de resize de `src/lib/` **When** elle est testée **Then** elle produit des dimensions et un ratio corrects et est vérifiée sur Chrome, Firefox et Safari (AR-TESTS, NFR-5)

## Tasks / Subtasks

- [x] Task 1 : Primitive de dimensions canoniques — pure (AC: 3, 5)
  - [x] `src/lib/resize.ts` : constantes `MAX_LONG_SIDE = 1024`, `JPEG_QUALITY = 0.92`, `MAX_FILE_BYTES = 20 * 1024 * 1024` (AR-PIXELS). Fonction PURE `computeCanonicalDimensions(width, height, maxLongSide = MAX_LONG_SIDE): { width: number; height: number }` : côté long ≤ maxLongSide, ratio préservé, arrondi entier ; si déjà ≤ maxLongSide, dimensions inchangées (pas d'upscale). C'est le cœur testable en Vitest/jsdom (AC5 partie « dimensions/ratio »).
- [x] Task 2 : Encodage canvas (côté navigateur) (AC: 3, 5)
  - [x] Dans `src/lib/resize.ts` : `resizeToCanonicalJpeg(file: File): Promise<Blob>` — décode via `createImageBitmap(file)` (ou `<img>` + `decode()`), calcule les dims via `computeCanonicalDimensions`, dessine sur un `<canvas>`/`OffscreenCanvas`, exporte via `canvas.convertToBlob`/`toBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })`. **Un seul ré-encodage** (AR-PIXELS/AD-2) : le `File` d'origine est jeté après. Rejette si le décodage échoue (image corrompue) → l'appelant traduit en message FR. ⚠️ jsdom n'implémente pas canvas/`toBlob` : cette fonction est vérifiée en navigateur (Playwright, AC5 « Chrome/Firefox/Safari »), pas en jsdom — ne PAS écrire de test jsdom qui dépend du canvas réel.
- [x] Task 3 : Validation d'upload — pure (AC: 1, 2)
  - [x] `src/lib/validate-upload.ts` : `validateUploadFile(file: File): { ok: true } | { ok: false; message: string }`. Rejette tout `type` hors `image/jpeg`/`image/png` → « Ce format n'est pas pris en charge. Utilisez une photo JPEG ou PNG. ». Rejette `size > MAX_FILE_BYTES` → message taille FR clair (ex. « Cette image est trop lourde (plus de 20 Mo). Essayez avec une autre photo. »). Pur, testable jsdom. (La corruption n'est PAS détectable ici — elle l'est au décodage, Task 2 ; l'appelant gère le rejet du décodage avec « Cette image ne peut pas être utilisée. Essayez avec une autre photo. »)
- [x] Task 4 : Composant Zone d'upload (AC: 1, 2, 3, 4)
  - [x] `src/components/upload-zone.tsx` (`"use client"`) : carte drag-and-drop + clic-parcourir (`<input type=file accept="image/jpeg,image/png">` masqué). Bordure pointillée `bordure` → `or-lumineux` au survol/drag-over (UX-DR6). Sur dépôt/sélection : `validateUploadFile` → si KO, afficher le message DANS la zone (accent `erreur`), réessai immédiat, jamais d'état bloqué (FR-3). Si OK : `resizeToCanonicalJpeg` (état de chargement court, < 2 s, UX-DR15) → succès : `dispatch({ type: 'PHOTO_NORMALIZED', photo: { blob } })` (le reducer avance à `mask` → stepper 2/4, AC4). Si le resize rejette (corruption) : message « Cette image ne peut pas être utilisée. Essayez avec une autre photo. ».
  - [x] Le redimensionnement n'est JAMAIS mentionné (AC3) : aucune microcopie « redimensionné », « 1024 px », etc.
  - [x] A11y : `<input>` labellisé, zone activable au clavier (Entrée/Espace ouvre le sélecteur), rejet annoncé `aria-live` (assertive pour erreur d'upload), focus visible.
- [x] Task 5 : Brancher l'étape Upload dans la page (AC: 1, 4)
  - [x] `src/app/page.tsx` : quand `state.step === 'upload'`, afficher `UploadZone` dans la scène (remplacer le placeholder actuel). La promesse d'une ligne « Une photo. Une pièce qui se meuble toute seule. » reste au-dessus (UX-DR15 état vide/première visite). (Les étapes mask/emptyRoom/video afficheront un placeholder « à venir » — leurs surfaces sont hors périmètre de cette story.)
- [x] Task 6 : Tests (AC: 1, 2, 3, 5)
  - [x] `src/lib/resize.test.ts` : `computeCanonicalDimensions` — 4000×3000 → 1024×768 (ratio 4:3 préservé) ; paysage/portrait ; carré ; image déjà petite (pas d'upscale) ; arrondi entier. PUR, aucun canvas.
  - [x] `src/lib/validate-upload.test.ts` : accepte jpeg/png ; refuse gif/pdf avec le message format exact ; refuse > 20 Mo avec message taille. PUR.
  - [x] `src/components/upload-zone.test.tsx` : format refusé affiche le message dans la zone ; `resizeToCanonicalJpeg` mocké (vi.mock) → un fichier valide dispatch `PHOTO_NORMALIZED` et le stepper passe à Masque (2/4). NE PAS dépendre du canvas réel.
  - [x] Vérifier `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Vérif navigateur (Playwright) du resize réel (AC5).

## Dev Notes

### État en place (stories 1.1 + 1.2 — NE PAS recréer)

- Socle Next.js 16.2 / React 19.2 / Tailwind 4.3 / shadcn dark. `src/lib/` contient `env.ts`, `utils.ts`.
- **Reducer déjà prêt** : `PHOTO_NORMALIZED` (dans `src/state/reducer.ts`) pose `originalPhoto`, avance à `mask`, invalide l'aval + `epoch++`. **NE PAS modifier le reducer** — juste le dispatcher. Type attendu : `originalPhoto: { blob: Blob; falUrl?: string }` (l'upload fal viendra en Epic 2 ; ici on ne pose que `blob`).
- **Contexte** : `useGeneration()` (`src/state/generation-context.tsx`) donne `{ state, dispatch }`. Provider déjà monté dans `layout.tsx`.
- **Stepper** déjà branché : avance automatiquement à Masque quand `step` passe à `mask` (AC4 est donc réalisé par le dispatch seul).
- Tokens : `border-bordure`, bordure survol `or-lumineux`, `text-erreur`, `bg-surface-carte`, `rounded-lg`, `text-attente`, `text-texte-secondaire`.

### Contraintes d'architecture (spine — NON NÉGOCIABLES)

- **AR-PIXELS / AD-2** : UN SEUL redimensionnement client à l'upload (côté long ≤ 1024 px, ratio préservé, `image/jpeg` q≈0,92), jamais ré-encodé ensuite = photo canonique. Le `File` original est jeté après resize. Masque/Pièce vide/frames FLF partageront ces dimensions canoniques.
- **AR-LAYERS** : `src/lib/` = couche feuille PURE — n'importe ni `pipeline/` ni `@fal-ai/client` ni `state/`. Les primitives resize/validation vivent dans `lib/`. `components/upload-zone` importe `lib/` + `state/` (contexte). L'UI manipule un `Blob` local — aucune URL fal ici (les URLs fal naissent dans `pipeline/`, Epic 2).
- **AR-ERRORS (AD-8)** : les erreurs d'upload (format/taille/corruption) ne sont PAS des `StepError` pipeline — ce sont des validations client locales affichées dans la zone. Ne pas les router via le reducer `SET_ERROR` (réservé aux échecs detect/inpaint/video).
- **Nommage** : code/commentaires anglais, `originalPhoto`. UI 100 % français, glossaire, vouvoiement, pas de jargon (« redimensionner », « resize », « encoder » n'apparaissent jamais en UI — AC3).

### Contraintes UX (EXPERIENCE.md / DESIGN.md — font foi)

- **Zone d'upload (UX-DR6, Component Patterns)** : drag-and-drop + clic-parcourir ; validation client immédiate ; rejet affiché dans la zone même + réessai immédiat, jamais d'état sans issue. Photo acceptée → passage automatique à Masque.
- **Microcopies exactes (EXPERIENCE.md Voice)** :
  - Vide/accueil : « Déposez la photo de votre pièce meublée. JPEG ou PNG. »
  - Format : « Ce format n'est pas pris en charge. Utilisez une photo JPEG ou PNG. »
  - Inexploitable/corrompue : « Cette image ne peut pas être utilisée. Essayez avec une autre photo. »
  - Taille : message clair FR (non spécifié mot pour mot — rédiger sobre, vouvoiement, pas de jargon).
- **États (UX-DR15)** : vide/première visite (promesse d'une ligne) ; chargement court < 2 s pendant la normalisation (skeleton/état désactivé) ; erreur d'upload dans la zone.
- **A11y (UX-DR18)** : jamais la couleur seule (le message texte porte l'info, l'accent `erreur` est un renfort) ; focus visible ; erreurs `aria-live="assertive"`.

### Project Structure Notes

```text
src/lib/resize.ts             # computeCanonicalDimensions (pure) + resizeToCanonicalJpeg (canvas) (NEW)
src/lib/resize.test.ts        # pure dimension tests (NEW)
src/lib/validate-upload.ts    # validateUploadFile (pure) (NEW)
src/lib/validate-upload.test.ts (NEW)
src/components/upload-zone.tsx      # drag-drop + validation + normalize + dispatch (NEW)
src/components/upload-zone.test.tsx (NEW)
src/app/page.tsx              # render UploadZone at step 'upload' (MODIFIED)
```

### Pièges connus

- **jsdom + canvas** : `HTMLCanvasElement.toBlob`, `createImageBitmap`, `OffscreenCanvas` ne sont pas implémentés en jsdom → NE tester en jsdom QUE la math pure (`computeCanonicalDimensions`) et la validation ; mocker `resizeToCanonicalJpeg` dans le test du composant. Le rendu réel du canvas est vérifié en navigateur (Playwright) pour AC5.
- **Pas d'upscale** : si le côté long est déjà ≤ 1024, ne pas agrandir.
- **Un seul encodage** (AD-2) : ne pas re-`toBlob` ni convertir plusieurs fois ; produire directement le JPEG canonique.
- **`accept` de l'input ne suffit pas** : re-valider le `type` MIME côté JS (l'utilisateur peut forcer un autre fichier). Le drag-drop doit valider aussi.
- **Ne pas modifier le reducer** : `PHOTO_NORMALIZED` existe déjà et fait l'avance + invalidation. Dispatcher uniquement.

### Testing Requirements

- `computeCanonicalDimensions` et `validateUploadFile` : purs, couverts en Vitest (cœur d'AC1/AC2/AC3-dims/AC5).
- Composant : test avec `resizeToCanonicalJpeg` mocké — rejet format affiche le message ; fichier valide dispatch `PHOTO_NORMALIZED` et avance à Masque (2/4).
- Resize réel (canvas, q0,92, dims) : vérif navigateur Playwright (AC5 Chrome/Firefox/Safari — au minimum Chromium en CI locale, noter les autres).
- `npm test` + `tsc` + `lint` + `build` verts.

### References

- [Source: epics.md#Story 1.3] (ACs)
- [Source: ARCHITECTURE-SPINE.md#AD-2 (AR-PIXELS), AR-LAYERS, AD-8, Consistency Conventions]
- [Source: DESIGN.md#Components (Zone d'upload), Colors]
- [Source: EXPERIENCE.md#Component Patterns (Zone d'upload), State Patterns, Voice and Tone]
- [Source: prd.md#FR-1, FR-2, FR-3]

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5)

### Debug Log References

- `public/` avait disparu (supprimé avec les SVG orphelins en story 1.1 — git ne suit pas les dossiers vides). Sans impact : l'app n'a aucun asset public. Recréé temporairement pour la vérif image, puis retiré.
- jsdom sans canvas : test du composant avec `resizeToCanonicalJpeg` mocké (`vi.mock`) ; `toHaveTextContent` (jest-dom absent) remplacé par `.textContent`.

### Completion Notes List

- Primitives `src/lib/` (couche feuille pure) : `resize.ts` — `computeCanonicalDimensions` (pure, pas d'upscale, ratio préservé, arrondi entier) + `resizeToCanonicalJpeg` (createImageBitmap → canvas → toBlob JPEG q0,92, un seul encodage, AD-2) ; constantes `MAX_LONG_SIDE=1024`, `JPEG_QUALITY=0.92`, `MAX_FILE_BYTES=20 Mo`. `validate-upload.ts` — `validateUploadFile` (JPEG/PNG + taille) + `UPLOAD_MESSAGES` (microcopies FR exactes).
- `UploadZone` : drag-drop + clic, bordure or au drag-over, validation → resize → `dispatch(PHOTO_NORMALIZED)` (le reducer avance à Masque, AC4). Rejets dans la zone (`role=alert`, `aria-live=assertive`), réessai immédiat (reset input). Corruption → message dédié. Aucune mention du redimensionnement (AC3).
- `ParcoursScene` : rend `UploadZone` à l'étape `upload`, placeholder sinon. `page.tsx` simplifié.
- Erreurs d'upload = validations client locales, PAS des `StepError` pipeline (AD-8 respecté).
- Tests : `resize.test.ts` (6), `validate-upload.test.ts` (5), `upload-zone.test.tsx` (rejet format + normalisation→avance Masque, resize mocké). Suite 34/34. `tsc`, `lint`, `build` OK.
- **AC5** : chemin canvas vérifié en Chromium via Playwright — 1920×1440 → 1024×768 (4:3 préservé), sortie `image/jpeg`. Firefox/Safari : vérif manuelle à faire (E2E multi-navigateur différé v1 par la spine).

### File List

- `src/lib/resize.ts`, `src/lib/resize.test.ts` (nouveaux)
- `src/lib/validate-upload.ts`, `src/lib/validate-upload.test.ts` (nouveaux)
- `src/components/upload-zone.tsx`, `src/components/upload-zone.test.tsx` (nouveaux)
- `src/components/parcours-scene.tsx` (nouveau)
- `src/app/page.tsx` (modifié — utilise ParcoursScene)

## Change Log

- 2026-07-11 : Story 1.3 implémentée — primitives resize/validation pures, UploadZone (drag-drop, validation FR, normalisation canonique AD-2, avance à Masque). 34 tests verts. Resize réel vérifié Chromium. Statut → review.
