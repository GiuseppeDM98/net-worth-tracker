'use client';

import { useEffect, useState } from 'react';
import { buildWaitingPhrases, type AssistantWaitingStatus } from '@/lib/utils/assistantChatNarrative';
import type { AssistantRouteReading } from '@/types/assistant';

/** The next phrase every three seconds, in order, looping. */
export const WAITING_PHRASE_MS = 3_000;

/**
 * The answer's place while no text has arrived (owner, 2026-11-16: «come fai tu su Claude Code»):
 * a pulsing mark in the AI accent and one phrase at a time, from the reading and the server's
 * status (`buildWaitingPhrases`); the first chunk replaces it. Under reduced motion the mark and
 * the shimmer stand still and the phrases still turn — they are content, not motion. A screen
 * reader hears one sentence, once: the turning phrases are hidden from it, or the message list's
 * live region would read one every three seconds.
 */
export function AssistantWaiting({ reading, status }: { reading: AssistantRouteReading | null | undefined; status: AssistantWaitingStatus }) {
  const phrases = buildWaitingPhrases(reading, status);
  // A new list (the reading arrived, the web began) starts again from its first phrase.
  return <WaitingPhrases key={phrases.join('|')} phrases={phrases} />;
}

function WaitingPhrases({ phrases }: { phrases: string[] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (phrases.length < 2) return;
    const timer = setInterval(() => setTick((n) => n + 1), WAITING_PHRASE_MS);
    return () => clearInterval(timer);
  }, [phrases.length]);
  const phrase = phrases[tick % phrases.length];

  return (
    <span data-assistant-waiting className="inline-flex items-center gap-2 not-italic">
      <span aria-hidden="true" className="text-[color:var(--ai-accent)] motion-safe:animate-pulse">✦</span>
      <span key={phrase} aria-hidden="true" className="assistant-waiting-phrase text-muted-foreground">{phrase}</span>
      <span className="sr-only">L&apos;assistente sta preparando la risposta.</span>
    </span>
  );
}
