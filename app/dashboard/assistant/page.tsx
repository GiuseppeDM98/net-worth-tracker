import { notFound } from 'next/navigation';
import { AssistantPageClient } from '@/components/assistant/AssistantPageClient';

/**
 * Assistente AI page.
 *
 * Feature flag: NEXT_PUBLIC_ASSISTANT_AI_ENABLED controls rollout.
 * When set to 'false', direct navigation returns 404 so no partial UI leaks.
 * Navigation items are also hidden by the same flag (see Sidebar, SecondaryMenuDrawer,
 * BottomNavigation). The flag defaults to enabled when the variable is absent.
 */
export default function AssistantPage() {
  if (process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED === 'false') {
    notFound();
  }

  return <AssistantPageClient assistantConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
