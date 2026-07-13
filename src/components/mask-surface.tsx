"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGeneration } from "@/state/generation-context";
import type { Generation } from "@/state/types";
import { runDetect, runValidateMask } from "@/state/effects";
import { createBlankBuffer, isBufferEmpty, type MaskBuffer } from "@/lib/mask-buffer";
import { rasterizeMaskUrl } from "@/lib/mask-raster";
import { MaskCanvas } from "@/components/mask-canvas";
import { GenerationButton } from "@/components/generation-button";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/error-banner";
import { usePhotoObjectUrl } from "@/components/use-photo-object-url";

/**
 * Mask step (reveal mode). Owns the reveal-specific logic — detection on entry
 * (Story 2.1), seeding the editable buffer from the detected mask or a blank
 * one, and validation (Story 2.3) — and delegates the actual editing surface to
 * the reusable, controlled MaskCanvas (Story 5.2). The binary buffer is the
 * pipeline draft (AD-13), owned by the reducer; MaskCanvas is only a VIEW of it
 * and writes back through SET_MASK_BUFFER via onCommit.
 */
export function MaskSurface() {
  const { state, dispatch } = useGeneration();
  const photoUrl = usePhotoObjectUrl(state.originalPhoto?.blob);

  const buffer = state.maskDraft?.buffer;
  const photoWidth = state.originalPhoto?.width ?? 0;
  const photoHeight = state.originalPhoto?.height ?? 0;

  // Mask validation (Story 2.3) — user-initiated, so errors are inline & local.
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const validatingRef = useRef(false); // synchronous re-entry guard for validate

  // Live epoch for the effect layer to discard superseded results (AD-12).
  const epochRef = useRef(state.epoch);
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);

  // Live buffer ref so handleValidate reads the latest committed buffer without
  // waiting for the `state` closure to refresh (avoids validating a pre-stroke
  // buffer if the user paints then validates in quick succession — the same
  // safeguard the pre-5.2 code had before the canvas was extracted).
  const bufferRef = useRef(buffer);
  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  // Stable commit handler passed to MaskCanvas — memoized on the (stable)
  // dispatch so MaskCanvas's own useCallback/effects (incl. the keyboard
  // listener) don't tear down and re-register on every MaskSurface render.
  const handleCommit = useCallback(
    (next: MaskBuffer) => dispatch({ type: "SET_MASK_BUFFER", buffer: next }),
    [dispatch],
  );

  // ---- Detection on entry (Story 2.1 — deps deliberately EXCLUDE waitPhase to
  // avoid the abort loop fixed in 2.1) ----
  useEffect(() => {
    if (state.step !== "mask") return;
    if (state.originalPhoto === undefined) return;
    if (state.maskDraft !== undefined) return;
    if (state.error !== undefined) return;

    const startEpoch = state.epoch;
    const controller = new AbortController();
    void runDetect(state, dispatch, {
      signal: controller.signal,
      isStale: () => epochRef.current !== startEpoch,
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.epoch, state.maskDraft, state.error, state.originalPhoto]);

  // ---- Seed the editable buffer once detection has produced a draft ----
  useEffect(() => {
    if (state.maskDraft === undefined) return;
    if (state.maskDraft.buffer !== undefined) return;
    if (photoWidth === 0 || photoHeight === 0) return;

    let alive = true;
    const startEpoch = state.epoch;
    const detectedUrl = state.maskDraft.detectedMaskUrl;
    void (async () => {
      // On a rasterize failure (transient CORS/decode of the detected mask),
      // fall back to a blank editable buffer so the Parcours stays usable — the
      // user can paint manually. A dedicated retry is deferred (documented).
      const seeded =
        detectedUrl !== null
          ? await rasterizeMaskUrl(detectedUrl, photoWidth, photoHeight).catch(
              () => createBlankBuffer(photoWidth, photoHeight),
            )
          : createBlankBuffer(photoWidth, photoHeight);
      // Discard a superseded seed (epoch guard, AD-12) or an unmounted one.
      if (!alive || epochRef.current !== startEpoch) return;
      dispatch({ type: "SET_MASK_BUFFER", buffer: seeded });
    })();
    return () => {
      alive = false;
    };
  }, [state.maskDraft, state.epoch, photoWidth, photoHeight, dispatch]);

  // ---- Validate the mask (Story 2.3) ----
  const canValidate = buffer !== undefined && !isBufferEmpty(buffer);
  const handleValidate = useCallback(async () => {
    // Read the LIVE buffer from the ref (not the `state` closure, which could
    // lag a paint commit by a frame); guard re-entry synchronously via a ref
    // (the `validating` state flips only on the next render).
    const buf = bufferRef.current;
    if (validatingRef.current || buf === undefined || isBufferEmpty(buf)) return;
    validatingRef.current = true;
    setValidating(true);
    setValidateError(null);
    const controller = new AbortController();
    const startEpoch = epochRef.current;
    const snapshot: Generation = {
      ...state,
      maskDraft: {
        detectedMaskUrl: state.maskDraft?.detectedMaskUrl ?? null,
        buffer: buf,
      },
    };
    try {
      await runValidateMask(snapshot, dispatch, {
        signal: controller.signal,
        isStale: () => epochRef.current !== startEpoch,
      });
    } catch {
      setValidateError("L’envoi du Masque a échoué. Réessayez.");
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }
  }, [state, dispatch]);

  // No-furniture fallback (FR-16): detection ran but found nothing. NOT an error
  // (AR-ERRORS) — a neutral banner; the blank buffer + default brush let the user
  // paint manually (Story 2.4).
  const noFurniture =
    state.maskDraft !== undefined && state.maskDraft.detectedMaskUrl === null;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {noFurniture && (
        <ErrorBanner
          variant="neutral"
          message="Aucun meuble détecté. Peignez vous-même les zones à faire disparaître."
        />
      )}

      <MaskCanvas
        backgroundUrl={photoUrl}
        width={photoWidth}
        height={photoHeight}
        buffer={buffer}
        epoch={state.epoch}
        onCommit={handleCommit}
      />

      <div className="flex flex-col items-center gap-2">
        {/* Gold primary (UX-DR13): vide la pièce sans masque (Nano Banana, Story
            3.4). Advancing to emptyRoom WITHOUT a validated mask puts the Pièce
            vide surface into maskless/auto mode (mask stays undefined). */}
        <GenerationButton
          disabled={validating}
          onClick={() => dispatch({ type: "CONFIRM_ADVANCE_FROM", step: "emptyRoom" })}
        >
          Vider automatiquement
        </GenerationButton>
        {/* Secondary: manual mask → bria eraser (fine control / retouch). */}
        <Button
          variant="outline"
          disabled={!canValidate || validating}
          onClick={handleValidate}
        >
          {validating ? "Envoi du Masque…" : "Valider le Masque à la main"}
        </Button>
        {!canValidate && (
          <p className="text-sm text-texte-secondaire">
            Peignez au moins une zone pour valider un masque manuel.
          </p>
        )}
        {validateError !== null && (
          <p role="alert" aria-live="assertive" className="text-sm text-erreur">
            {validateError}
          </p>
        )}
      </div>
    </div>
  );
}
