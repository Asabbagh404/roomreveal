# Deferred Work

Pre-existing or out-of-scope issues surfaced by bmad-dev-auto review passes.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-6-prompt-de-mouvement-pilote-par-les-detections.md`
  summary: Le prompt de mouvement peut nommer des meubles absents de la Révélation — les instances sont la sortie brute de Grounding DINO, jamais filtrées contre le masque effectivement validé (objet effacé à la gomme, ou masque SAM ne contribuant rien à l'union).
  evidence: reducer.ts conserve `detectedInstances` à travers SET_MASK_BUFFER/UNION_MASK_BUFFER/MASK_VALIDATED ; server.py ne renvoie 204 que si l'union entière est vide. Limitation assumée du design (approche « prompt enrichi », approximation acceptée) ; le vrai correctif — filtrage géométrique instances↔masque au moment de la validation — est un chantier à part, potentiellement à traiter avec l'approche B (epics-deferred-improvements.md §5).
