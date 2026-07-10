# Revue — Vérification web des décisions engagées

- **Lentille :** Web Verification (Reviewer Gate)
- **Artefact revu :** `ARCHITECTURE-SPINE.md` (RoomReveal, draft 2026-07-10)
- **Date de vérification :** 2026-07-10
- **Méthode :** fetch direct des pages modèles fal.ai, docs fal, sources GitHub `fal-ai/fal-js` (branche `main`), registre npm

## Verdict

**PASS avec réserves.** Tout le socle factuel de la spine est réel et actuel : les 6 endpoints fal existent tels que cités, les prix sont exacts, le header d'expiration existe et s'applique bien aux sorties de génération (l'assumption d'AD-9 est donc levée sur le fond), et `fal.subscribe` supporte `AbortSignal` dans la version courante. Deux corrections sont requises : le **mécanisme** d'injection du header d'AD-9 est inexact tel que formulé (le proxy ne l'injecte pas — le client le porte et le proxy le laisse passer), et la version de `@fal-ai/server-proxy` est périmée (1.2.x, pas 1.1.x).

---

## Findings

### MOYEN-1 — AD-9 : le header existe et couvre les sorties, mais « le proxy injecte » est le mauvais mécanisme

**Statut de l'assumption :** ✅ confirmée sur le fond, ❌ inexacte sur le mécanisme.

Ce qui est **confirmé** :

- Le header `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": N}` existe et est documenté ([Data Retention & Storage](https://fal.ai/docs/documentation/model-apis/media-expiration), [Platform Headers](https://fal.ai/docs/documentation/model-apis/common-parameters)).
- Il s'applique **aux sorties de génération**, pas seulement aux uploads : la doc précise « Both input uploads and output media are subject to the same retention controls » et illustre l'usage sur des appels `subscribe` (inférence).
- Le support est **natif dans `@fal-ai/client`** : `queue.ts` expose une option `storageSettings` et `buildObjectLifecycleHeaders()` pose `X-Fal-Object-Lifecycle-Preference` sur les requêtes de submit ; l'option `headers` des submit/subscribe permet aussi de le passer manuellement ([source queue.ts](https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/client/src/queue.ts), [source storage.ts](https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/client/src/storage.ts)).
- Le proxy **laisse passer** ce header : `@fal-ai/server-proxy` forwarde tous les headers préfixés `x-fal-*` du client vers fal (`if (key.toLowerCase().startsWith("x-fal-"))`, [source proxy index.ts](https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/proxy/src/index.ts)).

Ce qui est **faux tel qu'écrit** :

- `@fal-ai/server-proxy` n'offre **aucun hook d'injection de headers côté serveur**. Ses seuls points d'extension (`ProxyBehavior`) concernent la résolution de la clé et l'authentification. « Le proxy injecte X-Fal-Object-Lifecycle-Preference sur chaque requête » n'est pas réalisable avec le paquet vanilla.

**Deux réalisations possibles, à trancher :**

1. **Côté client (recommandé, zéro fork)** : le module `pipeline/` pose le header via `storageSettings` / `headers` sur chaque appel (submit, subscribe, upload storage) ; le proxy le laisse passer. Cohérent avec AD-5 (pipeline seul propriétaire de fal) — mais la politique d'expiration cesse d'être « transverse au proxy » (AD-4/AD-9) et devient une responsabilité pipeline.
2. **Côté serveur** : wrapper maison du handler dans `route.ts` qui réécrit les headers de la `Request` entrante avant de la passer au handler du proxy (faisable en App Router, mais code custom à maintenir).

**Enjeu produit :** sans le header, la rétention par défaut des médias générés est « au moins 7 jours » (payloads : 30 jours) — la promesse « purge 24 h » (NFR-4) **dépend donc réellement** de ce header. Le repli « stockage local + purge cron » prévu par AD-9 n'est pas nécessaire, mais la formulation de la règle doit être corrigée.

### MOYEN-2 — Version `@fal-ai/server-proxy` périmée : 1.2.x, pas 1.1.x

Le registre npm donne `@fal-ai/server-proxy@1.2.1` en `latest` (lignée 1.1.x dépassée : 1.1.0 → 1.1.2 → 1.2.0 → 1.2.1). La ligne Stack « 1.1.x » est périmée à la date même de la spine (« versions vérifiées le 2026-07-10 »). À corriger en **1.2.x**.

- Source : `https://registry.npmjs.org/@fal-ai/server-proxy` (dist-tags.latest = 1.2.1, vérifié 2026-07-10)

### MINEUR-1 — Kling O1 : framerate et tiers de résolution non documentés sur la page fal

La page [fal-ai/kling-video/o1/image-to-video](https://fal.ai/models/fal-ai/kling-video/o1/image-to-video) confirme le mode dual-keyframe (start **et** end image requis — AD-1 satisfait), le prix 0,56 $/5 s (0,112 $/s), les durées 5 s/10 s, les contraintes d'entrée (min 300 px, ratio 0,40–2,50, 10 Mo). En revanche elle **ne documente ni le framerate de sortie ni les tiers de résolution** : le « typiquement 30 fps » du Deferred et le « tier le plus haut ≤ 1080p » d'AD-2 restent non confirmables par la doc publique — à constater sur la première vidéo réelle, comme le Deferred le prévoit déjà. Le ratio 4:3 (0,75) est dans la plage acceptée : la décision « pas de crop 16:9 » d'AD-2 est compatible.

### MINEUR-2 — Wan v2.7 : start+end frame confirmé, mais end frame optionnel

La page [fal-ai/wan/v2.7/image-to-video](https://fal.ai/models/fal-ai/wan/v2.7/image-to-video) existe et expose `image_url` (frame de départ) **plus un `end_image_url` optionnel** — le « start+end frame vérifié » de la Stack tient donc, au sens AD-1 (les deux frames peuvent être contraintes). Prix : 0,10 $/s en 720p, 0,15 $/s en 1080p (soit 0,50–0,75 $/5 s, comparable à Kling O1). Vigilance : le end frame étant *optionnel* côté API, l'adaptateur de repli devra le rendre obligatoire pour respecter AD-1.

### MINEUR-3 — `fal.subscribe` + AbortSignal : supporté aujourd'hui, mais c'est un ajout récent

AD-12 est confirmé : dans le code courant de `fal-js`, `abortSignal` est accepté et propagé sur `queue.submit`, `queue.status`, `queue.result`, `queue.cancel` **et dans la boucle de polling de `subscribe`** (`abortSignal: options.abortSignal` transmis à chaque poll de statut). L'abort est une annulation de fetch côté navigateur, donc il fonctionne mécaniquement à travers le proxy (le job fal distant survit — exactement la sémantique qu'AD-12 assume). Historique : la demande date de [l'issue fal-ai/fal-js#84](https://github.com/fal-ai/fal-js/issues/84) (close) ; s'assurer au build que la version installée est bien ≥ 1.10.x où ce support est présent.

- Source code : [queue.ts](https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/client/src/queue.ts), [types/common.ts](https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/client/src/types/common.ts)

### CONFIRMÉ — Tout le reste

| Élément de la spine | Vérifié | Source |
| --- | --- | --- |
| `fal-ai/sam-3/image` — text-prompté, multi-objets (jusqu'à 32 masques via `return_multiple_masks`), **0,005 $/req** | ✅ exact | [page modèle](https://fal.ai/models/fal-ai/sam-3/image) |
| `fal-ai/flux-pro/v1/fill` — inpainting image+masque+prompt, **0,05 $/MP** (arrondi au MP supérieur) | ✅ exact | [page modèle](https://fal.ai/models/fal-ai/flux-pro/v1/fill) |
| `fal-ai/kling-video/o1/image-to-video` — FLF dédié (start+end requis), **0,56 $/5 s** | ✅ exact | [page modèle](https://fal.ai/models/fal-ai/kling-video/o1/image-to-video) |
| `fal-ai/wan-flf2v` — FLF dédié (Wan 2.1), 0,20 $/gen 480p / 0,40 $ 720p | ✅ existe | [page modèle](https://fal.ai/models/fal-ai/wan-flf2v) |
| `fal-ai/flux-2/klein/4b/base/edit` — édition image par prompt, 0,009 $/MP (entrée+sortie) | ✅ existe | [page modèle](https://fal.ai/models/fal-ai/flux-2/klein/4b/base/edit) |
| COGS ≈ 0,62 $ (0,005 + ~0,05 + 0,56) | ✅ cohérent avec les prix confirmés | calcul |
| Next.js 16.2.x (latest 16.2.10), React 19.2.x (19.2.7), Tailwind 4.3.x (4.3.2), @fal-ai/client 1.10.x (1.10.1) | ✅ exacts au 2026-07-10 | registry.npmjs.org |
| Header lifecycle appliqué aux sorties de génération | ✅ confirmé (voir MOYEN-1) | [media-expiration](https://fal.ai/docs/documentation/model-apis/media-expiration) |

Note annexe pour le build : la page wan-flf2v cite un masquage 480p/720p seulement — en repli de repli, ce modèle ne tiendrait pas le « tier ≤ 1080p » d'AD-2 aussi bien que Kling O1 ou Wan 2.7 ; c'est un repli de dernier recours cohérent avec l'ordre affiché dans la Stack.

## Actions demandées

1. **AD-9** : reformuler la règle — le header est **porté par le client via `pipeline/` (option `storageSettings`/`headers` de @fal-ai/client) et transmis par le proxy** (passthrough `x-fal-*`), ou bien acter un wrapper serveur custom. Supprimer/résoudre le tag `[ASSUMPTION]` : l'applicabilité aux sorties est confirmée, le repli « stockage local + cron » peut être retiré. Mettre à jour AD-4 si « point unique d'injection des politiques transverses » ne décrit plus le proxy.
2. **Stack** : `@fal-ai/server-proxy` 1.1.x → **1.2.x**.
3. **Deferred (framerate)** : noter que le framerate Kling O1 n'est pas documenté publiquement — la vérification sur première vidéo réelle est la seule voie, comme déjà prévu.

## Sources

- https://fal.ai/models/fal-ai/sam-3/image
- https://fal.ai/models/fal-ai/flux-pro/v1/fill
- https://fal.ai/models/fal-ai/kling-video/o1/image-to-video
- https://fal.ai/models/fal-ai/wan/v2.7/image-to-video
- https://fal.ai/models/fal-ai/wan-flf2v
- https://fal.ai/models/fal-ai/flux-2/klein/4b/base/edit
- https://fal.ai/docs/documentation/model-apis/media-expiration
- https://fal.ai/docs/documentation/model-apis/common-parameters
- https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/proxy/src/index.ts
- https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/client/src/queue.ts
- https://raw.githubusercontent.com/fal-ai/fal-js/main/libs/client/src/storage.ts
- https://github.com/fal-ai/fal-js/issues/84
- https://registry.npmjs.org/@fal-ai/client · /@fal-ai/server-proxy · /next · /react · /tailwindcss
