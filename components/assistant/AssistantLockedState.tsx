'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tile } from '@/components/ui/tile';

interface AssistantLockedStateProps {
  /** The tile's question, in the eyebrow's voice — what is unavailable. */
  eyebrow: string;
  /** Why, and what would change it, in one sentence. */
  message: string;
}

/**
 * The gate for the two states in which the assistant cannot run: demo mode, and a deployment
 * without `ANTHROPIC_API_KEY`. The page shell stays visible; this replaces only the hero grid.
 *
 * It is a TILE, not a full-page panel: a locked assistant is an absence like any other, so it
 * reads at the same cadence as every other absence in the app — eyebrow, one sentence, one
 * action (DESIGN.md → The Absence-Has-Three-Names Rule).
 */
export function AssistantLockedState({ eyebrow, message }: AssistantLockedStateProps) {
  const router = useRouter();

  return (
    <Tile eyebrow={eyebrow} className="max-w-[560px]">
      <EmptyState
        className="mt-2"
        message={message}
        action={
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            Torna indietro
          </Button>
        }
      />
    </Tile>
  );
}
