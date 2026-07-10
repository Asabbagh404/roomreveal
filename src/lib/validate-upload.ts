import { MAX_FILE_BYTES } from "./resize";

/** French microcopy for upload rejections (EXPERIENCE.md Voice). */
export const UPLOAD_MESSAGES = {
  format: "Ce format n'est pas pris en charge. Utilisez une photo JPEG ou PNG.",
  tooLarge: "Cette image est trop lourde (plus de 20 Mo). Essayez avec une autre photo.",
  unusable: "Cette image ne peut pas être utilisée. Essayez avec une autre photo.",
} as const;

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];

export type UploadValidation = { ok: true } | { ok: false; message: string };

/**
 * Client-side upload validation (FR-1, FR-3). Rejects non-JPEG/PNG and files
 * over 20 Mo. Corruption is not detectable here — it surfaces at decode time
 * (resizeToCanonicalJpeg), where the caller uses UPLOAD_MESSAGES.unusable.
 * Pure — jsdom-safe. These are local validations, NOT pipeline StepErrors (AD-8).
 */
export function validateUploadFile(file: File): UploadValidation {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, message: UPLOAD_MESSAGES.format };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: UPLOAD_MESSAGES.tooLarge };
  }
  return { ok: true };
}
