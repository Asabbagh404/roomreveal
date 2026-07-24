import { isStepError, makeStepError } from "@/state/step-error";
import { LOCAL_DETECT_TIMEOUT_MS, LOCAL_INSTANCE_MASKS_URL } from "./config";
import { FURNITURE_CATEGORIES } from "./prompts";
import type { AdapterOptions, InstanceMask, InstanceMasksResult } from "./types";

/**
 * Per-object mask adapter for the Motion Brush backend (Story 4.8, AD-5, AD-12).
 * A sibling of `detectLocal`: it POSTs the detection image + the full
 * FURNITURE_CATEGORIES concept list to the self-hosted Grounded-SAM service's
 * `/instance-masks` route, which detects each concept, keeps each object's SAM
 * mask separate, and returns `{ instances:[{label, box[0,1], area, mask b64}],
 * static_mask b64 }` — the Kling dynamic brushes plus the room shell (static
 * brush). No fal involved.
 *
 * Returns `{ instances, staticMask }` with the base64 PNGs turned into data
 * URLs. The service signals "no furniture" with HTTP 204 → empty instances and
 * an empty `staticMask` (the FR-16 case; the effect layer falls back to the flf
 * path). Errors — a malformed JSON body included — become a retryable `detect`
 * StepError (AD-8); the raw error is never surfaced. Mirrors detect-local.ts's
 * passive-adapter shape (chained AbortController, timeout, onPhase).
 */
export async function detectInstanceMasks(
  imageBlob: Blob,
  { signal, onPhase }: AdapterOptions,
): Promise<InstanceMasksResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener("abort", onExternalAbort);
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), LOCAL_DETECT_TIMEOUT_MS);

  try {
    onPhase("generating");
    const form = new FormData();
    form.append("image", imageBlob, "detection.jpg");
    form.append("prompts", JSON.stringify(FURNITURE_CATEGORIES));

    const res = await fetch(LOCAL_INSTANCE_MASKS_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    // 204 = the service ran but found no furniture (FR-16), not an error.
    if (res.status === 204) return { instances: [], staticMask: "" };
    if (!res.ok) throw makeStepError("detect", true);

    // JSON envelope: a malformed body throws here and falls into the catch below
    // — same retryable StepError as every other failure (AD-8).
    const payload = (await res.json()) as {
      instances?: unknown;
      static_mask?: unknown;
    };
    if (typeof payload.static_mask !== "string" || payload.static_mask === "") {
      throw makeStepError("detect", true);
    }
    const instances = parseInstances(payload.instances);
    // Diagnose a silent drop: the service returned entries but none survived
    // validation → the effect layer will fall back to the flf path (match
    // detect-local.ts's console.info diagnostic style).
    if (
      Array.isArray(payload.instances) &&
      payload.instances.length > 0 &&
      instances.length === 0
    ) {
      console.info(
        `[instance-masks] ${payload.instances.length} instance(s) received but all failed validation — treating as no instances`,
      );
    }
    return {
      instances,
      // The service sends bare base64 — build data URLs directly (parity with
      // detect-local.ts), no object-URL lifecycle to manage.
      staticMask: `data:image/png;base64,${payload.static_mask}`,
    };
  } catch (err) {
    throw isStepError(err) ? err : makeStepError("detect", true);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Boundary validation for the per-object masks. Unlike detect-local's
 * `sanitizeInstances` (an informative side channel), these masks ARE the input
 * to the reveal — a malformed entry is dropped, and if none survive the effect
 * layer treats it as "no instances" and falls back to the flf path. Each mask's
 * base64 is turned into a data URL here.
 */
function parseInstances(raw: unknown): InstanceMask[] {
  if (!Array.isArray(raw)) return [];
  const valid: InstanceMask[] = [];
  for (const entry of raw) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { label?: unknown }).label === "string" &&
      (entry as { label: string }).label !== "" &&
      Array.isArray((entry as { box?: unknown }).box) &&
      (entry as { box: unknown[] }).box.length === 4 &&
      (entry as { box: unknown[] }).box.every(
        (coord) => typeof coord === "number" && Number.isFinite(coord),
      ) &&
      typeof (entry as { area?: unknown }).area === "number" &&
      Number.isFinite((entry as { area: number }).area) &&
      typeof (entry as { mask?: unknown }).mask === "string" &&
      (entry as { mask: string }).mask !== ""
    ) {
      const e = entry as {
        label: string;
        box: [number, number, number, number];
        area: number;
        mask: string;
      };
      valid.push({
        label: e.label,
        box: e.box,
        area: e.area,
        mask: `data:image/png;base64,${e.mask}`,
      });
    }
  }
  return valid;
}
