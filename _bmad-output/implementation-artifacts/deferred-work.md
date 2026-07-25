# Deferred Work

Pre-existing or out-of-scope issues surfaced by bmad-dev-auto review passes.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-6-prompt-de-mouvement-pilote-par-les-detections.md`
  summary: Le prompt de mouvement peut nommer des meubles absents de la Révélation — les instances sont la sortie brute de Grounding DINO, jamais filtrées contre le masque effectivement validé (objet effacé à la gomme, ou masque SAM ne contribuant rien à l'union).
  evidence: reducer.ts conserve `detectedInstances` à travers SET_MASK_BUFFER/UNION_MASK_BUFFER/MASK_VALIDATED ; server.py ne renvoie 204 que si l'union entière est vide. Limitation assumée du design (approche « prompt enrichi », approximation acceptée) ; le vrai correctif — filtrage géométrique instances↔masque au moment de la validation — est un chantier à part, potentiellement à traiter avec l'approche B (epics-deferred-improvements.md §5).

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-revelation-par-motion-brush-reverse-motion.md`
  summary: Backend motion-brush : la détection tourne DEUX fois (le parcours a déjà appelé `/detect` pour l'union+instances, puis `runVideo` re-POST `/instance-masks` pour les masques par objet) — coûteux (inférence GPU en minutes sur cette carte).
  evidence: `state.detectedInstances` (4.6) ne porte que labels+boîtes, pas les masques par objet ; les réutiliser exigerait que la détection du parcours renvoie et stocke les masques par instance. Vrai refactor (contrat détection + état), hors périmètre de ce backend expérimental. Correctif : faire renvoyer les masques par instance à `/detect` et les stocker, ou fusionner `/detect` et `/instance-masks`.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-revelation-par-motion-brush-reverse-motion.md`
  summary: Durée du clip de sortie codée en dur à `"5"` s, sans lien avec la distance de trajet des objets — un meuble loin du bord peut ne pas être entièrement sorti en 5 s, donc partiellement présent au DÉBUT du reveal inversé.
  evidence: `video-motion-brush.ts` passe `duration:"5"` fixe. C'est une calibration live (le bon compromis durée/vitesse ne se juge qu'à l'écran) ; à régler quand le backend sera vérifié en réel (GPU + FAL_KEY), éventuellement dériver la durée de la trajectoire max.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-8-revelation-par-motion-brush-reverse-motion.md`
  summary: `/reverse` charge toutes les frames en mémoire (décodées ×2) sans plafond de taille/durée ni auth — un gros MP4 (ou un upload malveillant sur cette route localhost) peut faire OOM le service qui héberge aussi SAM/GDINO.
  evidence: `server.py /reverse` fait `list(iio.imiter(...))` puis `reversed(...)`. Une garde de base (frames vides/indécodable → 422) est en place, mais pas de cap taille/résolution/durée. Service dev-only localhost mono-utilisateur → impact borné ; durcir (cap + content-type) si jamais exposé.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-9-revelation-timelapse-chantier.md`
  summary: Négatif dédié timelapse — REVEAL_NEGATIVE_PROMPT bannit « ghosting, semi-transparent objects, blur », or c'est l'apparence normale d'humains en time-lapse ; si les movers sortent déformés en live, il faut un négatif propre à ce backend, ce qui exige que le négatif devienne un input de video().
  evidence: prompts.ts REVEAL_NEGATIVE_PROMPT vs le prompt positif « Realistic human motion at time-lapse speed » ; video.ts importe le négatif en dur — conflit relevé indépendamment par les deux reviewers 4.9.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-9-revelation-timelapse-chantier.md`
  summary: Le console.log({ prompt }) diagnostic de buildRevealMotionPrompt (prompts.ts:220, Story 4.6) tire à chaque reveal flf en production — à retirer ou passer derrière un flag debug.
  evidence: prompts.ts:220, présent depuis la 4.6 ; interdit par les règles projet (« no console.log in production code »), toléré jusqu'ici car hors périmètre des stories suivantes.
