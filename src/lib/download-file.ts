/**
 * Downloads a (cross-origin) URL as a local file. A bare `<a href download>`
 * does NOT download a cross-origin resource — the browser ignores the `download`
 * attribute and navigates to it instead. So we fetch the bytes, wrap them in a
 * same-origin `blob:` URL, and click a `<a download>` on that. Used to save the
 * Révélation MP4 straight from its fal storage URL — a public GET, never proxied
 * or re-hosted server-side (AD-4, AD-9). Browser-only (fetch + DOM), lib leaf.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Revoke AFTER the click has kicked off the download — revoking synchronously
  // can cancel it in some browsers. A short delay is plenty.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
