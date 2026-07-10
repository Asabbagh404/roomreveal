import { AppShell } from "@/components/app-shell";
import { Stepper } from "@/components/stepper";
import { ParcoursScene } from "@/components/parcours-scene";

export default function HomePage() {
  return (
    <AppShell stepper={<Stepper />}>
      <ParcoursScene />
    </AppShell>
  );
}
