"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lecteur de la Révélation (Story 4.2, FR-11, UX-DR10). The climax surface: the
 * MP4 autoplays (muted, so browser autoplay policy allows it — the reveal is
 * silent), with a soft gold glow around the frame ON FIRST LAUNCH only (the
 * "projector halo", DESIGN#Elevation), then it settles. Sober controls only —
 * play/pause + « Revoir » (replay); NO native controls (which would expose a
 * scrubber / duration / download menu, forbidden by UX-DR10). `Espace` toggles
 * play/pause. No confetti, no toast — the video is the celebration (UX-DR15).
 * Presentation only: reads the fal URL, no pipeline/state logic (AR-LAYERS).
 * The download (4.3) and « Nouvelle Génération » (4.4) actions will join
 * « Revoir » below the player in the canonical order.
 */
export function RevealPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Gold glow shows on the first launch and fades once the first play finishes
  // (DESIGN: the halo appears "at the moment of the Révélation only").
  const [firstPlayGlow, setFirstPlayGlow] = useState(true);

  // Belt-and-suspenders for the known React `muted` attribute quirk: set it
  // imperatively so autoplay isn't blocked by a stray unmuted state.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = true;
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const replay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => {});
  }, []);

  // `Espace` = play/pause, but never steal it from a focused control (button,
  // etc.) and always preventDefault so the page doesn't scroll.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isControlTarget(e.target)) return;
      e.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        className={cn(
          "relative w-full max-w-3xl overflow-hidden rounded-lg transition-shadow duration-1000",
          // Soft gold projector halo (or-lumineux #f2c14e, wide blur, low opacity
          // per DESIGN#Elevation) — first launch only, then fades to none.
          firstPlayGlow
            ? "shadow-[0_0_90px_8px_rgba(242,193,78,0.08)]"
            : "shadow-none",
        )}
      >
        {/* No native `controls`: sober custom controls only (UX-DR10). */}
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          autoPlay
          onClick={toggle}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setFirstPlayGlow(false);
          }}
          className="block h-auto w-full cursor-pointer"
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Lecture"}
          className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-black/50 text-texte-principal backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          {isPlaying ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
        </button>
      </div>

      <Button variant="outline" onClick={replay}>
        Revoir
      </Button>
    </div>
  );
}

/** True when the event target is an interactive control that should keep its own
 * Space handling (so the shortcut doesn't hijack a focused button). */
function isControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "BUTTON" ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.getAttribute("role") === "slider"
  );
}
