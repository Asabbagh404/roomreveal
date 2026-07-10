import { ScreenTooSmall } from "@/components/screen-too-small";

interface AppShellProps {
  /** Slot for the Parcours stepper banner, fixed at the top (Story 1.2). */
  stepper?: React.ReactNode;
  /** The "scene" — the surface where the user's photo lives. */
  children: React.ReactNode;
  /** Primary action of the step, rendered below the scene, right-aligned. */
  primaryAction?: React.ReactNode;
}

/**
 * Desktop wizard shell (UX-DR4): centered max-w-5xl column, stepper banner on
 * top, primary action below the scene aligned right. Depth comes from tone,
 * never from shadows. The app is a single linear view — no sidebar, no
 * secondary navigation.
 */
export function AppShell({ stepper, children, primaryAction }: AppShellProps) {
  return (
    <>
      <ScreenTooSmall />
      <div className="max-lg:hidden flex min-h-svh flex-col">
        <header className="sticky top-0 z-40 border-b border-bordure bg-fond-projection">
          <div className="mx-auto w-full max-w-5xl px-6 py-4">
            {stepper ?? (
              <p className="text-carton-titre text-texte-secondaire">
                RoomReveal
              </p>
            )}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pt-scene-gap pb-scene-gap">
          <div className="flex-1">{children}</div>
          {primaryAction ? (
            <div className="mt-scene-gap flex justify-end">{primaryAction}</div>
          ) : null}
        </main>

        <footer className="mx-auto w-full max-w-5xl px-6 pb-6">
          <p className="text-sm text-texte-secondaire">
            Vos photos sont supprimées automatiquement après 24 heures.
          </p>
        </footer>
      </div>
    </>
  );
}
