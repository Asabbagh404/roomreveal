import { describe, expect, it } from "vitest";
import { UPLOAD_MESSAGES, validateUploadFile } from "./validate-upload";
import { MAX_FILE_BYTES } from "./resize";

function fileOfType(type: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], "photo", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("validateUploadFile (pure, FR-1/FR-3)", () => {
  it("accepts JPEG", () => {
    expect(validateUploadFile(fileOfType("image/jpeg"))).toEqual({ ok: true });
  });

  it("accepts PNG", () => {
    expect(validateUploadFile(fileOfType("image/png"))).toEqual({ ok: true });
  });

  it("refuses other formats with the exact format message", () => {
    expect(validateUploadFile(fileOfType("image/gif"))).toEqual({
      ok: false,
      message: UPLOAD_MESSAGES.format,
    });
    expect(validateUploadFile(fileOfType("application/pdf"))).toEqual({
      ok: false,
      message: UPLOAD_MESSAGES.format,
    });
  });

  it("refuses a file over 20 Mo with the size message", () => {
    expect(
      validateUploadFile(fileOfType("image/jpeg", MAX_FILE_BYTES + 1)),
    ).toEqual({ ok: false, message: UPLOAD_MESSAGES.tooLarge });
  });

  it("accepts a JPEG exactly at the size cap", () => {
    expect(
      validateUploadFile(fileOfType("image/jpeg", MAX_FILE_BYTES)),
    ).toEqual({ ok: true });
  });
});
