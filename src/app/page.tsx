import { AppShell } from "@/components/app-shell";
import { Stepper } from "@/components/stepper";

export default function HomePage() {
  return (
    <AppShell stepper={<Stepper />}>
      <section className="flex h-full flex-col items-center justify-center gap-scene-gap">
        <h1 className="text-display text-texte-principal">
          Une photo. Une pièce qui se meuble toute seule.
        </h1>
        {/* The upload zone replaces this placeholder in Story 1.3. */}
        <div className="w-full rounded-lg border border-dashed border-bordure bg-surface-carte p-16 text-center">
          <p className="text-attente text-texte-secondaire">
            Déposez la photo de votre pièce meublée. JPEG ou PNG.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
