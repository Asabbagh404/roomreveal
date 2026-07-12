"use client";

import { useEffect, useState } from "react";

/**
 * Turns a Blob into a display object URL, revoked when the blob changes or the
 * component unmounts. Shared by the mask editor (canonical photo under the mask)
 * and the empty-room comparison (the "Photo originale" card).
 *
 * Create and revoke in the SAME effect. `createObjectURL` is a side effect, so
 * it must not live in `useMemo`: under StrictMode the mount/cleanup/remount
 * cycle would revoke a memoized URL that the memo never recomputes, leaving a
 * dangling blob: reference (net::ERR_FILE_NOT_FOUND). Pairing create+revoke per
 * effect run means a remount always yields a fresh, live URL.
 */
export function usePhotoObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to browser blob-URL store (see above)
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
