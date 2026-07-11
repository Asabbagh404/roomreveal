"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { useGeneration } from "@/state/generation-context";
import { normalizeUpload } from "@/lib/resize";
import { UPLOAD_MESSAGES, validateUploadFile } from "@/lib/validate-upload";
import { cn } from "@/lib/utils";

/**
 * Upload step (FR-1/2/3, UX-DR6). Drag-and-drop + click-to-browse, immediate
 * client validation, silent canonical resize (AD-2), then dispatch
 * PHOTO_NORMALIZED (the reducer advances the Parcours to Masque, AC4).
 * Rejections show in the zone itself — retry is always immediate (FR-3).
 */
export function UploadZone() {
  const { dispatch } = useGeneration();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (busy) return; // reject re-entry while a resize is in flight
    setError(null);
    const validation = validateUploadFile(file);
    if (!validation.ok) {
      setError(validation.message);
      buttonRef.current?.focus(); // keep the retry trigger reachable (FR-3, keyboard)
      return;
    }
    setBusy(true);
    try {
      // Single decode → canonical (pipeline) + detection (higher-res) JPEGs
      // (AD-2 + amendment); the original File is dropped here.
      const { canonical, detection } = await normalizeUpload(file);
      dispatch({
        type: "PHOTO_NORMALIZED",
        photo: { blob: canonical, detectionBlob: detection },
      });
    } catch {
      setError(UPLOAD_MESSAGES.unusable);
      buttonRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function openPicker() {
    if (busy) return;
    inputRef.current?.click();
  }

  return (
    <div className="w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={busy}
        onClick={openPicker}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        aria-label="Déposez ou choisissez la photo de votre pièce meublée"
        aria-busy={busy}
        className={cn(
          "flex w-full flex-col items-center gap-4 rounded-lg border border-dashed bg-surface-carte p-16 text-center transition-colors",
          dragOver ? "border-or-lumineux" : "border-bordure",
        )}
      >
        <ImageUp className="size-8 text-texte-secondaire" aria-hidden />
        <p className="text-attente text-texte-secondaire">
          {busy
            ? "Préparation de votre photo…"
            : "Déposez la photo de votre pièce meublée. JPEG ou PNG."}
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // Always reset so the same filename can be re-selected after a rejection.
          e.target.value = "";
        }}
      />

      {error !== null && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-4 text-sm text-erreur"
        >
          {error}
        </p>
      )}
    </div>
  );
}
