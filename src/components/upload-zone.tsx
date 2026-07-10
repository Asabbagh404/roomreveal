"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { useGeneration } from "@/state/generation-context";
import { resizeToCanonicalJpeg } from "@/lib/resize";
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    const validation = validateUploadFile(file);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    try {
      // Single canonical re-encode (AD-2); the original File is dropped here.
      const blob = await resizeToCanonicalJpeg(file);
      dispatch({ type: "PHOTO_NORMALIZED", photo: { blob } });
    } catch {
      setError(UPLOAD_MESSAGES.unusable);
    } finally {
      setBusy(false);
    }
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={openPicker}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
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
          e.target.value = ""; // allow re-selecting the same file after an error
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
