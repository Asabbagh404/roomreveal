/**
 * Full-screen guard shown below ~1024px viewport width (UX-DR17).
 * Pure CSS (lg breakpoint = 1024px): no resize listener, no adaptation attempt.
 */
export function ScreenTooSmall() {
  return (
    <div className="fixed inset-0 z-50 hidden max-lg:flex items-center justify-center bg-fond-projection px-8 text-center">
      <p className="text-attente text-texte-principal">
        RoomReveal est conçu pour un écran d&apos;ordinateur
      </p>
    </div>
  );
}
