import { PianoClient } from '@/components/allocation/piano/PianoClient';

/**
 * Allocazione › Piano di accumulo (2026-11-20): the guided path that creates a plan of accumulation by hand,
 * continues the draft in Accumulo, or revises the active plan (2026-11-21; doc/guide/accumulo.md § Il percorso:
 * creare e rivedere). `?da=modello` («Rivedi dal modello») preselects the model as the revision's start.
 */
export default function PianoPage() {
  // `?da=modello` is read by the client: `searchParams` here would make the route dynamic (never prerendered).
  return <PianoClient />;
}
